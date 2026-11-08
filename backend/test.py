import base64
import os
from pathlib import Path

from google import genai


def main() -> None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("Set the GEMINI_API_KEY environment variable before running this script.")

    client = genai.Client(api_key=api_key)
    interaction = client.interactions.create(
        model="gemini-omni-flash-preview",
        input="Generate a photorealistic video to help me get over my fear of Clowns. The clown should make me scared at first, but then it should do something cute and funny to make me laugh.",
        response_format={
            "type": "video",
            "resolution": "720p",
            "duration": "3s",
            "aspect_ratio": "16:9",
        },
    )

    video = interaction.output_video
    if video is None or not video.data:
        raise RuntimeError("The interaction completed without returning video data.")

    output_path = Path("spider_help.mp4")
    output_path.write_bytes(base64.b64decode(video.data))
    print(f"Success! Video saved as '{output_path}'")


if __name__ == "__main__":
    main()
