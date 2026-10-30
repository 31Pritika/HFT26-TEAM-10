"""Masking rules (spec B1) and span application.

`redact(text)` itself lives in the package root, because knowing what to mask requires a scan.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, NamedTuple

MASK_CHAR = "•"
_MAX_BULLETS = 40      # a private key should not turn into 3 KB of bullets
_FULL_MASK_MIN = 12    # below this, first 4 + last 2 would reveal most of the value


def mask_value(value: str) -> str:
    """Keep the first 4 and last 2 characters, or only 1 + 1 for short values such as passwords and PANs."""
    head, tail = (4, 2) if len(value) >= _FULL_MASK_MIN else (1, 1) if len(value) >= 4 else (0, 0)
    bullets = min(max(len(value) - head - tail, 2), _MAX_BULLETS)
    return value[:head] + MASK_CHAR * bullets + value[len(value) - tail:]


def mask_email(value: str) -> str:
    local, _, domain = value.rpartition("@")
    return f"{local[0]}{MASK_CHAR * 3}@{domain[0]}{MASK_CHAR * 3}.{domain.rsplit('.', 1)[-1]}"


def mask_aadhaar(value: str) -> str:
    return f"XXXX XXXX {value[-4:]}"


MASKERS = {"default": mask_value, "email": mask_email, "aadhaar": mask_aadhaar}


@dataclass(frozen=True, slots=True)
class Span:
    start: int
    end: int
    mask: str = "default"


class Region(NamedTuple):
    """A masked stretch, in both raw and redacted coordinates."""
    start: int
    end: int
    redacted_start: int
    redacted_end: int


def merge_spans(spans: Iterable[Span]) -> list[Span]:
    """Union overlapping spans. An outer span keeps its mask; a partial overlap falls back to the default mask."""
    merged: list[Span] = []
    for span in sorted(spans, key=lambda s: (s.start, -s.end)):
        if merged and span.start < merged[-1].end:
            if span.end > merged[-1].end:
                merged[-1] = Span(merged[-1].start, span.end)
        else:
            merged.append(span)
    return merged


def apply_masks(text: str, spans: Iterable[Span]) -> tuple[str, list[Region]]:
    """Return `text` with every span masked, plus the sorted regions mapping raw to redacted offsets."""
    pieces: list[str] = []
    regions: list[Region] = []
    cursor = length = 0
    for span in merge_spans(spans):
        clear = text[cursor:span.start]
        masked = MASKERS[span.mask](text[span.start:span.end])
        pieces += (clear, masked)
        redacted_start = length + len(clear)
        length = redacted_start + len(masked)
        regions.append(Region(span.start, span.end, redacted_start, length))
        cursor = span.end
    pieces.append(text[cursor:])
    return "".join(pieces), regions
