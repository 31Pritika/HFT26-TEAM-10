"""A confidential module with a hardcoded token goes out for code review, in Anthropic's wire format."""
from __future__ import annotations

from .. import fakes
from ..client import Context, process_info
from .base import Scenario


def run(ctx: Context) -> None:
    body = {"model": "claude-sonnet-5-5", "max_tokens": 1024,
            "messages": [{"role": "user", "content": f"Review this module:\n\n{fakes.proprietary_module()}"}]}
    for _ in range(ctx.intensity):
        ctx.exchange("/v1/messages", body, host="api.anthropic.com", process=process_info("python3 code_review.py"))


SCENARIO = Scenario("proprietary_code", "Proprietary code review",
                    "A confidential Python module with a hardcoded JWT goes to the mock Anthropic API.", "file-code",
                    "high", ("source-code", "secrets"), run)
