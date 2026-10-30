"""Source-code heuristics (master §8.3) and policy canary tokens."""
import hashlib
import json
import pathlib

import pytest

from shadowscope_detect import scan_text
from fixtures import samples

CODE_DIR = pathlib.Path(__file__).parent / "fixtures" / "code"
CANARY = "CANARY-SS-7F3A9"


def findings_of(text, subtype, **kw):
    return [f for f in scan_text(text, **kw)["findings"] if f["subtype"] == subtype]


def read(name):
    return (CODE_DIR / name).read_text()


@pytest.mark.parametrize("name", ["python.txt", "javascript.txt", "java.txt", "sql.txt", "c.txt"])
def test_source_code_detected(name):
    finding = findings_of(read(name), "source_code")[0]
    assert finding["type"] == "source_code"
    assert finding["severity"] == "medium"
    assert finding["detector"] == "heuristic"
    assert finding["compliance"] == ["ISO27001"]


@pytest.mark.parametrize("name", ["not_code_prose.txt", "not_code_json.txt", "not_code_env.txt", "not_code_csv.txt"])
def test_non_code_is_not_flagged(name):
    assert scan_text(read(name))["findings"] == []


def test_proprietary_marker_upgrades_to_high():
    finding = findings_of(read("proprietary.txt"), "proprietary_code")[0]
    assert finding["severity"] == "high"
    assert finding["evidence"]["match_redacted"].startswith("# CO")
    assert findings_of(read("proprietary.txt"), "source_code") == []


@pytest.mark.parametrize("header", ["// Proprietary and internal", "/* Internal use only */",
                                    "# Copyright 2026 Acme Inc", "# Copyright (c) Widgets Pvt Ltd"])
def test_each_proprietary_marker(header):
    assert findings_of(f"{header}\n{read('python.txt')}", "proprietary_code")


def test_proprietary_word_without_code_is_not_a_finding():
    assert scan_text("This document is confidential.")["findings"] == []


def test_four_code_lines_are_below_the_threshold():
    assert not findings_of("import os\nimport sys\nimport re\nimport json\n", "source_code")
    assert findings_of("import os\nimport sys\nimport re\nimport json\nimport time\n", "source_code")


@pytest.mark.parametrize("name", ["python.txt", "proprietary.txt"])
def test_code_inside_a_json_request_body(name):
    body = json.dumps({"messages": [{"role": "user", "content": read(name)}]})
    assert [f for f in scan_text(body)["findings"] if f["type"] == "source_code"]


def test_code_evidence_never_holds_a_secret():
    text = f'API_KEY = "{samples.OPENAI}"\n' + read("python.txt")
    result = scan_text(text)
    assert samples.OPENAI not in json.dumps(result)
    assert {"openai_key", "source_code"} <= {f["subtype"] for f in result["findings"]}


def test_code_finding_has_no_position():
    evidence = findings_of(read("python.txt"), "source_code")[0]["evidence"]
    assert evidence["line"] is None and evidence["offset"] is None and evidence["entropy"] is None


def test_code_adds_nothing_to_redacted_text():
    text = read("python.txt")
    assert scan_text(text)["redacted_text"] == text


def test_one_code_finding_per_payload():
    assert len(findings_of(read("python.txt") * 3, "source_code")) == 1


def test_minified_single_line_is_not_counted_as_many_lines():
    assert not findings_of("a=>b;" * 5000, "source_code")


def policy(*tokens):
    return {"canary_tokens": list(tokens)}


def test_canary_is_critical_with_full_confidence():
    finding = findings_of(f"note {CANARY} here", "canary_token", policy=policy(CANARY))[0]
    assert finding["type"] == "canary"
    assert finding["severity"] == "critical"
    assert finding["confidence"] == 1.0
    assert finding["title"] == "Honeytoken tripped"
    assert finding["evidence"]["match_redacted"] == "CANA•••••••••A9"


def test_canary_fingerprint_is_what_part_a_compares():
    finding = findings_of(CANARY, "canary_token", policy=policy(CANARY))[0]
    assert finding["evidence"]["fingerprint"] == hashlib.sha256(CANARY.encode()).hexdigest()[:12]


def test_every_occurrence_of_a_canary_is_masked():
    result = scan_text(f"{CANARY} and {CANARY}", policy=policy(CANARY))
    assert CANARY not in result["redacted_text"]
    assert CANARY not in json.dumps(result)


def test_canary_outranks_other_rules_on_the_same_text():
    token = "AKIA" "FAKEFAKEFAKE9999"
    assert [f["subtype"] for f in scan_text(f"key {token}", policy=policy(token))["findings"]] == ["canary_token"]
    assert [f["subtype"] for f in scan_text(f"password={token}", policy=policy(token))["findings"]] == ["canary_token"]


def test_high_entropy_canary_is_not_reported_twice():
    token = samples.ENTROPY_ALNUM
    assert [f["subtype"] for f in scan_text(f"x {token} y", policy=policy(token))["findings"]] == ["canary_token"]


def test_canary_inside_a_json_body():
    assert findings_of(json.dumps({"prompt": f"use {CANARY}"}), "canary_token", policy=policy(CANARY))


@pytest.mark.parametrize("configured", [{}, {"canary_tokens": []}, {"canary_tokens": None}, {"canary_tokens": [""]}])
def test_no_configured_canary_means_no_finding(configured):
    assert scan_text(f"note {CANARY}", policy=configured)["findings"] == []
