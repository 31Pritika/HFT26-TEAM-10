from datetime import timedelta

import pytest

from app.engine import agents, compliance, risk
from app.utils import now, to_iso


def finding(severity="high", finding_type="secret", subtype="x", hours_ago=0.0):
    return {"severity": severity, "type": finding_type, "subtype": subtype, "ts": to_iso(now() - timedelta(hours=hours_ago))}


@pytest.mark.parametrize("category,sanctioned,base", [
    ("cloud_llm", False, 25), ("ai_saas", False, 25), ("ai_coding", False, 20), ("unknown", False, 15), (None, False, 15),
    ("local_llm", False, 5), ("cloud_llm", True, 0),
])
def test_provider_base(category, sanctioned, base):
    assert risk.provider_base(category, sanctioned) == base


def test_event_score_formula():
    assert risk.event_score("cloud_llm", False, []) == 25
    assert risk.event_score("cloud_llm", False, ["critical", "low"]) == 25 + 60 + 5
    assert risk.event_score("cloud_llm", False, ["critical", "critical", "critical"], True) == 100
    assert risk.event_score("local_llm", True, ["low"]) == 8


def test_half_life():
    assert risk.decay(finding(hours_ago=6)["ts"]) == pytest.approx(0.5, abs=0.01)
    assert risk.decay(finding(hours_ago=12)["ts"]) == pytest.approx(0.25, abs=0.01)
    assert risk.decay(finding(hours_ago=-1)["ts"]) == 1


@pytest.mark.parametrize("score,letter", [(0, "A"), (20, "A"), (21, "B"), (40, "B"), (41, "C"), (61, "D"), (80, "D"), (81, "F"), (100, "F")])
def test_grades(score, letter):
    assert risk.grade(score) == letter


def test_org_score_empty_and_weights():
    assert risk.org_score([])["score"] == 0
    leaks = [finding("critical") for _ in range(50)]
    assert risk.org_score(leaks)["score"] == 40  # Leak alone is capped by its 0.40 weight.


def test_old_findings_matter_less():
    assert risk.org_score([finding(hours_ago=24)])["leak"] < risk.org_score([finding()])["leak"]


def test_future_findings_are_excluded_from_history():
    recent = [finding("critical", hours_ago=1)]
    assert risk.org_score(recent, now() - timedelta(hours=2))["score"] == 0


@pytest.mark.parametrize("finding_type,subtype,tags", [
    ("pii", "email", ["DPDP", "GDPR", "ISO27001"]),
    ("pii", "credit_card", ["DPDP", "GDPR", "PCI-DSS", "ISO27001"]),
    ("secret", "jwt", ["SOC2", "ISO27001"]),
    ("agent_action", "recon", ["SOC2", "ISO27001"]),
    ("shadow_ai", "new_unsanctioned_tool", ["SOC2", "ISO27001"]),
    ("source_code", "source_code", ["ISO27001"]),
    ("canary", "canary_token", ["ISO27001"]),
    ("policy", "blocked_provider_contacted", ["ISO27001"]),
    ("exfil_volume", "bytes_out_spike", ["ISO27001"]),
])
def test_compliance_mapping_follows_section_9(finding_type, subtype, tags):
    assert compliance.tags_for(finding_type, subtype) == tags


def test_compliance_scores_drop_only_for_mapped_frameworks():
    result = compliance.scores([finding("critical", "pii", "credit_card")])
    assert result["PCI-DSS"] < 100 and result["SOC2"] == 100
    assert compliance.scores([]) == dict.fromkeys(compliance.FRAMEWORK_IDS, 100)


def test_autonomy_formula():
    assert agents.autonomy_score(0, 0, 0) == 0
    assert agents.autonomy_score(1, 1, 1) == 100
    assert agents.autonomy_score(5, 0, 0) == 35
    assert agents.autonomy_score(0, 0.5, 0.5) == 32
