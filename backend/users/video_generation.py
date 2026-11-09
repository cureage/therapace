"""Exposure videos for the conquer page, generated with Gemini Omni Flash.

POST /api/videos/ stores an AIVideo and queues it on a small in-process thread pool. The worker
makes the same Interactions API call as backend/test.py, saves the MP4 under MEDIA_ROOT and marks
the row ready. The app polls GET /api/videos/{id}/ and then streams GET /api/videos/{id}/stream/.

Generation runs inside the Gunicorn/Daphne process, so no extra services are needed. A restart
abandons in-flight generations; those rows are marked failed the next time the app polls them.
"""
import base64
import logging
import re
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from django.conf import settings
from django.core.files import File
from django.core.files.storage import default_storage
from django.db import IntegrityError, connections, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import AIVideo, Fear

logger = logging.getLogger(__name__)

MIN_INTENSITY, MAX_INTENSITY = 1, 5
MIN_DURATION_SECONDS, MAX_DURATION_SECONDS = 3, 60
# Large videos are delivered as a Gemini file URI that is downloadable once the file is ACTIVE.
FILE_READY_TIMEOUT_SECONDS = 300
FILE_POLL_SECONDS = 3

# The exposure ladder: each level brings the feared thing closer, more realistic and more
# immersive. The wording says "it" so it works for objects (spiders) and situations (heights).
INTENSITY_LEVELS = {
    1: ("gentle", "Show it in a soft, friendly, cartoon-like style, small and far away in a bright, "
                  "peaceful setting. It stays mostly still and is clearly harmless."),
    2: ("mild", "Show it realistically but at a comfortable distance, moving slowly and calmly, in "
                "warm natural daylight."),
    3: ("moderate", "Show it realistically and clearly at an everyday distance, with natural movement "
                    "and detail, from a steady camera."),
    4: ("strong", "Show it in a realistic close-up with lifelike detail. It moves naturally and "
                  "sometimes toward the camera, and the viewer's point of view is close to it."),
    5: ("intense", "Show it from an immersive first-person point of view right next to it, filling "
                   "much of the frame and moving toward the camera, with lifelike detail and sound."),
}

_CATEGORY_PATTERNS = (
    (Fear.Category.SPIDERS, re.compile(r"\bspiders?\b|arachn", re.IGNORECASE)),
    (Fear.Category.DOGS, re.compile(r"\bdogs?\b", re.IGNORECASE)),
    (Fear.Category.CLOWNS, re.compile(r"\bclowns?\b", re.IGNORECASE)),
)

_pool = None
_pool_lock = threading.Lock()


class VideoGenerationError(Exception):
    """A generation failure whose message is safe to show in the app."""


def is_configured():
    return bool(settings.GEMINI_VIDEO["API_KEY"])


def clip_seconds_for(duration_seconds):
    """Length of the generated clip; sessions longer than the model's limit loop it."""
    limit = settings.GEMINI_VIDEO["MAX_CLIP_SECONDS"]
    return max(MIN_DURATION_SECONDS, min(int(duration_seconds), limit))


def build_exposure_prompt(fear_name, intensity, *, loops, description=""):
    label, direction = INTENSITY_LEVELS[intensity]
    lines = [
        "Create a short video for a self-paced exposure therapy app that helps the viewer gradually "
        f"overcome a fear of {fear_name}.",
    ]
    if description:
        lines.append(f"In the viewer's own words: {' '.join(description.split())[:500]}")
    lines += [
        f"Exposure intensity {intensity} of 5 ({label}). {direction}",
        "Nothing bad happens: no attacks, injuries, blood, gore, screaming, jump scares or sudden intensity 5 should be photorealisic, but the lower levels can be more stylized or cartoon-like. The video should be immersive and realistic, but not shocking or traumatizing.",
        "The video should be calm and safe, with no sudden movements,",
        "loud noises, and nobody is in danger.",
        "The clip plays on a loop, so keep the camera steady, keep it in view the whole time and let "
        "the last moment flow naturally back into the first."
        if loops else
        "End on a calm, light-hearted moment, such as it doing something harmless or gently funny, "
        "so the viewer finishes feeling safe.",
        "Audio: natural ambient sound at a comfortable volume with soft, calming background music. "
        "No dialogue or narration.",
        "No on-screen text, captions or logos.",
    ]
    return "\n".join(lines)


def get_or_create_fear(user, name):
    """Fears on the app are free text, so match them to the user's Fear rows by name."""
    fear = (
        Fear.objects.filter(user=user, name__iexact=name)
        .order_by("-is_active", "created_at")
        .first()
    )
    if fear is None:
        category = next(
            (category for category, pattern in _CATEGORY_PATTERNS if pattern.search(name)),
            Fear.Category.OTHER,
        )
        fear = Fear.objects.create(user=user, name=name, category=category)
    return fear


def request_video(*, user, fear, intensity, duration_seconds, request_key=None):
    """Create the user's video and queue its generation.

    Repeating a request_key returns the video it created, so the app can retry safely without
    paying for a second generation.
    """
    if request_key:
        existing = _video_for_key(user, request_key)
        if existing is not None:
            return existing
    fear_obj = get_or_create_fear(user, fear)
    clip_seconds = clip_seconds_for(duration_seconds)
    try:
        with transaction.atomic():
            video = AIVideo.objects.create(
                fear=fear_obj,
                intensity=intensity,
                duration_seconds=duration_seconds,
                clip_duration_seconds=clip_seconds,
                prompt=build_exposure_prompt(
                    fear_obj.name,
                    intensity,
                    loops=duration_seconds > clip_seconds,
                    description=fear_obj.description,
                ),
                provider=settings.GEMINI_VIDEO["MODEL"][:50],
                request_key=request_key or None,
            )
    except IntegrityError:
        # A concurrent retry with the same key created it first.
        existing = _video_for_key(user, request_key) if request_key else None
        if existing is None:
            raise ValidationError({"request_key": "This request key has already been used."})
        return existing
    transaction.on_commit(lambda: _executor().submit(_generate_in_background, video.pk))
    return video


def expire_stale_videos(user):
    """Fail generations that a server restart abandoned, so the app stops waiting for them."""
    conf = settings.GEMINI_VIDEO
    cutoff = timezone.now() - timedelta(
        seconds=conf["TIMEOUT_SECONDS"] + FILE_READY_TIMEOUT_SECONDS + 60
    )
    stale = AIVideo.objects.filter(
        fear__user=user,
        status__in=(AIVideo.Status.PENDING, AIVideo.Status.GENERATING),
        created_at__lt=cutoff,
    )
    if stale.exists():  # check first: an UPDATE takes SQLite's write lock even when nothing matches
        stale.update(
            status=AIVideo.Status.FAILED,
            error_message="Video generation was interrupted. Please try again.",
        )


def generate_video(video_id):
    """Generate and store one video. Runs on a worker thread and records the outcome on the row."""
    claimed = AIVideo.objects.filter(pk=video_id, status=AIVideo.Status.PENDING).update(
        status=AIVideo.Status.GENERATING
    )
    if not claimed:
        return  # already handled, or expired while it waited in the queue
    video = AIVideo.objects.select_related("fear").get(pk=video_id)
    started = time.monotonic()
    try:
        name, interaction_id = _generate_and_store(video)
    except Exception as exc:
        logger.exception("Video %s failed after %.0f s", video_id, time.monotonic() - started)
        AIVideo.objects.filter(pk=video_id).update(
            status=AIVideo.Status.FAILED, error_message=_failure_message(exc)
        )
        return
    AIVideo.objects.filter(pk=video_id).update(
        status=AIVideo.Status.READY,
        video_file=name,
        external_job_id=interaction_id[:255],
        error_message="",
    )
    logger.info("Video %s ready in %.0f s", video_id, time.monotonic() - started)


def _video_for_key(user, request_key):
    return (
        AIVideo.objects.select_related("fear")
        .filter(fear__user=user, request_key=request_key)
        .first()
    )


def _executor():
    global _pool
    with _pool_lock:
        if _pool is None:
            _pool = ThreadPoolExecutor(
                max_workers=max(1, settings.GEMINI_VIDEO["MAX_CONCURRENT"]),
                thread_name_prefix="gemini-video",
            )
        return _pool


def _generate_in_background(video_id):
    try:
        generate_video(video_id)
    except Exception:
        logger.exception("Video %s: unexpected error in the generation worker", video_id)
    finally:
        connections.close_all()  # worker threads open their own database connections


def _generate_and_store(video):
    from google import genai  # the SDK is large and only needed on worker threads

    conf = settings.GEMINI_VIDEO
    client = genai.Client(api_key=conf["API_KEY"])
    interaction = client.interactions.create(
        model=conf["MODEL"],
        input=video.prompt,
        response_format={
            "type": "video",
            "duration": f"{video.clip_duration_seconds}s",
            "resolution": conf["RESOLUTION"],
            "aspect_ratio": conf["ASPECT_RATIO"],
            # Inline base64 output is meant for videos under 4 MB; a few seconds of 720p exceed that.
            "delivery": "uri",
        },
        timeout=conf["TIMEOUT_SECONDS"],
    )
    output = interaction.output_video
    if output is None or not (output.data or output.uri):
        detail = (interaction.output_text or "").strip()
        raise VideoGenerationError(
            f"Gemini finished ({interaction.status}) without returning a video."
            + (f" {detail[:300]}" if detail else "")
        )

    with tempfile.TemporaryFile() as buffer:
        if output.data:
            buffer.write(base64.b64decode(output.data))
        else:
            _wait_until_downloadable(client, output.uri)
            client.files.download(file=output.uri, destination=buffer)
        if buffer.tell() == 0:
            raise VideoGenerationError("Gemini returned an empty video file.")
        buffer.seek(0)
        name = default_storage.save(
            f"exposure_videos/{video.fear.user_id}/{uuid.uuid4().hex}.mp4", File(buffer)
        )
    return name, interaction.id or ""


def _wait_until_downloadable(client, uri):
    deadline = time.monotonic() + FILE_READY_TIMEOUT_SECONDS
    while True:
        state = getattr(client.files.get(name=uri).state, "name", None)
        if state == "FAILED":
            raise VideoGenerationError("Gemini could not finish processing the video file.")
        if state != "PROCESSING":
            return
        if time.monotonic() >= deadline:
            raise VideoGenerationError("Timed out waiting for Gemini to finish the video file.")
        time.sleep(FILE_POLL_SECONDS)


def _failure_message(exc):
    if isinstance(exc, VideoGenerationError):
        return str(exc)
    if getattr(exc, "status_code", None) == 429:
        return "Gemini is handling too many requests right now. Please try again in a minute."
    message = getattr(exc, "message", None) or str(exc) or exc.__class__.__name__
    return f"Gemini could not create this video: {message}"[:500]
