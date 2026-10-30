import asyncio
import types

import pytest

from app.engine import detect_adapter as adapter

AWS = "AKIAFAKEFAKEFAKE1234"
AWS_2 = "AKIAEXAMPLEEXAMPLE99"
OPENAI = "sk-proj-FAKEEXAMPLEFAKEEXAMPLE1234"
POLICY = {"canary_tokens": ["CANARY-SS-7F3A9"]}


@pytest.fixture
def builtin():
    original = adapter._detector
    adapter.use_detector(None)
    yield
    adapter.use_detector(original)


def test_package_is_found():
    assert adapter.status()["active"] == "shadowscope_detect"


def test_fallback_detects_the_spec_set(builtin):
    text = f"{AWS} {OPENAI} a.b@example.com -----BEGIN RSA PRIVATE KEY----- eyJhbGciOiJIUzI1.eyJzdWIiOiJGQUtF.FAKEsignature"
    result = adapter.scan_text(text)
    assert {f["subtype"] for f in result["findings"]} == {"aws_access_key", "openai_key", "email", "private_key", "jwt"}
    assert adapter.status()["active"] == "builtin"
    for raw in (AWS, OPENAI, "a.b@example.com"):
        assert raw not in str(result)


@pytest.mark.parametrize("gap", range(0, 80, 3))
def test_snippets_never_contain_a_cut_off_secret(gap):
    text = f"{AWS} {'x' * gap} {AWS_2} {'y' * gap} fake.person@example.com"
    for finding in adapter.scan_text(text)["findings"]:
        snippet = finding["evidence"]["redacted_snippet"]
        assert "AKIAFA" not in snippet and "AKIAEX" not in snippet and "fake.p" not in snippet


def test_secret_the_detector_missed_is_still_masked():
    result = adapter.scan_text(f"token {OPENAI}")
    assert OPENAI not in result["redacted_text"]


@pytest.mark.parametrize("value", [
    OPENAI, "ghp_FAKEEXAMPLEFAKEEXAMPLEFAKEEXAMPLEFAKE", "postgres://fake:FAKEpass123@db.internal/prod",
    'password = "FAKEexamplePass1"', "2345 6789 0124", "FAKPF1234E", "4111 1111 1111 1111", "219-09-9999", "+91 9876543210",
])
def test_harden_masks_common_shapes(value):
    raw = value.split('"')[1] if '"' in value else value
    assert raw not in adapter.harden(f"before {value} after")


def test_harden_is_stable_on_masked_text():
    once = adapter.harden(f"{AWS} password=FAKEexamplePass1 a@example.com")
    assert adapter.harden(once) == once


def test_private_key_block_is_masked_whole():
    body = "\n".join(["FAKEEXAMPLE" * 5] * 3)
    for block in (f"-----BEGIN RSA PRIVATE KEY-----\n{body}\n-----END RSA PRIVATE KEY-----",
                  f"-----BEGIN RSA PRIVATE KEY-----\n{body}\n",
                  f"----••••••••--\n{body}\n"):
        assert "FAKEEXAMPLEFAKE" not in adapter.harden(block)


def test_canary_is_added_once_and_masked():
    result = adapter.scan_text("ref CANARY-SS-7F3A9", policy=POLICY)
    canaries = [f for f in result["findings"] if f["type"] == "canary"]
    assert len(canaries) == 1 and canaries[0]["severity"] == "critical"
    assert "CANARY-SS-7F3A9" not in str(result)


def test_broken_detector_falls_back():
    original = adapter._detector
    def boom(*args, **kwargs):
        raise RuntimeError("boom")
    adapter.use_detector(types.SimpleNamespace(scan_text=boom, redact=boom, classify_process=boom, analyze_agent_payload=boom, triage=boom))
    try:
        assert adapter.scan_text(AWS)["findings"][0]["subtype"] == "aws_access_key"
        assert AWS not in adapter.redact(AWS)
        assert adapter.classify_process("aider")["framework"] == "aider"
        assert adapter.analyze_agent_payload("x", direction="request")["is_agent"] is False
        assert asyncio.run(adapter.triage({"severity": "high"}, AWS, engine_cfg={}))["engine"] == "rules"
    finally:
        adapter.use_detector(original)


@pytest.mark.parametrize("name,cmdline,framework", [
    ("claude", None, "claude_code"), ("Cursor Helper", None, "cursor"), ("python3", ["python3", "langchain_agent.py"], "langchain"),
    ("node", ["node", "crewai_worker.js"], "crewai"), ("python3", ["python3", "manage.py"], None), ("Claude", None, None),
])
def test_process_classification(name, cmdline, framework):
    assert adapter.classify_process(name, cmdline)["framework"] == framework


def test_triage_only_receives_hardened_text(builtin):
    result = asyncio.run(adapter.triage({"severity": "high", "remediation": ["x"]}, f"key {AWS}", engine_cfg={}))
    assert AWS not in result["redacted_input_preview"] and result["engine"] == "rules"
