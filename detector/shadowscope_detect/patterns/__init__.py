"""Detection rule tables. `Rule` is the row format shared by secrets.py and pii.py."""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..types import Detector, FindingType, Severity


@dataclass(frozen=True, slots=True)
class Rule:
    id: str                             # finding subtype
    type: FindingType
    regex: re.Pattern[str] | None       # None = not regex-driven (high_entropy_string, bulk_pii)
    severity: Severity
    title: str                          # format template, filled from the validator's Verdict.fields
    compliance: tuple[str, ...]
    remediation: tuple[str, ...]
    validator: str | None = None        # key into validators.VALIDATORS
    keywords: tuple[str, ...] = ()      # lowercase literals; the regex only runs if one is in the text
    value_groups: tuple[str, ...] = ()  # named groups holding the sensitive value (default: whole match)
    confidence: float = 0.9
    detector: Detector = "regex"
    mask: str = "default"               # key into redact.MASKERS
    tier: int = 2                       # overlap resolution: higher = more specific, wins regardless of severity


TIER_NAMED = 3    # provider/format-specific credential
TIER_DEFAULT = 2  # structured PII
TIER_GENERIC = 1  # keyword = value catch-all
TIER_INFRA = 0    # low-signal hosts and IPs: yield to anything that overlaps
