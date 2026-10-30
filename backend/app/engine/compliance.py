"""Framework scores, findings → framework mapping, remediation defaults and the report (master §9)."""
from __future__ import annotations

from collections.abc import Callable

from .. import db
from ..utils import clamp, now, to_iso, window_start
from . import agents, risk, stats

FRAMEWORK_IDS = ("DPDP", "GDPR", "SOC2", "PCI-DSS", "ISO27001")
ORG_NAME = "Local workstation"
TOP_FINDINGS = 10
SCORE_FACTOR = {"DPDP": 0.08, "GDPR": 0.08, "SOC2": 0.015, "PCI-DSS": 0.30, "ISO27001": 0.01}

_RULES: dict[str, Callable[[dict], bool]] = {
    "DPDP": lambda f: f["type"] == "pii",
    "GDPR": lambda f: f["type"] == "pii",
    "PCI-DSS": lambda f: f["subtype"] == "credit_card",
    "SOC2": lambda f: f["type"] in ("secret", "shadow_ai", "agent_action"),
    "ISO27001": lambda f: True,
}

REMEDIATION: dict[str, list[str]] = {
    "aws_access_key": ["Deactivate key in IAM now", "Rotate & move to AWS Secrets Manager", "Add pre-commit secret scanning"],
    "aadhaar": ["Purge from AI provider history", "Notify DPO under DPDP Act 2023", "Enable masking in source system"],
    "pan": ["Purge from AI provider history", "Notify DPO under DPDP Act 2023", "Enable masking in source system"],
    "secret": ["Revoke and rotate the credential", "Move it to a secrets manager", "Add pre-commit secret scanning"],
    "pii": ["Purge from AI provider history", "Review the data-sharing policy with the user"],
    "source_code": ["Review what was shared with the provider", "Move the team to a sanctioned AI tool"],
    "canary": ["Treat as an active leak", "Trace the process and user that sent the token"],
    "agent_action": ["Run agent in sandbox/container", "Require human approval for shell tools", "Restrict tool allowlist"],
    "shadow_ai": ["Decide whether to sanction or block this tool", "Point the owner to an approved alternative"],
    "policy": ["Block the provider at the network edge", "Follow up with the process owner"],
    "exfil_volume": ["Inspect the destination and payload", "Pause the process until it is reviewed"],
}

_FRAMEWORKS: list[dict] = [
    {"id": "DPDP", "name": "India DPDP Act 2023", "controls": [
        ("DPDP-8.5", "Reasonable security safeguards", _RULES["DPDP"]),
        ("DPDP-8.6", "Breach notification readiness", lambda f: f["subtype"] in ("aadhaar", "pan", "bulk_pii")),
    ]},
    {"id": "GDPR", "name": "GDPR", "controls": [
        ("GDPR-5", "Data minimisation", _RULES["GDPR"]),
        ("GDPR-32", "Security of processing", lambda f: f["type"] == "pii" and f["severity"] in ("critical", "high")),
    ]},
    {"id": "SOC2", "name": "SOC 2", "controls": [
        ("CC6.1", "Logical access controls", lambda f: f["type"] == "secret"),
        ("CC6.8", "Unauthorised software", lambda f: f["type"] == "shadow_ai"),
        ("CC7.2", "Monitoring of anomalous activity", lambda f: f["type"] == "agent_action"),
    ]},
    {"id": "PCI-DSS", "name": "PCI-DSS", "controls": [
        ("PCI-3", "Protect stored account data", _RULES["PCI-DSS"]),
        ("PCI-4", "Protect cardholder data in transit", _RULES["PCI-DSS"]),
    ]},
    {"id": "ISO27001", "name": "ISO 27001", "controls": [
        ("A.5.14", "Information transfer", lambda f: f["type"] in ("secret", "pii", "source_code", "exfil_volume")),
        ("A.8.12", "Data leakage prevention", lambda f: f["type"] in ("canary", "exfil_volume", "policy")),
        ("A.8.16", "Monitoring activities", _RULES["ISO27001"]),
    ]},
]


def tags_for(finding_type: str, subtype: str) -> list[str]:
    finding = {"type": finding_type, "subtype": subtype}
    return [framework for framework in FRAMEWORK_IDS if _RULES[framework](finding)]


def remediation_for(finding_type: str, subtype: str) -> list[str]:
    return list(REMEDIATION.get(subtype) or REMEDIATION.get(finding_type) or [])


def scores(open_findings: list[dict]) -> dict[str, int]:
    """Higher is better: 100 minus the weighted sum of open findings mapped to the framework."""
    result = {}
    for framework in FRAMEWORK_IDS:
        total = sum(risk.SEVERITY_WEIGHT[f["severity"]] for f in open_findings if _RULES[framework](f))
        result[framework] = clamp(100 - SCORE_FACTOR[framework] * total)
    return result


def _control(control_id: str, name: str, rule: Callable[[dict], bool], open_findings: list[dict]) -> dict:
    matched = [f for f in open_findings if rule(f)]
    serious = sum(f["severity"] in ("critical", "high") for f in matched)
    status = "fail" if serious else "warn" if matched else "pass"
    evidence = f"{len(matched)} open findings, {serious} critical or high" if matched else "No open findings"
    return {"id": control_id, "name": name, "status": status, "evidence": evidence}


def _recommendations(open_findings: list[dict], sessions: list[dict], inventory: list[dict]) -> list[dict]:
    items = []
    secrets = sum(f["type"] == "secret" and f["severity"] == "critical" for f in open_findings)
    if secrets:
        items.append({"priority": "P0", "title": "Rotate exposed credentials",
                      "detail": f"{secrets} critical secrets reached AI tools. Revoke them, starting with cloud and database keys."})
    risky = [session for session in sessions if session["risk_score"] >= 70 and session["status"] != "blocked"]
    if risky:
        names = ", ".join(sorted({session["process_name"] for session in risky}))
        items.append({"priority": "P0", "title": "Sandbox high-risk agents", "detail": f"Require human approval for shell and file tools in: {names}."})
    personal = sum(f["type"] == "pii" for f in open_findings)
    if personal:
        items.append({"priority": "P1", "title": "Review personal data exposure",
                      "detail": f"{personal} open PII findings. Check whether DPDP notification duties apply."})
    if any(not item["sanctioned"] for item in inventory):
        shadow = sum(not item["sanctioned"] for item in inventory)
        items.append({"priority": "P2", "title": "Publish a sanctioned AI tool list", "detail": f"{shadow} unsanctioned tools are in use. Give teams an approved alternative."})
    return items or [{"priority": "P2", "title": "Keep monitoring", "detail": "No open risks need action right now."}]


def build_report(window: str) -> dict:
    moment = now()
    since = to_iso(window_start(window, moment))
    open_findings = db.open_findings()
    org = risk.org_score(open_findings, moment)
    framework_scores = scores(open_findings)
    sessions = agents.list_sessions()
    inventory = db.list_inventory()
    period_totals = stats.totals(since)
    ranked = sorted(open_findings, key=lambda f: (risk.SEVERITY_WEIGHT[f["severity"]], f["ts"]), reverse=True)
    return {
        "generated_at": to_iso(moment), "org": ORG_NAME, "window": {"from": since, "to": to_iso(moment)},
        "overall": {"score": org["score"], "grade": org["grade"],
                    "summary": f"{period_totals['shadow_tools']} unsanctioned AI tools and {len(open_findings)} open findings."},
        "frameworks": [
            {"id": framework["id"], "name": framework["name"], "score": framework_scores[framework["id"]],
             "controls": [_control(*control, open_findings) for control in framework["controls"]]}
            for framework in _FRAMEWORKS
        ],
        "top_findings": ranked[:TOP_FINDINGS], "inventory": inventory, "agents": sessions,
        "recommendations": _recommendations(open_findings, sessions, inventory), "stats": period_totals,
    }
