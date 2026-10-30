"""Source-code and proprietary-code heuristics (master §8.3): counts lines that look like code."""
from __future__ import annotations

import re
from dataclasses import dataclass

from .patterns import Rule

MIN_CODE_LINES = 5
_EXCERPT_CHARS = 80

SOURCE_CODE = Rule(id="source_code", type="source_code", regex=None, severity="medium",
                   title="Source code sent to AI tool", confidence=0.8, detector="heuristic")
PROPRIETARY_CODE = Rule(id="proprietary_code", type="source_code", regex=None, severity="high",
                        title="Proprietary code sent to AI tool", confidence=0.9, detector="heuristic")

# Anchored to line starts or code punctuation, so "class of students" or "from the top" stay prose. Trailing braces only
# count after `)`: a line ending in `{` alone is just as likely to be pretty-printed JSON.
_CODE_LINE = re.compile(
    r"""^[ \t]*(?:
        import[ \t]+[\w.*{"'(]
      | from[ \t]+[\w.]+[ \t]+import[ \t]
      | (?:async[ \t]+)?def[ \t]+\w+[ \t]*\(
      | (?:export[ \t]+|public[ \t]+|abstract[ \t]+)*class[ \t]+\w+[^\n]*[:({]
      | (?:export[ \t]+)?(?:const|let|var)[ \t]+[\w{\[]+[^\n=]*=
      | package[ \t]+[\w.]+;?[ \t]*$
      | \#[ \t]*(?:include|define|ifndef|pragma)\b
      | (?:public|private|protected)[ \t]+(?:static|final|void|class|int|long|boolean|String)\b
      | (?:if|elif|for|while|with|try|except)\b[^\n]*:[ \t]*$
      | (?:SELECT|FROM|WHERE|JOIN|LEFT[ \t]+JOIN|GROUP[ \t]+BY|ORDER[ \t]+BY|INSERT[ \t]+INTO|DELETE[ \t]+FROM
          |UPDATE[ \t]+\w+[ \t]+SET|CREATE[ \t]+TABLE|ALTER[ \t]+TABLE)\b
      | @\w+
    )
    | =>
    | \bfunction[ \t]*\w*[ \t]*\(
    | \bSELECT\b[^\n]{1,200}\bFROM\b
    | \)[ \t]*\{[ \t]*$
    | ;[ \t]*$
    """,
    re.MULTILINE | re.VERBOSE,
)
_PROPRIETARY = re.compile(r"\b(?:Proprietary|Confidential|Internal use only)\b|\bCopyright\b[^\n]*\b(?:Inc|Ltd|Pvt)\b",
                          re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class CodeMatch:
    rule: Rule
    excerpt: str  # the line that best explains the finding


def _line_at(text: str, position: int) -> str:
    start = text.rfind("\n", 0, position) + 1
    end = text.find("\n", position)
    return text[start:end if end >= 0 else len(text)].strip()[:_EXCERPT_CHARS]


def detect_code(text: str) -> CodeMatch | None:
    """Return a match when `text` has at least MIN_CODE_LINES code-looking lines. Pass redacted text only."""
    text = text.replace('": "', '":\n').replace('":"', '":\n')  # a JSON string's first line has no line start
    first = None
    lines = 0
    position = 0
    while lines < MIN_CODE_LINES:
        match = _CODE_LINE.search(text, position)
        if match is None:
            return None
        first = first if first is not None else match.start()
        lines += 1
        position = text.find("\n", match.end() - 1)
        if position < 0:
            if lines < MIN_CODE_LINES:
                return None
            break
        position += 1
    marker = _PROPRIETARY.search(text)
    if marker:
        return CodeMatch(PROPRIETARY_CODE, _line_at(text, marker.start()))
    return CodeMatch(SOURCE_CODE, _line_at(text, first))
