"""Shannon entropy, charset classification and the candidate tokenizer for the high-entropy pass."""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Iterator

DEFAULT_THRESHOLD = 4.0
HEX_THRESHOLD_OFFSET = 1.0   # master §8.1: hex tokens are held to 3.0 when the policy threshold is 4.0
MIN_TOKEN_LEN = 20
_ENTROPY_SAMPLE = 4096       # a token this long is flagged either way; do not histogram megabytes of it

_DELIMITERS = r"""\s'"=:,;(){}\[\]<>|`"""
_TOKEN = re.compile(rf"(?<![^{_DELIMITERS}])[^{_DELIMITERS}]{{{MIN_TOKEN_LEN},}}")
_HEX = re.compile(r"[0-9a-fA-F]+")
_ALNUM = re.compile(r"[0-9a-zA-Z]+")
_BASE64 = re.compile(r"[0-9a-zA-Z+/_-]+")
_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
_DIGEST_PREFIX = re.compile(r"sha(?:1|224|256|384|512)-", re.IGNORECASE)
_SEPARATORS = re.compile(r"[/_-]")

_HASH_CONTEXT = re.compile(r"\b(?:commit|sha\w*|rev|revision|merge|parent|tree|blob|digest|checksum|hash|md5|integrity)\b",
                           re.IGNORECASE)
_KEY_CONTEXT = re.compile(r"key|token|secret|passw|credential|auth", re.IGNORECASE)
_CONTEXT_CHARS = 32


def shannon(value: str) -> float:
    """Shannon entropy of `value`, in bits per character."""
    sample = value[:_ENTROPY_SAMPLE]
    size = len(sample)
    return -sum(n / size * math.log2(n / size) for n in Counter(sample).values()) if size else 0.0


def classify_charset(token: str) -> str | None:
    """Narrowest of "hex", "alnum", "base64" that fits `token`; None if it uses other characters."""
    if _HEX.fullmatch(token):
        return "hex"
    if _ALNUM.fullmatch(token):
        return "alnum"
    return "base64" if _BASE64.fullmatch(token) else None


def threshold_for(charset: str, policy_threshold: float = DEFAULT_THRESHOLD) -> float:
    return policy_threshold - HEX_THRESHOLD_OFFSET if charset == "hex" else policy_threshold


def confidence_from_entropy(entropy: float) -> float:
    """Master §8.1: clamp((H - 3.5) / 1.5)."""
    return round(max(0.0, min(1.0, (entropy - 3.5) / 1.5)), 2)


def iter_tokens(text: str) -> Iterator[re.Match[str]]:
    """Candidate tokens: runs of MIN_TOKEN_LEN+ characters between delimiters."""
    return _TOKEN.finditer(text)


def is_uuid(token: str) -> bool:
    return _UUID.fullmatch(token) is not None


def _context_before(text: str, start: int) -> str:
    return text[max(text.rfind("\n", max(start - _CONTEXT_CHARS, 0), start) + 1, start - _CONTEXT_CHARS, 0):start]


def in_hash_context(text: str, start: int) -> bool:
    """True when the words just before `start`, on the same line, say this hex token is a commit or digest."""
    return _HASH_CONTEXT.search(_context_before(text, start)) is not None


def in_key_context(text: str, start: int) -> bool:
    return _KEY_CONTEXT.search(_context_before(text, start)) is not None


def looks_random(token: str, charset: str) -> bool:
    """Filter tokens that clear the entropy bar but are clearly words: identifiers, paths, plain numbers, digests."""
    if token.isdecimal() or _DIGEST_PREFIX.match(token):
        return False
    if charset == "hex":
        return True
    if not any(ch.isdigit() for ch in token):  # CamelCaseClassName, long_snake_case_identifier
        return False
    separators = len(_SEPARATORS.findall(token))  # random base64 has about 1 in 21 characters
    return separators < 3 or separators * 12 < len(token)
