"""classify_process: is this process an AI tool? Uses the signatures in patterns/providers_proc.py."""
from __future__ import annotations

import re

from .patterns import providers_proc
from .types import ProcessClass

NAME_CONFIDENCE = 0.95
CMDLINE_CONFIDENCE = 0.7
_HELPER_SUFFIX = re.compile(r"\s*\((?:Renderer|GPU|Plugin|Utility)\)$")


def _not_ai() -> ProcessClass:
    return {"is_ai_tool": False, "framework": None, "category": None, "confidence": 0.0}


def classify_process(name: str, cmdline: list[str] | None) -> ProcessClass:
    base = re.split(r"[/\\]", name or "")[-1]
    base = _HELPER_SUFFIX.sub("", base.removesuffix(".exe").removesuffix(".EXE"))
    signature = providers_proc.EXACT_NAMES.get(base) or providers_proc.NAMES.get(base.lower())
    if signature:
        framework, category = signature
        return {"is_ai_tool": True, "framework": framework, "category": category, "confidence": NAME_CONFIDENCE}
    if providers_proc.RUNTIME.match(base):
        joined = " ".join(cmdline or [])
        for pattern, framework in providers_proc.CMDLINE_KEYWORDS:
            if pattern.search(joined):
                return {"is_ai_tool": True, "framework": framework, "category": "cloud_llm",
                        "confidence": CMDLINE_CONFIDENCE}
    return _not_ai()
