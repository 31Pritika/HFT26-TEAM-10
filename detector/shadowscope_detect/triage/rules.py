"""Deterministic TriageResult: the engine of last resort, so it must stand on its own in a demo."""
from __future__ import annotations

import re

from ..remediation import remediation_for
from ..types import Severity, TriageResult

MODEL = "rules-v1"
_MIN_STEPS = 4
_REVIEW_CONFIDENCE = 0.6
_REVIEW_SUBTYPES = ("high_entropy_string", "generic_secret_assignment")
# "fake" is left out on purpose: the simulator's values are marked FAKE and the demo must show them as real findings.
_TEST_MARKERS = re.compile(r"sk_test_|rk_test_|\bexample\b|\bdummy\b|xxxx", re.IGNORECASE)
_AADHAAR_MASK = "XXXX XXXX "  # our own mask, which would otherwise read as an xxxx placeholder
_FOLLOW_UP = ("Confirm how long the data was exposed", "Record the incident and the fix")
_DEFAULT_POLICY = "Review this finding and add a policy rule if it recurs."
_POLICY_BY_TYPE = {
    "secret": "Route this tool through the Local Gateway with block_on_critical enabled.",
    "pii": "Enable gateway masking so personal data never reaches AI providers.",
    "source_code": "Allow source code only to sanctioned AI tools.",
    "agent_action": "Run agents in a sandbox with a tool allowlist and human approval for shell tools.",
    "canary": "Keep the honeytoken in place and alert on every appearance.",
    "shadow_ai": "Add this tool to the sanctioned list or block it at the network edge.",
    "policy": "Keep this provider blocked and tell the process owner why.",
    "exfil_volume": "Set an upload budget per process and alert when it is exceeded.",
}


def _evidence(finding: dict) -> dict:
    evidence = finding.get("evidence")
    return evidence if isinstance(evidence, dict) else {}


def _is_test_stripe_key(finding: dict) -> bool:
    masked = str(_evidence(finding).get("match_redacted") or "")
    return finding.get("subtype") == "stripe_key" and (str(finding.get("title", "")).startswith("Test")
                                                       or masked.startswith(("sk_t", "rk_t")))


def looks_like_test_data(finding: dict, context: str) -> bool:
    """Only unmasked text can be checked. A marker inside the matched value is hidden by the mask."""
    visible = f"{context}\n{_evidence(finding).get('match_redacted') or ''}".replace(_AADHAAR_MASK, "")
    return _is_test_stripe_key(finding) or _TEST_MARKERS.search(visible) is not None


def _verdict(finding: dict, context: str) -> tuple[str, Severity, str]:
    subtype = finding.get("subtype", "finding")
    severity: Severity = finding.get("severity", "medium")
    if finding.get("type") == "canary":
        return "true_positive", "critical", "A policy honeytoken appeared in traffic, so this is a real leak."
    if looks_like_test_data(finding, context):
        return ("likely_false_positive", "low",
                f"Rules match for {subtype}, but the context carries a test-data marker.")
    if subtype in _REVIEW_SUBTYPES or float(finding.get("confidence") or 0) < _REVIEW_CONFIDENCE:
        return "needs_review", severity, f"Rules match for {subtype}, but this rule cannot confirm the value is real."
    return "true_positive", severity, f"Rules match for {subtype}: valid format, no test-data marker in context."


def rules_steps(finding: dict) -> list[str]:
    steps = list(finding.get("remediation") or remediation_for(str(finding.get("subtype", ""))))
    return (steps + [step for step in _FOLLOW_UP if step not in steps])[:max(_MIN_STEPS, len(steps))]


def policy_suggestion(finding: dict) -> str:
    return _POLICY_BY_TYPE.get(finding.get("type"), _DEFAULT_POLICY)


def rules_triage(finding: dict, context: str, *, preview: str, latency_ms: int = 0) -> TriageResult:
    verdict, sensitivity, reasoning = _verdict(finding, context)
    return {
        "verdict": verdict, "sensitivity": sensitivity, "reasoning": reasoning,
        "remediation_steps": rules_steps(finding), "policy_suggestion": policy_suggestion(finding),
        "engine": "rules", "model": MODEL, "latency_ms": latency_ms, "redacted_input_preview": preview,
    }
