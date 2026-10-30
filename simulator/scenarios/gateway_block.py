"""The .env leak through Part A's gateway, which must stop it with a 403.

The gateway forwards to the REAL provider unless a critical finding blocks the request, so this scenario is the one
place fake secrets could leave the machine. It fails closed: unless every preflight check passes, nothing goes to the
gateway.
"""
from __future__ import annotations

from shadowscope_detect import scan_text

from .. import fakes
from ..client import Context, process_info
from .base import Scenario, openai_body

GATEWAY_HOST = "127.0.0.1"
GATEWAY_PORT = 8789
GATEWAY_URL = f"http://{GATEWAY_HOST}:{GATEWAY_PORT}/openai/v1/chat/completions"


def preflight(ctx: Context, body_text: str) -> str | None:
    """Why this payload must not be sent, or None if the gateway is sure to block it."""
    if not any(finding["severity"] == "critical" for finding in scan_text(body_text)["findings"]):
        return "the detector does not rate this payload critical"
    policy = ctx.api_get("/policies")
    if policy is None:
        return "the backend policy could not be read"
    if policy.get("block_on_critical", True) is not True:
        return "block_on_critical is off, so the gateway would forward to the real provider"
    return None


def _report(ctx: Context, body: dict, tag: str) -> None:
    dest = {"host": GATEWAY_HOST, "port": GATEWAY_PORT, "path": "/openai/v1/chat/completions", "protocol": "http"}
    ctx.report({"process": process_info("python3 ask_ai.py"), "method": "POST", "dest": dest,
                "body_text": body["messages"][0]["content"], "meta": {"tags": [tag]}})


def run(ctx: Context) -> None:
    prompt = f"Why does this .env not load?\n\n{fakes.env_file()}"
    body = openai_body(prompt)
    for _ in range(ctx.intensity):
        reason = "dry run" if ctx.dry_run else preflight(ctx, prompt)
        if reason:
            ctx.say(f"not sent to the gateway: {reason}")
            _report(ctx, body, "gateway-skipped")
            continue
        response = ctx.send(GATEWAY_URL, body)
        if response is None:
            ctx.say("gateway is not running, reporting the observation instead")
            _report(ctx, body, "gateway-skipped")
        elif response.status_code == 403:
            ctx.say(f"blocked by the gateway: {response.text}")  # the gateway records this itself
        else:
            ctx.say(f"WARNING: gateway answered {response.status_code}, not 403. It may have FORWARDED fake secrets.")
            _report(ctx, body, "gateway-not-blocked")


SCENARIO = Scenario("gateway_block", "Gateway blocks a leak",
                    "The .env leak goes through the Local Gateway and is stopped with a 403.", "shield-x", "critical",
                    ("gateway", "secrets"), run)
