"""Async engine chain. `triage` is the only caller of `_ask_engine`, and it passes only what `sanitize` approved."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from collections import OrderedDict
from dataclasses import dataclass

import httpx

from ..redact import MASK_CHAR
from ..scanner import scan_text
from ..types import TriageResult
from . import prompts, rules

log = logging.getLogger("shadowscope.triage")

ENGINE_TIMEOUT_S = 12
TOTAL_TIMEOUT_S = 18     # Part A cancels triage at 20 s, and rules must still get to answer before that
GROQ_MODEL = "llama-3.1-8b-instant"
OLLAMA_MODEL = "llama3.2:3b"
FEATHERLESS_BASE = "https://api.featherless.ai/v1"
GROQ_BASE = "https://api.groq.com/openai/v1"
OLLAMA_DEFAULT_URL = "http://localhost:11434"
SELF_HEADER = {"X-ShadowScope-Self": "1"}   # stops Part A's collectors flagging our own calls
_CHAIN = ("featherless", "groq", "ollama")

_PREVIEW_CHARS = 500
_MAX_TOKENS = 500
_MASK_PASSES = 3
_LEAK_TYPES = ("secret", "pii", "canary")   # source_code adds no masks, so it would never clear
_WITHHELD = "[withheld: sensitive values survived redaction, so nothing was sent to an LLM]"
_DIGIT_TOKEN = re.compile(r"\S*\d\S*")
_FENCE = re.compile(r"^```[a-zA-Z]*\s*|\s*```$")
_MAX_STEPS = 6
_MAX_TEXT_CHARS = 1000
_VERDICTS = ("true_positive", "likely_false_positive", "needs_review")
_SEVERITIES = ("critical", "high", "medium", "low", "info")
_CACHE_SIZE = 256
_cache: OrderedDict[tuple, TriageResult] = OrderedDict()


@dataclass(frozen=True, slots=True)
class _Engine:
    name: str
    base_url: str
    model: str
    api_key: str | None = None


def _has_leak(text: str) -> bool:
    return any(f["type"] in _LEAK_TYPES for f in scan_text(text)["findings"])


def sanitize(text: str) -> tuple[str, bool]:
    """Redact until a re-scan is clean. Returns the text and whether it is safe to send: fail closed if it is not."""
    for _ in range(_MASK_PASSES):
        if not _has_leak(text):
            return text, True
        text = scan_text(text)["redacted_text"]
    text = _DIGIT_TOKEN.sub(lambda m: MASK_CHAR * min(len(m.group()), 8), text)
    return text, not _has_leak(text)


def _build_chain(requested: str, model: str | None) -> list[_Engine]:
    """Engines to try, read from the environment at call time so a key added to .env needs no reload of this module."""
    available: dict[str, _Engine] = {}
    featherless_model = os.getenv("FEATHERLESS_MODEL")
    if os.getenv("FEATHERLESS_API_KEY") and featherless_model:
        available["featherless"] = _Engine("featherless", FEATHERLESS_BASE, featherless_model,
                                           os.environ["FEATHERLESS_API_KEY"])
    if os.getenv("GROQ_API_KEY"):
        available["groq"] = _Engine("groq", GROQ_BASE, GROQ_MODEL, os.environ["GROQ_API_KEY"])
    ollama_url = (os.getenv("OLLAMA_URL") or OLLAMA_DEFAULT_URL).rstrip("/")
    available["ollama"] = _Engine("ollama", f"{ollama_url}/v1", OLLAMA_MODEL)

    if requested == "auto":
        return [available[name] for name in _CHAIN if name in available]
    engine = available.get(requested)
    if engine is None:
        return []
    return [_Engine(engine.name, engine.base_url, model or engine.model, engine.api_key)]


async def _ask_engine(engine: _Engine, messages: list[dict[str, str]], timeout: float) -> str:
    headers = {**SELF_HEADER, **({"Authorization": f"Bearer {engine.api_key}"} if engine.api_key else {})}
    body = {"model": engine.model, "messages": messages, "temperature": 0, "max_tokens": _MAX_TOKENS}
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(f"{engine.base_url}/chat/completions", headers=headers, json=body)
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


def extract_json(content: str) -> dict | None:
    """Pull one JSON object out of a model reply, tolerating code fences and prose around it."""
    text = _FENCE.sub("", content.strip())
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        decoded = json.loads(text[start:end + 1])
    except (ValueError, RecursionError):
        return None
    return decoded if isinstance(decoded, dict) else None


def _clean_text(value: str) -> str:
    return scan_text(value[:_MAX_TEXT_CHARS])["redacted_text"]


def _validated(data: dict, finding: dict) -> dict | None:
    """The model's fields, checked and redacted. Optional ones fall back to rules; a bad verdict rejects the reply."""
    verdict, reasoning = data.get("verdict"), data.get("reasoning")
    if verdict not in _VERDICTS or not isinstance(reasoning, str) or not reasoning.strip():
        return None
    steps = data.get("remediation_steps")
    steps = steps if isinstance(steps, list) else []
    steps = [_clean_text(step) for step in steps if isinstance(step, str) and step.strip()]
    suggestion = data.get("policy_suggestion")
    sensitivity = data.get("sensitivity")
    return {
        "verdict": verdict,
        "sensitivity": sensitivity if sensitivity in _SEVERITIES else finding.get("severity", "medium"),
        "reasoning": _clean_text(reasoning),
        "remediation_steps": steps[:_MAX_STEPS] or rules.rules_steps(finding),
        "policy_suggestion": _clean_text(suggestion) if isinstance(suggestion, str) and suggestion.strip()
        else rules.policy_suggestion(finding),
    }


async def _run_chain(chain: list[_Engine], messages: list[dict[str, str]],
                     finding: dict) -> tuple[_Engine, dict] | None:
    deadline = time.monotonic() + TOTAL_TIMEOUT_S
    for engine in chain:
        remaining = min(ENGINE_TIMEOUT_S, deadline - time.monotonic())
        if remaining <= 0:
            log.warning("triage budget used up before trying %s", engine.name)
            return None
        try:
            # httpx timeouts are per read, so a server trickling bytes needs this outer limit too.
            content = await asyncio.wait_for(_ask_engine(engine, messages, remaining), remaining)
            data = extract_json(content) if isinstance(content, str) else None
            result = _validated(data, finding) if data else None
        except (httpx.HTTPError, asyncio.TimeoutError, ValueError, KeyError, IndexError, TypeError) as error:
            log.warning("triage engine %s failed: %s", engine.name, type(error).__name__)
            continue
        if result:
            return engine, result
        log.warning("triage engine %s returned an invalid reply", engine.name)
    return None


def _withhold_context(finding: dict) -> bool:
    """Code has nothing for redaction to mask, so its context never leaves the machine; metadata is enough to triage."""
    return finding.get("type") == "source_code"


async def triage(finding: dict, context_snippet: str, *, engine_cfg: dict) -> TriageResult:
    started = time.perf_counter()
    requested = (engine_cfg or {}).get("engine") or "auto"
    model = (engine_cfg or {}).get("model")
    context = "" if _withhold_context(finding) else context_snippet or ""

    outgoing, safe = sanitize(prompts.build_user_message(finding, context))
    preview = outgoing[:_PREVIEW_CHARS] if safe else _WITHHELD
    safe_context, context_safe = sanitize(context)

    def elapsed() -> int:
        return round((time.perf_counter() - started) * 1000)

    def fallback() -> TriageResult:
        return rules.rules_triage(finding, safe_context if context_safe else "", preview=preview, latency_ms=elapsed())

    # A canary is certain by definition, and its token must not risk a trip to an LLM.
    if not safe or requested == "rules" or finding.get("type") == "canary":
        if not safe:
            log.warning("triage sent nothing: sensitive values survived redaction")
        return fallback()

    fingerprint = (finding.get("evidence") or {}).get("fingerprint")
    key = (finding.get("subtype"), fingerprint, requested, model)
    if fingerprint and key in _cache:
        _cache.move_to_end(key)
        return {**_cache[key], "latency_ms": elapsed()}

    answer = await _run_chain(_build_chain(requested, model), prompts.build_messages(outgoing), finding)
    if answer is None:
        return fallback()
    engine, fields = answer
    result: TriageResult = {**fields, "engine": engine.name, "model": engine.model, "latency_ms": elapsed(),
                            "redacted_input_preview": preview}
    if fingerprint:
        _cache[key] = result
        while len(_cache) > _CACHE_SIZE:
            _cache.popitem(last=False)
    return dict(result)
