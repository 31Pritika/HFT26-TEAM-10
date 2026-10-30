"""Sends the organisation's first honeytoken to a provider, which must always raise a critical finding."""
from __future__ import annotations

from .. import fakes
from ..client import Context, process_info
from .base import Scenario, openai_body


def _canary(ctx: Context) -> str:
    tokens = (ctx.api_get("/policies") or {}).get("canary_tokens")
    return tokens[0] if tokens else fakes.DEFAULT_CANARY


def run(ctx: Context) -> None:
    prompt = f"Look up this internal reference for me: {_canary(ctx)}"
    for _ in range(ctx.intensity):
        ctx.exchange("/v1/chat/completions", openai_body(prompt), host="api.openai.com",
                     process=process_info("python3 ask_ai.py"))


SCENARIO = Scenario("canary_trip", "Honeytoken tripped", "The first policy canary token is sent to an AI provider.",
                    "bird", "critical", ("canary",), run)
