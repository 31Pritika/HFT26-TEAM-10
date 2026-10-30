from __future__ import annotations

from dataclasses import dataclass, field


class IngestError(Exception):
    """The upload cannot be read. The message is shown to the user."""


@dataclass
class Parsed:
    format: str
    observations: list[dict]
    warnings: list[str] = field(default_factory=list)
