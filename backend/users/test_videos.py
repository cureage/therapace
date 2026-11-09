import base64
import shutil
import tempfile
import time
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase
from rest_framework.throttling import ScopedRateThrottle

from . import video_generation
from .models import AIVideo, Fear, User

GEMINI_TEST_SETTINGS = {
    "API_KEY": "test-key",
    "MODEL": "gemini-omni-flash-preview",
    "RESOLUTION": "720p",
    "ASPECT_RATIO": "9:16",
    "MAX_CLIP_SECONDS": 15,
    "TIMEOUT_SECONDS": 600,
    "MAX_CONCURRENT": 1,
}


def body(response):
    if response.streaming:
        return b"".join(response.streaming_content)  # also closes the file
    return response.content


def interaction(output_video, *, status="completed", output_text=""):
    return SimpleNamespace(
        id="interaction-1", status=status, output_video=output_video, output_text=output_text
    )


def gemini_file(state):
    return SimpleNamespace(state=SimpleNamespace(name=state))


class IsolatedMediaMixin:
    def setUp(self):
        super().setUp()
        media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media_root, ignore_errors=True)
        overrides = override_settings(MEDIA_ROOT=media_root, GEMINI_VIDEO=GEMINI_TEST_SETTINGS)
        overrides.enable()
        self.addCleanup(overrides.disable)
        cache.clear()  # rate-limit history lives in the cache


class ExposureVideoRequestTests(IsolatedMediaMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(email="brave@example.com", password="test-pass-123")
        self.client.force_authenticate(self.user)

    def post_video(self, **overrides):
        payload = {"fear": "Spiders", "intensity": 2, "duration_seconds": 40, **overrides}
        with patch.object(video_generation, "_executor") as executor, \
                self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/videos/", payload, format="json")
        return response, executor.return_value.submit

    def test_long_sessions_queue_a_looping_clip_at_the_model_limit(self):
        response, submit = self.post_video()

        self.assertEqual(response.status_code, 202)
        video = AIVideo.objects.get(pk=response.data["id"])
        self.assertEqual(video.status, AIVideo.Status.PENDING)
        self.assertEqual((video.duration_seconds, video.clip_duration_seconds), (40, 15))
        self.assertEqual(video.fear.user, self.user)
        self.assertEqual(video.provider, "gemini-omni-flash-preview")
        self.assertIn("fear of Spiders", video.prompt)
        self.assertIn("intensity 2 of 5 (mild)", video.prompt)
        self.assertIn("plays on a loop", video.prompt)
        self.assertEqual(response.data["fear_name"], "Spiders")
        self.assertIsNone(response.data["stream_url"])
        submit.assert_called_once_with(video_generation._generate_in_background, video.pk)

    def test_short_sessions_generate_a_clip_of_the_requested_length(self):
        response, _ = self.post_video(duration_seconds=7, intensity=5)

        video = AIVideo.objects.get(pk=response.data["id"])
        self.assertEqual(video.clip_duration_seconds, 7)
        self.assertIn("intensity 5 of 5 (intense)", video.prompt)
        self.assertNotIn("plays on a loop", video.prompt)

    def test_fears_are_matched_by_name_and_free_text_fears_are_created(self):
        clowns = Fear.objects.create(
            user=self.user, name="Clowns", category="Clowns", initial_severity=6
        )

        reused, _ = self.post_video(fear="clowns")
        created, _ = self.post_video(fear="  Deep   water ")

        self.assertEqual(reused.data["fear"], clowns.pk)
        deep_water = Fear.objects.get(pk=created.data["fear"])
        self.assertIsNone(deep_water.initial_severity)

    def test_out_of_range_requests_are_rejected(self):
        for field, value in (
            ("intensity", 0), ("intensity", 6), ("duration_seconds", 2),
            ("duration_seconds", 61), ("fear", "   "),
        ):
            with self.subTest(field=field, value=value):
                response, submit = self.post_video(**{field: value})
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
                submit.assert_not_called()
        self.assertFalse(AIVideo.objects.exists())

    def test_retrying_a_request_key_returns_the_same_video(self):
        first, _ = self.post_video(request_key="attempt-1")
        retry, retry_submit = self.post_video(request_key="attempt-1")

        self.assertEqual(retry.status_code, 202)
        self.assertEqual(retry.data["id"], first.data["id"])
        self.assertEqual(AIVideo.objects.count(), 1)
        retry_submit.assert_not_called()

    def test_request_keys_are_scoped_to_their_owner(self):
        self.post_video(request_key="shared-key")
        other = User.objects.create_user(email="other@example.com", password="test-pass-123")
        self.client.force_authenticate(other)

        response, submit = self.post_video(request_key="shared-key")

        self.assertEqual(response.status_code, 400)
        self.assertIn("request_key", response.data)
        submit.assert_not_called()

    @override_settings(GEMINI_VIDEO={**GEMINI_TEST_SETTINGS, "API_KEY": ""})
    def test_requests_fail_clearly_when_gemini_is_not_configured(self):
        with self.assertLogs("django.request", level="ERROR"):  # Django logs every 5xx response
            response, submit = self.post_video()

        self.assertEqual(response.status_code, 503)
        submit.assert_not_called()
        self.assertFalse(AIVideo.objects.exists())

    def test_video_requests_are_rate_limited_but_polling_is_not(self):
        with patch.dict(ScopedRateThrottle.THROTTLE_RATES, {"video_generation": "2/hour"}):
            statuses = [self.post_video()[0].status_code for _ in range(3)]
            video_id = AIVideo.objects.first().pk
            polls = [self.client.get(f"/api/videos/{video_id}/").status_code for _ in range(3)]

        self.assertEqual(statuses, [202, 202, 429])
        self.assertEqual(polls, [200, 200, 200])

    def test_authentication_is_required(self):
        self.client.force_authenticate(user=None)

        response, _ = self.post_video()

        self.assertEqual(response.status_code, 401)

    def test_abandoned_generations_fail_when_polled(self):
        response, _ = self.post_video()
        AIVideo.objects.filter(pk=response.data["id"]).update(
            status=AIVideo.Status.GENERATING, created_at=timezone.now() - timedelta(hours=1)
        )

        polled = self.client.get(f"/api/videos/{response.data['id']}/")

        self.assertEqual(polled.data["status"], AIVideo.Status.FAILED)
        self.assertIn("interrupted", polled.data["error_message"])


class BackgroundGenerationTests(IsolatedMediaMixin, TransactionTestCase):
    """Request → worker thread → poll → stream, with only the Gemini client faked."""

    def test_requested_video_is_generated_in_the_background_and_streamed(self):
        user = User.objects.create_user(email="e2e@example.com", password="test-pass-123")
        api = APIClient()
        api.force_authenticate(user)
        gemini = MagicMock()
        gemini.interactions.create.return_value = interaction(
            SimpleNamespace(data=base64.b64encode(b"0123456789").decode(), uri=None)
        )

        with patch("google.genai.Client", return_value=gemini):
            created = api.post(
                "/api/videos/",
                {"fear": "Heights", "intensity": 4, "duration_seconds": 30},
                format="json",
            )
            deadline = time.monotonic() + 10
            polled = api.get(f"/api/videos/{created.data['id']}/")
            while polled.data["status"] in ("pending", "generating") and time.monotonic() < deadline:
                time.sleep(0.05)
                polled = api.get(f"/api/videos/{created.data['id']}/")

        self.assertEqual(created.status_code, 202)
        self.assertEqual(polled.data["status"], AIVideo.Status.READY, polled.data["error_message"])
        self.assertEqual(polled.data["clip_duration_seconds"], 15)
        self.assertEqual(
            gemini.interactions.create.call_args.kwargs["response_format"]["duration"], "15s"
        )
        streamed = api.get(polled.data["stream_url"], HTTP_RANGE="bytes=2-5")
        self.assertEqual(streamed.status_code, 206)
        self.assertEqual(body(streamed), b"2345")


class GenerateVideoTests(IsolatedMediaMixin, TestCase):
    def setUp(self):
        super().setUp()
        user = User.objects.create_user(email="gen@example.com", password="test-pass-123")
        fear = Fear.objects.create(user=user, name="Spiders", category="Spiders")
        self.video = AIVideo.objects.create(
            fear=fear, intensity=3, prompt="exposure prompt",
            duration_seconds=10, clip_duration_seconds=10,
        )

    def generate(self, client):
        with patch("google.genai.Client", return_value=client) as client_class, \
                patch.object(video_generation.time, "sleep"):
            video_generation.generate_video(self.video.pk)
        self.video.refresh_from_db()
        return client_class

    def test_inline_video_is_saved_and_marked_ready(self):
        client = MagicMock()
        client.interactions.create.return_value = interaction(
            SimpleNamespace(data=base64.b64encode(b"inline-mp4").decode(), uri=None)
        )

        client_class = self.generate(client)

        client_class.assert_called_once_with(api_key="test-key")
        client.interactions.create.assert_called_once_with(
            model="gemini-omni-flash-preview",
            input="exposure prompt",
            response_format={
                "type": "video", "duration": "10s", "resolution": "720p",
                "aspect_ratio": "9:16", "delivery": "uri",
            },
            timeout=600,
        )
        self.assertEqual(self.video.status, AIVideo.Status.READY)
        self.assertEqual(self.video.external_job_id, "interaction-1")
        with self.video.video_file.open("rb") as stored:
            self.assertEqual(stored.read(), b"inline-mp4")

    def test_uri_video_is_downloaded_once_the_file_is_active(self):
        uri = "https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media"
        client = MagicMock()
        client.interactions.create.return_value = interaction(SimpleNamespace(data=None, uri=uri))
        client.files.get.side_effect = [gemini_file("PROCESSING"), gemini_file("ACTIVE")]
        client.files.download.side_effect = lambda file, destination: destination.write(b"uri-mp4")

        self.generate(client)

        self.assertEqual(client.files.get.call_count, 2)
        self.assertEqual(client.files.download.call_args.kwargs["file"], uri)
        self.assertEqual(self.video.status, AIVideo.Status.READY)
        with self.video.video_file.open("rb") as stored:
            self.assertEqual(stored.read(), b"uri-mp4")

    def test_api_errors_mark_the_video_failed(self):
        client = MagicMock()
        client.interactions.create.side_effect = RuntimeError("quota exceeded")

        with self.assertLogs("users.video_generation", level="ERROR"):
            self.generate(client)

        self.assertEqual(self.video.status, AIVideo.Status.FAILED)
        self.assertIn("quota exceeded", self.video.error_message)
        self.assertFalse(self.video.video_file)

    def test_a_response_without_video_marks_the_video_failed(self):
        client = MagicMock()
        client.interactions.create.return_value = interaction(
            None, status="failed", output_text="The prompt was blocked."
        )

        with self.assertLogs("users.video_generation", level="ERROR"):
            self.generate(client)

        self.assertEqual(self.video.status, AIVideo.Status.FAILED)
        self.assertIn("without returning a video", self.video.error_message)
        self.assertIn("The prompt was blocked.", self.video.error_message)

    def test_videos_that_are_no_longer_pending_are_skipped(self):
        AIVideo.objects.filter(pk=self.video.pk).update(status=AIVideo.Status.FAILED)
        client = MagicMock()

        self.generate(client)

        client.interactions.create.assert_not_called()
        self.assertEqual(self.video.status, AIVideo.Status.FAILED)


class VideoStreamTests(IsolatedMediaMixin, APITestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(email="viewer@example.com", password="test-pass-123")
        self.client.force_authenticate(self.user)
        fear = Fear.objects.create(user=self.user, name="Dogs", category="Dogs")
        self.video = AIVideo.objects.create(
            fear=fear, intensity=1, prompt="p", status=AIVideo.Status.READY,
            duration_seconds=5, clip_duration_seconds=5,
        )
        self.video.video_file.save("clip.mp4", ContentFile(b"0123456789"))
        self.url = f"/api/videos/{self.video.pk}/stream/"

    def get(self, range_header=None, **extra):
        if range_header:
            extra["HTTP_RANGE"] = range_header
        response = self.client.get(self.url, **extra)
        return response, body(response)

    def test_whole_file_is_streamed_with_range_support_advertised(self):
        response, content = self.get()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(content, b"0123456789")
        self.assertEqual(response["Content-Type"], "video/mp4")
        self.assertEqual(response["Accept-Ranges"], "bytes")

    def test_byte_ranges_return_partial_content(self):
        for header, expected, content_range in (
            ("bytes=0-1", b"01", "bytes 0-1/10"),
            ("bytes=4-", b"456789", "bytes 4-9/10"),
            ("bytes=-3", b"789", "bytes 7-9/10"),
            ("bytes=8-100", b"89", "bytes 8-9/10"),
        ):
            with self.subTest(header=header):
                response, content = self.get(header)
                self.assertEqual(response.status_code, 206)
                self.assertEqual(content, expected)
                self.assertEqual(response["Content-Range"], content_range)
                self.assertEqual(response["Content-Length"], str(len(expected)))

    def test_unsatisfiable_ranges_return_416_and_malformed_ones_are_ignored(self):
        response, _ = self.get("bytes=10-")
        self.assertEqual(response.status_code, 416)
        self.assertEqual(response["Content-Range"], "bytes */10")

        for header in ("bytes=5-2", "bytes=0-1,4-5", "items=0-1"):
            with self.subTest(header=header):
                response, content = self.get(header)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(content, b"0123456789")

    def test_players_that_ask_for_video_content_are_served(self):
        response, content = self.get("bytes=0-1", HTTP_ACCEPT="video/mp4")

        self.assertEqual(response.status_code, 206)
        self.assertEqual(content, b"01")

    def test_ready_videos_report_their_stream_url(self):
        response = self.client.get(f"/api/videos/{self.video.pk}/")

        self.assertEqual(response.data["stream_url"], f"http://testserver{self.url}")

    def test_unfinished_and_other_users_videos_are_not_streamed(self):
        AIVideo.objects.filter(pk=self.video.pk).update(status=AIVideo.Status.GENERATING)
        response, _ = self.get()
        self.assertEqual(response.status_code, 409)

        other = User.objects.create_user(email="other@example.com", password="test-pass-123")
        self.client.force_authenticate(other)
        response, _ = self.get()
        self.assertEqual(response.status_code, 404)

        self.client.force_authenticate(user=None)
        response, _ = self.get()
        self.assertEqual(response.status_code, 401)
