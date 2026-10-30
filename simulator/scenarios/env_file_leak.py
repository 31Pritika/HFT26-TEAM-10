"""A developer pastes a whole .env into a chat. It only ever reaches the mock provider."""
from __future__ import annotations

from .. import fakes
from ..client import Context, process_info
from .base import Scenario, openai_body


def run(ctx: Context) -> None:
    prompt = f"Why does this .env not load?\n\n{fakes.env_file()}"
    for _ in range(ctx.intensity):
        ctx.exchange("/v1/chat/completions", openai_body(prompt), host="api.openai.com",
                     process=process_info("python3 ask_ai.py"))


SCENARIO = Scenario("env_file_leak", "Developer pastes .env",
                    "A .env with fake AWS, OpenAI, Stripe and database secrets goes to the mock provider.", "key-round",
                    "critical", ("secrets",), run)
