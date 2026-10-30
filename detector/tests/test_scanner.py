"""scan_text behaviour: per-subtype positives and negatives, overlaps, bulk rules, scoring, performance."""
import inspect
import json
import pathlib
import time

import pytest

import shadowscope_detect
from shadowscope_detect import scan_text
from fixtures import samples
from fixtures.samples import NEGATIVE, POSITIVE

CLEAN_DIR = pathlib.Path(__file__).parent / "fixtures" / "clean"
ALL_SUBTYPES = sorted(POSITIVE)


def subtypes(text, **kw):
    return [f["subtype"] for f in scan_text(text, **kw)["findings"]]


def only(text, subtype):
    found = [f for f in scan_text(text)["findings"] if f["subtype"] == subtype]
    assert len(found) == 1, found
    return found[0]


@pytest.mark.parametrize("subtype,sample", [(s, x) for s in ALL_SUBTYPES for x in POSITIVE[s]],
                         ids=lambda v: v if isinstance(v, str) else "")
def test_positive(subtype, sample):
    assert subtype in subtypes(sample.text)


@pytest.mark.parametrize("subtype,text", [(s, x) for s in ALL_SUBTYPES for x in NEGATIVE[s]],
                         ids=lambda v: v[:40])
def test_negative(subtype, text):
    assert subtype not in subtypes(text)


def in_openai_body(text):
    return json.dumps({"model": "gpt-4o", "messages": [{"role": "user", "content": text}]})


def in_anthropic_body(text):
    return json.dumps({"model": "claude", "messages": [{"role": "user", "content": [{"type": "text", "text": text}]}]})


@pytest.mark.parametrize("wrap", [in_openai_body, in_anthropic_body])
@pytest.mark.parametrize("subtype,sample", [(s, x) for s in ALL_SUBTYPES for x in POSITIVE[s]],
                         ids=lambda v: v if isinstance(v, str) else "")
def test_positive_inside_a_json_request_body(wrap, subtype, sample):
    result = scan_text(wrap(sample.text))
    assert subtype in [f["subtype"] for f in result["findings"]]
    assert json.dumps(sample.value)[1:-1] not in result["redacted_text"]


def test_value_right_after_an_escaped_newline_is_found():
    assert "aadhaar" in subtypes(in_openai_body("name\n2345 6789 0124\nend"))
    assert "pan" in subtypes(in_openai_body("name,x\nFAKPE1234X,y"))
    assert only(in_openai_body("a\npriya@example.com\nb"), "email")["evidence"]["match_redacted"] == "p•••@e•••.com"


def test_offsets_in_json_bodies_point_at_the_raw_text():
    body = in_openai_body(f"line one\nkey {samples.AWS_ACCESS}")
    assert only(body, "aws_access_key")["evidence"]["offset"] == body.index(samples.AWS_ACCESS)


def test_escapes_stay_literal_outside_json():
    value = "Zq7\\nXk9\\tPw4"
    assert only(f"password={value} rest", "generic_secret_assignment")["evidence"]["fingerprint"] == \
        __import__("hashlib").sha256(value.encode()).hexdigest()[:12]


def test_every_spec_subtype_is_covered():
    assert set(POSITIVE) == set(NEGATIVE)
    assert len(POSITIVE) == 32  # master §8.1 (19 rows) + §8.2 (13 rows)


@pytest.mark.parametrize("path", sorted(CLEAN_DIR.iterdir()), ids=lambda p: p.name)
def test_clean_text_has_no_findings(path):
    assert scan_text(path.read_text())["findings"] == []


def test_uuid_is_info_only_in_key_context():
    uuid = "550e8400-e29b-41d4-a716-446655440000"
    assert scan_text(f"request {uuid}")["findings"] == []
    finding = only(f"session token {uuid}", "high_entropy_string")
    assert finding["severity"] == "info"


def test_hex_sha_flagged_outside_commit_context():
    sha = "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d"
    assert subtypes(f"commit {sha}") == []
    assert subtypes(f"value {sha}") == ["high_entropy_string"]


def test_base64_image_is_skipped_but_kept_in_redacted_text():
    text = "see data:image/png;base64," + "QUJD" * 50 + " and " + samples.AWS_ACCESS
    result = scan_text(text)
    assert [f["subtype"] for f in result["findings"]] == ["aws_access_key"]
    assert "QUJD" * 50 in result["redacted_text"]


# --- severity + validators in context -----------------------------------------------------------------------------

@pytest.mark.parametrize("key,severity,title", [(samples.STRIPE_LIVE, "critical", "Live Stripe key exposed"),
                                                (samples.STRIPE_TEST, "medium", "Test Stripe key exposed")])
def test_stripe_severity(key, severity, title):
    finding = only(f"key {key}", "stripe_key")
    assert (finding["severity"], finding["title"]) == (severity, title)


def test_jwt_description_and_expiry():
    live = only(samples.JWT_VALID, "jwt")
    assert live["severity"] == "high"
    assert live["detector"] == "validator"
    assert "alg=HS256" in live["description"] and "exp=4102444800" in live["description"]
    assert "iss=redacted" in live["description"] and "sub=redacted" in live["description"]
    assert only(samples.JWT_EXPIRED, "jwt")["severity"] == "medium"


def test_jwt_that_does_not_decode_is_low_confidence():
    assert only("eyJabcdefghijk.eyJabcdefghijk.abcdefghijk", "jwt")["confidence"] == 0.6


def test_policy_sets_entropy_threshold():
    text = f"blob {samples.ENTROPY_ALNUM} end"
    assert subtypes(text, policy={"entropy_threshold": 4.0}) == ["high_entropy_string"]
    assert subtypes(text, policy={"entropy_threshold": 6.0}) == []


def test_entropy_confidence_follows_spec_formula():
    finding = only(f"blob {samples.ENTROPY_ALNUM} end", "high_entropy_string")
    assert finding["confidence"] == round(min(1, (finding["evidence"]["entropy"] - 3.5) / 1.5), 2)
    assert finding["detector"] == "entropy"


# --- overlap resolution -------------------------------------------------------------------------------------------

@pytest.mark.parametrize("text,expected", [
    (f'api_key = "{samples.OPENAI}"', ["openai_key"]),
    (f"secret_key={samples.STRIPE_TEST}", ["stripe_key"]),
    (f"token: {samples.ANTHROPIC}", ["anthropic_key"]),
    (f"password={samples.JWT_VALID}", ["jwt"]),
    ("+91 9876543210", ["phone_in"]),
    (f"{samples.DB_POSTGRES}/app", ["db_connection_url"]),
    ("postgres://u:FAKEpassw0rd@db.prod.internal:5432/app", ["db_connection_url"]),
    ("mysql://u:FAKEpassw0rd@10.0.0.5:3306/app", ["db_connection_url"]),
    ("ops@build.internal", ["email"]),
])
def test_most_specific_rule_wins(text, expected):
    assert subtypes(text) == expected


def test_private_key_body_is_one_finding():
    assert subtypes(samples.PEM_RSA) == ["private_key"]


def test_each_of_several_secrets_is_reported():
    text = f"{samples.AWS_ACCESS} {samples.OPENAI} {samples.GITHUB_CLASSIC}"
    assert subtypes(text) == ["aws_access_key", "openai_key", "github_token"]


# --- bulk rules ---------------------------------------------------------------------------------------------------

def emails(n):
    return " ".join(f"customer{i}@example.com" for i in range(n))


def test_bulk_pii_needs_five_distinct_emails():
    assert "bulk_pii" not in subtypes(emails(4))
    assert "bulk_pii" not in subtypes("same@example.com " * 9)
    finding = only(emails(5), "bulk_pii")
    assert finding["severity"] == "high"
    assert "5 email addresses" in finding["description"]


def test_bulk_pii_needs_three_aadhaar_or_pan():
    aadhaar = ["2345 6789 0124", "9876 5432 1012", "5678 1234 5678"]
    assert "bulk_pii" not in subtypes(" ".join(aadhaar[:2]))
    assert "bulk_pii" in subtypes(" ".join(aadhaar))
    assert "bulk_pii" in subtypes(f"{aadhaar[0]} {aadhaar[1]} FAKPE1234X")


def test_aadhaar_next_to_other_numbers_is_still_found():
    assert "aadhaar" in subtypes("2345 6789 0124 9876543210")


def test_bulk_pii_is_extra_and_only_once():
    found = subtypes(f"{emails(6)} 2345 6789 0124 9876 5432 1012, 5678 1234 5678")
    assert found.count("bulk_pii") == 1
    assert found.count("email") == 6


# --- result shape -------------------------------------------------------------------------------------------------

def test_finding_shape_matches_contract():
    finding = scan_text(f"line one\nkey {samples.AWS_ACCESS}")["findings"][0]
    assert set(finding) == {"type", "subtype", "severity", "confidence", "title", "description", "evidence",
                            "detector", "compliance", "remediation"}
    assert set(finding["evidence"]) == {"redacted_snippet", "match_redacted", "entropy", "line", "offset",
                                        "fingerprint"}
    assert finding["evidence"]["line"] == 2
    assert finding["evidence"]["offset"] == 13
    assert len(finding["evidence"]["fingerprint"]) == 12
    assert finding["compliance"] == ["SOC2", "ISO27001"]
    assert finding["remediation"][0] == "Deactivate key in IAM now"
    json.dumps(finding)


def test_fingerprint_is_stable_and_hashes_the_raw_match():
    import hashlib
    expected = hashlib.sha256(samples.AWS_ACCESS.encode()).hexdigest()[:12]
    assert only(f"a {samples.AWS_ACCESS}", "aws_access_key")["evidence"]["fingerprint"] == expected
    assert only(f"b {samples.AWS_ACCESS} c", "aws_access_key")["evidence"]["fingerprint"] == expected


def test_card_compliance_includes_pci():
    assert "PCI-DSS" in only("4111 1111 1111 1111", "credit_card")["compliance"]


def test_empty_text():
    result = scan_text("")
    assert result["findings"] == [] and result["risk_score"] == 0 and result["redacted_text"] == ""
    assert result["stats"]["chars"] == 0 and result["stats"]["lines"] == 0


def test_stats():
    text = f"one\ntwo {samples.AWS_ACCESS}\n"
    stats = scan_text(text)["stats"]
    assert stats["chars"] == len(text)
    assert stats["lines"] == 3
    assert stats["flagged_tokens"] == 1
    assert stats["entropy_max"] > 2
    assert stats["duration_ms"] >= 0


@pytest.mark.parametrize("text,score", [("nothing here", 0), ("mail a@example.com", 20),
                                        (samples.AWS_ACCESS, 60), (f"{samples.AWS_ACCESS} a@example.com", 70),
                                        (f"{samples.AWS_ACCESS} {samples.OPENAI}", 90)])
def test_risk_score_uses_weights_with_diminishing_returns(text, score):
    assert scan_text(text)["risk_score"] == score


def test_risk_score_caps_at_100():
    text = " ".join(s.text for rows in POSITIVE.values() for s in rows)
    assert scan_text(text)["risk_score"] == 100


def test_findings_are_most_severe_first():
    severities = [f["severity"] for f in scan_text(f"a@example.com {samples.AWS_ACCESS}")["findings"]]
    assert severities == ["critical", "medium"]


def test_public_signatures_are_frozen():
    assert str(inspect.signature(shadowscope_detect.scan_text)) == \
        "(text: 'str', *, context: 'dict | None' = None, policy: 'dict | None' = None) -> 'ScanResult'"
    assert str(inspect.signature(shadowscope_detect.redact)) == "(text: 'str') -> 'str'"
    assert str(inspect.signature(shadowscope_detect.analyze_agent_payload)) == \
        "(payload: 'dict | str', *, direction: 'str') -> 'dict'"
    assert str(inspect.signature(shadowscope_detect.classify_process)) == \
        "(name: 'str', cmdline: 'list[str] | None') -> 'dict'"
    assert str(inspect.signature(shadowscope_detect.triage)) == \
        "(finding: 'dict', context_snippet: 'str', *, engine_cfg: 'dict') -> 'dict'"


# --- performance --------------------------------------------------------------------------------------------------

MB = 1_000_000
_PROSE = "The quick brown fox jumps over the lazy dog while order 1042 ships on 2026-03-15 for 1299.50 INR. "
_CODE = 'def handle(request):\n    user_id = request.args.get("id", 42)\n    return jsonify({"count": 12345})\n'
_LOG = "2026-03-15T10:30:45.123Z INFO req=550e8400-e29b-41d4-a716-446655440000 ip=8.8.8.8 path=/api/v1/users/9\n"


def test_one_megabyte_meets_the_spec_budget():
    text = ((_PROSE + _CODE + _LOG) * (MB // len(_PROSE + _CODE + _LOG) + 1))[:MB]
    assert scan_text(text)["stats"]["duration_ms"] < 400


@pytest.mark.parametrize("text", ["a" * MB, "a-" * (MB // 2), "a." * (MB // 2), "a@" * (MB // 2), "1" * MB,
                                  "A" * MB, "password" + " " * MB, 'password = "' + "x" * MB,
                                  "postgres://aaaa:" * (MB // 16), "-----BEGIN PRIVATE KEY-----\n" * (MB // 28)],
                         ids=["word_run", "hyphens", "dots", "ats", "digits", "upper", "spaces", "open_quote",
                              "url_noise", "pem_no_end"])
def test_pathological_inputs_stay_linear(text):
    started = time.perf_counter()
    scan_text(text)
    assert time.perf_counter() - started < 3
