"""The shape of a scenario. Metadata mirrors master §6 `Scenario`; `run` does the work."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from ..client import Context


@dataclass(frozen=True, slots=True)
class Scenario:
    id: str
    name: str
    description: str
    icon: str         # lucide icon name
    severity: str
    tags: tuple[str, ...]
    run: Callable[[Context], None]

    def as_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "description": self.description, "icon": self.icon,
                "severity": self.severity, "tags": list(self.tags)}


def openai_body(prompt: str, **extra) -> dict:
    return {"model": "gpt-4o", "messages": [{"role": "user", "content": prompt}], **extra}
