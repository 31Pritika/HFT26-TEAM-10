"""Pure checks (Luhn, Verhoeff, PAN, JWT...) plus the `VALIDATORS` registry the rule tables refer to by name.

A registry entry takes `(value, text, start)` and returns a `Verdict`, or None to reject the candidate.
"""
from __future__ import annotations

import base64
import json
import re
import time
from dataclasses import dataclass, field
from typing import Callable

from .entropy import shannon
from .types import Severity

_ASCII_DIGIT = re.compile(r"[0-9]+")


@dataclass(slots=True)
class Verdict:
    severity: Severity | None = None    # overrides the rule's severity
    confidence: float | None = None     # overrides the rule's confidence
    fields: dict[str, str] = field(default_factory=dict)  # fills the rule's title template
    detail: str = ""                    # extra sentence for the description; must not contain raw values
    span: tuple[int, int] | None = None  # corrected absolute span, when it differs from the regex match


# --- Luhn + IIN ---------------------------------------------------------------------------------------------------

def luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = ord(ch) - 48
        if i % 2:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def card_brand(digits: str) -> str | None:
    """Issuer for a card number by IIN prefix (master §8.2), or None if no known issuer matches."""
    if digits[:1] == "4":
        return "visa"
    if digits[:2] in ("34", "37"):
        return "amex"
    if digits[:4] == "6011":
        return "discover"
    if digits[:4] in ("6521", "6522") or digits[:2] in ("60", "81", "82"):
        return "rupay"
    if digits[:2] == "65":
        return "discover"
    if "51" <= digits[:2] <= "55" or "2221" <= digits[:4] <= "2720":
        return "mastercard"
    return None


CARD_LENGTHS = {"visa": (19, 16, 13), "mastercard": (16,), "amex": (15,), "discover": (19, 16), "rupay": (16,)}


def find_card(raw: str) -> tuple[str, int, int] | None:
    """Find a valid card in a run of digit groups; returns (brand, start, end).

    The card regex is greedy, so it also swallows neighbouring numbers ("4111111111111111 12/26"). Every group
    start and issuer length is tried so a card next to other digits is not lost.
    """
    groups = [m for m in _ASCII_DIGIT.finditer(raw)]
    digits = "".join(m.group() for m in groups)
    positions = [m.start() + i for m in groups for i in range(len(m.group()))]
    offset = 0
    for group in groups:
        rest = digits[offset:]
        brand = card_brand(rest)
        for length in CARD_LENGTHS.get(brand, ()):
            if length <= len(rest) and luhn(rest[:length]):
                start, end = positions[offset], positions[offset + length - 1] + 1
                if all(len(g) >= 3 for g in re.split(r"[ -]", raw[start:end])):
                    return brand, start, end
        offset += len(group.group())
    return None


# --- Verhoeff (Aadhaar) -------------------------------------------------------------------------------------------

_VERHOEFF_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9), (1, 2, 3, 4, 0, 6, 7, 8, 9, 5), (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7), (4, 0, 1, 2, 3, 9, 5, 6, 7, 8), (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2), (7, 6, 5, 9, 8, 2, 1, 0, 4, 3), (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_VERHOEFF_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9), (1, 5, 7, 6, 2, 8, 3, 0, 9, 4), (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7), (9, 4, 5, 3, 1, 2, 6, 8, 7, 0), (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5), (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)
_VERHOEFF_INV = (0, 4, 3, 2, 1, 5, 6, 7, 8, 9)


def _verhoeff_state(digits: str, start: int) -> int:
    c = 0
    for i, ch in enumerate(reversed(digits), start):
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][ord(ch) - 48]]
    return c


def verhoeff(digits: str) -> bool:
    return _verhoeff_state(digits, 0) == 0


def verhoeff_check_digit(digits: str) -> str:
    """The digit that makes `digits + result` Verhoeff-valid (used to build fake Aadhaar numbers)."""
    return str(_VERHOEFF_INV[_verhoeff_state(digits, 1)])


# --- PAN ----------------------------------------------------------------------------------------------------------

PAN_ENTITY_CHARS = frozenset("ABCFGHLJPT")


def pan_valid(pan: str) -> bool:
    return len(pan) == 10 and pan[3] in PAN_ENTITY_CHARS


# --- JWT ----------------------------------------------------------------------------------------------------------

def _b64_json(segment: str) -> dict | None:
    try:
        decoded = json.loads(base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)))
    except (ValueError, RecursionError):
        return None
    return decoded if isinstance(decoded, dict) else None


def decode_jwt(token: str) -> tuple[dict, dict] | None:
    """(header, claims) of a JWT, without verifying the signature; None if either part is not base64url JSON."""
    parts = token.split(".")
    if len(parts) != 3:
        return None
    header, claims = _b64_json(parts[0]), _b64_json(parts[1])
    return None if header is None or claims is None else (header, claims)


def jwt_expired(claims: dict, now: float | None = None) -> bool:
    exp = claims.get("exp")
    if isinstance(exp, bool) or not isinstance(exp, (int, float)):
        return False
    return exp < (time.time() if now is None else now)


# --- API key disambiguation ---------------------------------------------------------------------------------------

def stripe_mode(key: str) -> str:
    return "live" if "_live_" in key[:8] else "test"


def is_openai_key(key: str) -> bool:
    """`sk-` minus Anthropic keys and hyphenated names like sk-learn-contrib-imbalanced-datasets."""
    return not key.startswith("sk-ant-") and not re.fullmatch(r"sk(?:-[a-z]+)+", key)


# --- Placeholder values -------------------------------------------------------------------------------------------

_TEMPLATE_VALUE = re.compile(
    r"""^(?:\$\{.*\}|\$\(.*\)|(?-i:\$[A-Z_][A-Z0-9_]*)|\{\{.*\}\}|<.*>|\[.*\]|%\(?\w*\)?s?|\*+|[xX]+|\.+)$"""
    r"""|^your[_-]|[_-]here$|^(?:undefined|changeme|placeholder|redacted)$""",
    re.IGNORECASE,
)
_CODE_VALUE = re.compile(r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+|^[A-Za-z_]\w*[(\[]")


def is_placeholder(value: str) -> bool:
    """True for template references and "your-key-here" stand-ins: nothing real was exposed.

    FAKE/EXAMPLE markers do not count: they are triage's concern (spec B4), the scanner must still flag them.
    """
    return bool(_TEMPLATE_VALUE.search(value))


# --- Registry adapters --------------------------------------------------------------------------------------------

def _openai_key(value: str, text: str, start: int) -> Verdict | None:
    return Verdict() if is_openai_key(value) else None


def _stripe_key(value: str, text: str, start: int) -> Verdict:
    mode = stripe_mode(value)
    return Verdict(severity="critical" if mode == "live" else "medium", fields={"mode": mode.capitalize()})


def _jwt(value: str, text: str, start: int) -> Verdict:
    decoded = decode_jwt(value)
    if decoded is None:
        return Verdict(confidence=0.6, fields={"claims": ""}, detail="Header or claims did not decode.")
    header, claims = decoded
    alg = re.sub(r"[^\w-]", "", str(header.get("alg", "unknown")))[:16]
    verdict = Verdict(fields={"claims": f" (alg={alg}, sub=redacted)"})
    parts = [f"alg={alg}"]
    if isinstance(claims.get("exp"), (int, float)) and not isinstance(claims["exp"], bool):
        parts.append(f"exp={int(claims['exp'])}")
    # iss and sub are attacker-controlled free text that can hold PII, so only their presence is reported.
    parts += [f"{claim}=redacted" for claim in ("iss", "sub") if claim in claims]
    if jwt_expired(claims):
        verdict.severity = "medium"
        parts.append("expired")
    verdict.detail = "Decoded " + ", ".join(parts) + "."
    return verdict


_PEM_END = re.compile(r"-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----")
_PEM_BODY = re.compile(  # armor headers and base64 lines, then a last line that must end where the base64 does
    r"(?:(?:[ \t]*[A-Za-z0-9+/=]+[ \t]*|[A-Za-z][\w-]*: [^\n]*)?(?:\r?\n|(?:\\r)?\\n))*"
    r"(?:[ \t]*[A-Za-z0-9+/=]+(?=[ \t]*(?:[\r\n\"'\\]|\Z)))?"
)
_PEM_MAX = 64 * 1024


def _private_key(value: str, text: str, start: int) -> Verdict:
    """Extend the match from the BEGIN header over the key body, which is the actual secret."""
    limit = start + _PEM_MAX
    header_end = start + len(value)
    end = _PEM_END.search(text, header_end, limit) if text.find("-----END ", header_end, limit) >= 0 else None
    if end:
        return Verdict(span=(start, end.end()))
    return Verdict(span=(start, header_end + len(_PEM_BODY.match(text, header_end, limit).group().rstrip())))


def _db_url(value: str, text: str, start: int) -> Verdict | None:
    password = value.split("://", 1)[1].rsplit("@", 1)[0].split(":", 1)[1]
    return None if is_placeholder(password) else Verdict()


def _generic_value(value: str, text: str, start: int) -> Verdict | None:
    if is_placeholder(value) or value.startswith(("http://", "https://")):
        return None
    if start and text[start - 1] not in "\"'" and _CODE_VALUE.match(value):
        return None
    return Verdict() if len(value) >= 16 or shannon(value) >= 3.0 else None


_NON_DOMAIN_TLDS = frozenset(("png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "css", "js", "ts", "json", "map"))


def _email(value: str, text: str, start: int) -> Verdict | None:
    tld = value.rsplit(".", 1)[-1].lower()
    if len(tld) < 2 or not tld.isalpha() or tld in _NON_DOMAIN_TLDS:  # react@18.2.0, logo@2x.png
        return None
    if value.startswith("git@") and text[start + len(value):start + len(value) + 1] == ":":  # ssh remote
        return None
    return Verdict()


def _aadhaar(value: str, text: str, start: int) -> Verdict | None:
    return Verdict() if verhoeff(re.sub(r"[ -]", "", value)) else None


def _pan(value: str, text: str, start: int) -> Verdict | None:
    return Verdict() if pan_valid(value) else None


def _passport(value: str, text: str, start: int) -> Verdict | None:
    return Verdict() if "passport" in text[max(start - 30, 0):start + len(value) + 30].lower() else None


def _card(value: str, text: str, start: int) -> Verdict | None:
    found = find_card(value)
    if found is None:
        return None
    brand, card_start, card_end = found
    return Verdict(span=(start + card_start, start + card_end), detail=f"Issuer prefix: {brand}.")


def _private_ip(value: str, text: str, start: int) -> Verdict | None:
    return Verdict() if all(int(octet) <= 255 for octet in value.split(".")) else None


_CODE_RECEIVERS = frozenset(("self", "this", "cls", "threading", "super"))


def _internal_host(value: str, text: str, start: int) -> Verdict | None:
    return None if value.split(".", 1)[0].lower() in _CODE_RECEIVERS else Verdict()


VALIDATORS: dict[str, Callable[[str, str, int], Verdict | None]] = {
    "openai_key": _openai_key, "stripe_key": _stripe_key, "jwt": _jwt, "private_key": _private_key,
    "db_url": _db_url, "generic_value": _generic_value, "email": _email, "aadhaar": _aadhaar, "pan": _pan,
    "passport": _passport, "card": _card, "private_ip": _private_ip, "internal_host": _internal_host,
}
