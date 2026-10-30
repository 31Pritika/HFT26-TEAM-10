"""AI process signatures (master §7, bottom). Name → (framework, category)."""
from __future__ import annotations

import re

# Case matters only here: the `Claude` desktop app is a chat client, the `claude` CLI is a coding agent.
EXACT_NAMES: dict[str, tuple[str | None, str]] = {
    "Claude": (None, "ai_saas"),
    "claude": ("claude_code", "ai_coding"),
}
NAMES: dict[str, tuple[str | None, str]] = {
    "cursor": ("cursor", "ai_coding"),
    "cursor helper": ("cursor", "ai_coding"),
    "windsurf": (None, "ai_coding"),
    "aider": ("aider", "ai_coding"),
    "goose": ("custom", "ai_coding"),
    "interpreter": ("open_interpreter", "ai_coding"),
    "ollama": (None, "local_llm"),
    "lm studio": (None, "local_llm"),
    "jan": (None, "local_llm"),
    "gpt4all": (None, "local_llm"),
    "chatgpt": (None, "ai_saas"),
}
RUNTIME = re.compile(r"(?:python|node)", re.IGNORECASE)
CMDLINE_KEYWORDS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"langchain|langgraph", re.IGNORECASE), "langchain"),
    (re.compile(r"autogpt", re.IGNORECASE), "autogpt"),
    (re.compile(r"crewai", re.IGNORECASE), "crewai"),
    (re.compile(r"llama_index|\bopenai\b|\banthropic\b", re.IGNORECASE), "custom"),
    # user-agent and ssh-agent have nothing to do with AI.
    (re.compile(r"(?<![a-z])(?<!user-)(?<!ssh-)agent(?![a-z])", re.IGNORECASE), "custom"),
)
