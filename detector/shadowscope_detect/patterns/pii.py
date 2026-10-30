"""Master §8.2 as data. Regexes follow the spec; deviations are listed in docs/progress/aaraadhyaa.md."""
from __future__ import annotations

import re

from . import TIER_INFRA, Rule

_COMPLIANCE = ("DPDP", "GDPR", "ISO27001")
_PURGE = ("Purge from AI provider history", "Notify DPO under DPDP Act 2023", "Enable masking in source system")


def _pii(id: str, pattern: str, severity: str, title: str, *, flags: int = re.ASCII,
         compliance: tuple[str, ...] = _COMPLIANCE, remediation: tuple[str, ...] = _PURGE, **kw) -> Rule:
    return Rule(id=id, type="pii", regex=re.compile(pattern, flags), severity=severity, title=title,
                compliance=compliance, remediation=remediation, **kw)


EMAIL = _pii(
    "email", r"(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+", "medium", "Customer email address", flags=0,
    validator="email", keywords=("@",), confidence=0.9, mask="email",
)
PHONE_IN = _pii(
    "phone_in", r"(?<![\w.+-])(?:\+91[\s-]?)?[6-9]\d{4}[ -]?\d{5}\b", "medium", "Indian mobile number",
    confidence=0.7,
)
PHONE_INTL = _pii(
    "phone_intl", r"(?<![\w)\]+])\+\d{1,3}(?:[ -]?\d){6,14}\b", "low", "International phone number",
    keywords=("+",), confidence=0.7,
)
AADHAAR = _pii(
    "aadhaar", r"(?<![\d-])\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b", "high", "Aadhaar number (Verhoeff valid)",
    validator="aadhaar", confidence=0.97, detector="validator", mask="aadhaar",
)
PAN = _pii(
    "pan", r"\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b", "high", "PAN number", validator="pan", confidence=0.9,
)
GSTIN = _pii(
    "gstin", r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b", "medium", "GSTIN", confidence=0.95,
)
UPI_ID = _pii(
    "upi_id", r"(?<![\w.-])[\w.-]{2,}@(?:okaxis|okhdfcbank|okicici|oksbi|ybl|paytm|upi|apl|ibl|axl)\b(?!\.\w)",
    "medium", "UPI ID", keywords=("@ok", "@ybl", "@paytm", "@upi", "@apl", "@ibl", "@axl"), confidence=0.9,
)
IFSC = _pii(
    "ifsc", r"\b[A-Z]{4}0[A-Z0-9]{6}\b", "low", "IFSC code", confidence=0.7,
)
PASSPORT_IN = _pii(
    "passport_in", r"\b[A-PR-WY][1-9]\d{6}\b", "medium", "Indian passport number", validator="passport",
    keywords=("passport",), confidence=0.85,
)
CREDIT_CARD = _pii(
    "credit_card", r"\b(?:\d[ -]?){13,19}\b", "critical", "Credit card number (Luhn valid)", validator="card",
    compliance=("DPDP", "GDPR", "ISO27001", "PCI-DSS"), confidence=0.95, detector="validator",
    remediation=("Purge from AI provider history", "Open a PCI-DSS incident review",
                 "Block card numbers at the gateway"),
)
US_SSN = _pii(
    "us_ssn", r"\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b", "high", "US social security number",
    confidence=0.85,
)
PRIVATE_IP = _pii(
    "private_ip", r"(?<![\w.])(?:10\.\d+|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d+\.\d+\b(?!\.?\d)", "low",
    "Internal IP address", validator="private_ip", keywords=("10.", "172.", "192.168."), tier=TIER_INFRA,
    confidence=0.8, remediation=("Remove internal addressing from prompts", "Restrict AI tool access to internal docs"),
)
INTERNAL_HOST = _pii(
    "internal_host",
    r"(?<![\w.-])[\w-]+(?:\.[\w-]+)*\.(?:internal|corp|intranet|local|lan)\b(?![\w-]|\.\w|\()", "low",
    "Internal hostname", validator="internal_host", tier=TIER_INFRA, confidence=0.75,
    keywords=(".internal", ".corp", ".intranet", ".local", ".lan"),
    remediation=("Remove internal hostnames from prompts", "Restrict AI tool access to internal docs"),
)
BULK_PII = Rule(
    id="bulk_pii", type="pii", regex=None, severity="high", title="Bulk customer PII in one payload",
    compliance=_COMPLIANCE, detector="heuristic", confidence=0.9,
    remediation=("Purge from AI provider history", "Notify DPO under DPDP Act 2023",
                 "Block bulk exports to AI tools"),
)

BULK_EMAILS = 5        # distinct addresses
BULK_IDENTITY_DOCS = 3  # distinct Aadhaar + PAN

PII_RULES: tuple[Rule, ...] = (
    EMAIL, PHONE_IN, PHONE_INTL, AADHAAR, PAN, GSTIN, UPI_ID, IFSC, PASSPORT_IN, CREDIT_CARD, US_SSN,
    PRIVATE_IP, INTERNAL_HOST,
)
