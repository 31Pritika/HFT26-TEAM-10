"""Every subtype the detector or Part A can emit has steps and compliance tags."""
import json
import pathlib

import pytest

from shadowscope_detect.patterns.pii import BULK_PII, PII_RULES
from shadowscope_detect.patterns.secrets import HIGH_ENTROPY_STRING, SECRET_RULES
from shadowscope_detect.remediation import COMPLIANCE, REMEDIATION, compliance_for, remediation_for

RULE_IDS = [r.id for r in (*SECRET_RULES, *PII_RULES, HIGH_ENTROPY_STRING, BULK_PII)]
MOCK = json.loads((pathlib.Path(__file__).parents[2] / "contracts" / "mock" / "findings.json").read_text())
MOCK_SUBTYPES = sorted({f["subtype"] for f in (MOCK["items"] if isinstance(MOCK, dict) else MOCK)})


@pytest.mark.parametrize("subtype", sorted({*RULE_IDS, *MOCK_SUBTYPES}))
def test_subtype_has_steps_and_tags(subtype):
    assert remediation_for(subtype)
    assert compliance_for(subtype)


def test_tables_cover_the_same_subtypes():
    assert set(REMEDIATION) == set(COMPLIANCE)


def test_unknown_subtype_is_empty_not_an_error():
    assert remediation_for("nope") == [] and compliance_for("nope") == []


def test_callers_cannot_mutate_the_table():
    remediation_for("jwt").append("x")
    assert "x" not in remediation_for("jwt")


@pytest.mark.parametrize("subtype,expected", [
    ("aadhaar", "Notify DPO under DPDP Act 2023"), ("pan", "Purge from AI provider history"),
    ("aws_access_key", "Deactivate key in IAM now"), ("shell_spawn", "Require human approval for shell tools"),
])
def test_master_section_8_5_wording(subtype, expected):
    assert expected in remediation_for(subtype)


def test_only_cards_carry_pci():
    assert [s for s, tags in COMPLIANCE.items() if "PCI-DSS" in tags] == ["credit_card"]


@pytest.mark.parametrize("subtype,tags", [("canary_token", ["ISO27001"]), ("source_code", ["ISO27001"]),
                                          ("recon", ["SOC2", "ISO27001"]), ("jwt", ["SOC2", "ISO27001"]),
                                          ("email", ["DPDP", "GDPR", "ISO27001"])])
def test_tags_follow_master_section_9(subtype, tags):
    assert compliance_for(subtype) == tags
