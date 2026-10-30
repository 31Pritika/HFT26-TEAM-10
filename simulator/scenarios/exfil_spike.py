"""40 rapid 200 KB uploads from one process. The body is dull on purpose: this scenario is about volume, not content."""
from __future__ import annotations

from ..client import Context, process_info
from .base import Scenario, openai_body

PAYLOADS = 40
PAYLOAD_BYTES = 200 * 1024
_LINE = "row,status=ok,region=ap-south,batch=nightly\n"
_PREVIEW = "Summarise this batch export.\n" + _LINE * 3


def run(ctx: Context) -> None:
    body = openai_body("Summarise this batch export.\n" + _LINE * (PAYLOAD_BYTES // len(_LINE)))
    process = process_info("python3 batch_uploader.py")
    for _ in range(PAYLOADS * ctx.intensity):
        ctx.exchange("/v1/chat/completions", body, host="api.openai.com", process=process, body_preview=_PREVIEW)


SCENARIO = Scenario("exfil_spike", "Exfiltration volume spike", "40 rapid 200 KB payloads leave from one process.",
                    "trending-up", "high", ("exfil", "anomaly"), run)
