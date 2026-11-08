import json
import logging
from typing import Any

logger = logging.getLogger("sensor_stream")


def log_sensor_payload(payload: Any) -> None:
    """Write the complete incoming JSON payload as readable console output."""
    logger.info(
        "Incoming sensor payload:\n%s",
        json.dumps(payload, indent=2, sort_keys=True),
    )
