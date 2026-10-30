"""A chat with a real local Ollama, with an email and an internal hostname. Uses the mock if none is running."""
from __future__ import annotations

from ..client import MOCK_URL, OLLAMA_URL, Context, process_info
from .base import Scenario

PROMPT = "Summarise this note: priya.fake@example.com says db01.prod.internal is out of disk space again."


def run(ctx: Context) -> None:
    model = ctx.ollama_model()
    if not model:
        ctx.say("no Ollama running, using the mock provider instead")
    body = {"model": model or "llama3.2:3b", "stream": False, "messages": [{"role": "user", "content": PROMPT}]}
    for _ in range(ctx.intensity):
        ctx.exchange("/api/chat", body, host="localhost", process=process_info("python3 notes_helper.py"),
                     base_url=OLLAMA_URL if model else MOCK_URL, tags=["ollama"] if model else ["mock"])


SCENARIO = Scenario("local_llm_chat", "Real local Ollama chat",
                    "A real Ollama request containing an email and an internal hostname.", "cpu", "medium",
                    ("local-llm", "pii"), run)
