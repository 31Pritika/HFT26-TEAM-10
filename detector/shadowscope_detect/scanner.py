"""`scan_text` orchestration (spec B2): regexes + validators, entropy pass, overlap resolution, scoring."""
from __future__ import annotations

import hashlib
import re
import time
from bisect import bisect_left, bisect_right
from dataclasses import dataclass

from . import entropy
from .patterns import Rule
from .patterns.pii import BULK_EMAILS, BULK_IDENTITY_DOCS, BULK_PII, PII_RULES
from .patterns.secrets import HIGH_ENTROPY_STRING, SECRET_RULES
from .redact import MASK_CHAR, MASKERS, Region, Span, apply_masks, merge_spans
from .types import DetFinding, ScanResult, Severity
from .validators import VALIDATORS, Verdict

_RULES = SECRET_RULES + PII_RULES
_NO_VERDICT = Verdict()
_DATA_URI = re.compile(r"data:(?:image|font|audio|video)/[\w.+-]+;base64,[A-Za-z0-9+/=]+")
_SEVERITY_RANK: dict[Severity, int] = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
_WEIGHTS: dict[Severity, int] = {"critical": 60, "high": 40, "medium": 20, "low": 8, "info": 2}
_SNIPPET_CONTEXT = 40
_RISK_DECAY = 0.5      # each further finding, heaviest first, counts half as much as the one before


@dataclass(slots=True)
class _Candidate:
    rule: Rule
    start: int
    end: int
    verdict: Verdict

    @property
    def severity(self) -> Severity:
        return self.verdict.severity or self.rule.severity


def _blank_data_uris(text: str) -> str:
    """Spaces over embedded media, offsets intact: base64 payloads can only produce noise, and they are huge."""
    if "data:" not in text:
        return text
    return _DATA_URI.sub(lambda m: " " * len(m.group()), text)


def _value_span(rule: Rule, match: re.Match[str]) -> tuple[int, int]:
    for group in rule.value_groups:
        if match.start(group) >= 0:
            return match.span(group)
    return match.span()


def _regex_candidates(view: str) -> list[_Candidate]:
    lowered = view.lower()
    candidates = []
    for rule in _RULES:
        if rule.keywords and not any(keyword in lowered for keyword in rule.keywords):
            continue
        validate = VALIDATORS[rule.validator] if rule.validator else None
        for match in rule.regex.finditer(view):
            start, end = _value_span(rule, match)
            value = view[start:end]
            if MASK_CHAR in value:  # already redacted, so a re-scan stays clean
                continue
            verdict = validate(value, view, start) if validate else _NO_VERDICT
            if verdict is not None:
                start, end = verdict.span or (start, end)
                candidates.append(_Candidate(rule, start, end, verdict))
    return candidates


def _overlaps(starts: list[int], ends: list[int], start: int, end: int) -> bool:
    """Whether [start, end) touches any of the disjoint, sorted intervals in `starts`/`ends`."""
    i = bisect_right(starts, start)
    return bool(i and ends[i - 1] > start) or (i < len(starts) and starts[i] < end)


def _entropy_candidates(view: str, taken: list[Span], threshold: float) -> tuple[list[_Candidate], float]:
    starts, ends = [s.start for s in taken], [s.end for s in taken]
    candidates = []
    entropy_max = 0.0
    for match in entropy.iter_tokens(view):
        token = match.group().rstrip(".!?")
        charset = entropy.classify_charset(token)
        if charset is None:
            continue
        start, end = match.start(), match.start() + len(token)
        value_entropy = entropy.shannon(token)
        entropy_max = max(entropy_max, value_entropy)
        if len(token) < entropy.MIN_TOKEN_LEN or _overlaps(starts, ends, start, end):
            continue
        if entropy.is_uuid(token):
            if entropy.in_key_context(view, start):
                candidates.append(_Candidate(HIGH_ENTROPY_STRING, start, end, Verdict(
                    severity="info", confidence=0.3, detail="UUID in a credential context.")))
            continue
        if value_entropy < entropy.threshold_for(charset, threshold) or not entropy.looks_random(token, charset):
            continue
        if charset == "hex" and entropy.in_hash_context(view, start):
            continue
        candidates.append(_Candidate(HIGH_ENTROPY_STRING, start, end, Verdict(
            confidence=entropy.confidence_from_entropy(value_entropy),
            detail=f"Shannon entropy {value_entropy:.2f} ({charset} charset).")))
    return candidates, entropy_max


def _resolve_overlaps(candidates: list[_Candidate]) -> list[_Candidate]:
    """Keep the most specific rule, then the highest severity, then the longest match; in offset order."""
    ranked = sorted(candidates, key=lambda c: (-c.rule.tier, -_SEVERITY_RANK[c.severity], c.start - c.end, c.start))
    kept: list[_Candidate] = []
    starts: list[int] = []
    ends: list[int] = []
    for candidate in ranked:
        if not _overlaps(starts, ends, candidate.start, candidate.end):
            i = bisect_right(starts, candidate.start)
            starts.insert(i, candidate.start)
            ends.insert(i, candidate.end)
            kept.append(candidate)
    return sorted(kept, key=lambda c: c.start)


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", "replace")).hexdigest()[:12]


class _Evidence:
    """Builds evidence blocks. Snippets are cut from the redacted text: slicing the raw text and redacting that
    would leak any secret the window boundary cuts in half, since a truncated secret no longer matches its regex."""

    def __init__(self, text: str, redacted: str, regions: list[Region]) -> None:
        self.text = text
        self.redacted = redacted
        self.regions = regions
        self.region_starts = [r.start for r in regions]
        self.newlines = [m.start() for m in re.finditer("\n", text)]

    def build(self, candidate: _Candidate) -> dict:
        value = self.text[candidate.start:candidate.end]
        region = self.regions[bisect_right(self.region_starts, candidate.start) - 1]
        return {
            "redacted_snippet": self.redacted[max(region.redacted_start - _SNIPPET_CONTEXT, 0):
                                              region.redacted_end + _SNIPPET_CONTEXT],
            "match_redacted": MASKERS[candidate.rule.mask](value),
            "entropy": round(entropy.shannon(value), 2),
            "line": bisect_left(self.newlines, candidate.start) + 1,
            "offset": candidate.start,
            "fingerprint": _fingerprint(value),
        }


def _finding(rule: Rule, *, severity: Severity, confidence: float, title: str, description: str,
             evidence: dict) -> DetFinding:
    return {
        "type": rule.type, "subtype": rule.id, "severity": severity, "confidence": confidence,
        "title": title, "description": description, "evidence": evidence, "detector": rule.detector,
        "compliance": list(rule.compliance), "remediation": list(rule.remediation),
    }


def _candidate_finding(candidate: _Candidate, evidence: dict) -> DetFinding:
    rule, verdict = candidate.rule, candidate.verdict
    title = rule.title.format(**verdict.fields)
    return _finding(
        rule, severity=candidate.severity,
        confidence=rule.confidence if verdict.confidence is None else verdict.confidence,
        title=title, description=f"{title}. {verdict.detail}" if verdict.detail else f"{title}.", evidence=evidence,
    )


def _bulk_finding(text: str, kept: list[_Candidate], evidence: _Evidence) -> DetFinding | None:
    emails = {text[c.start:c.end].lower(): c for c in reversed(kept) if c.rule.id == "email"}
    documents = {re.sub(r"[ -]", "", text[c.start:c.end]): c for c in reversed(kept) if c.rule.id in ("aadhaar", "pan")}
    if len(emails) < BULK_EMAILS and len(documents) < BULK_IDENTITY_DOCS:
        return None
    first = min((*emails.values(), *documents.values()), key=lambda c: c.start)
    block = evidence.build(first)
    block["entropy"] = None
    block["fingerprint"] = _fingerprint("\n".join(sorted((*emails, *documents))))
    return _finding(
        BULK_PII, severity=BULK_PII.severity, confidence=BULK_PII.confidence, title=BULK_PII.title,
        description=f"{BULK_PII.title}: {len(emails)} email addresses, {len(documents)} Aadhaar/PAN numbers.",
        evidence=block,
    )


def _risk_score(findings: list[DetFinding]) -> int:
    weights = sorted((_WEIGHTS[f["severity"]] for f in findings), reverse=True)
    return min(100, round(sum(weight * _RISK_DECAY ** i for i, weight in enumerate(weights))))


def scan_text(text: str, *, context: dict | None = None, policy: dict | None = None) -> ScanResult:
    """Find secrets and PII in `text`. Raw matches never leave this function: every field of the result is masked."""
    started = time.perf_counter()
    threshold = (policy or {}).get("entropy_threshold", entropy.DEFAULT_THRESHOLD)

    view = _blank_data_uris(text)
    candidates = _regex_candidates(view)
    taken = merge_spans(Span(c.start, c.end) for c in candidates)
    entropy_found, entropy_max = _entropy_candidates(view, taken, threshold)
    candidates += entropy_found

    # Losers of overlap resolution stay in the mask set: a partial overlap would otherwise leave their tail raw.
    redacted, regions = apply_masks(text, [Span(c.start, c.end, c.rule.mask) for c in candidates])
    kept = _resolve_overlaps(candidates)

    evidence = _Evidence(text, redacted, regions)
    findings = [_candidate_finding(c, evidence.build(c)) for c in kept]
    bulk = _bulk_finding(text, kept, evidence)
    entropy_max = max((entropy_max, *(f["evidence"]["entropy"] for f in findings)))
    if bulk:
        findings.append(bulk)
    findings.sort(key=lambda f: (-_SEVERITY_RANK[f["severity"]], f["evidence"]["offset"]))

    return {
        "findings": findings,
        "redacted_text": redacted,
        "risk_score": _risk_score(findings),
        "stats": {
            "chars": len(text),
            "lines": text.count("\n") + 1 if text else 0,
            "entropy_max": round(entropy_max, 2),
            "flagged_tokens": len(kept),
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        },
    }
