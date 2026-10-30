"""Masking rules, span merging and the leak properties of scan_text/redact."""
import json
import random

import pytest

from shadowscope_detect import redact, scan_text
from shadowscope_detect.redact import MASK_CHAR, Span, apply_masks, mask_aadhaar, mask_email, mask_value, merge_spans
from fixtures import samples
from fixtures.samples import POSITIVE

ALL_SAMPLES = [s for rows in POSITIVE.values() for s in rows]
FILLER = ["Please review this.", "Thanks!", "line break\n", "price: 1299.50", "see below:", "\n\n", "ok ", "{", "}"]


def severities(text):
    return [f["severity"] for f in scan_text(text)["findings"]]


def test_mask_keeps_first_four_and_last_two():
    assert mask_value(samples.AWS_ACCESS) == "AKIA" + MASK_CHAR * 14 + "34"


@pytest.mark.parametrize("value,masked", [("hunter22", "h••••••2"), ("FAKPE1234X", "F••••••••X"), ("abc", "•••")])
def test_short_values_reveal_at_most_two_characters(value, masked):
    assert mask_value(value) == masked


def test_mask_length_is_capped():
    assert len(mask_value("x" * 5000)) == 46


def test_mask_email():
    assert mask_email("priya.sharma@example.co.in") == "p•••@e•••.in"


def test_mask_aadhaar():
    assert mask_aadhaar("2345 6789 0124") == "XXXX XXXX 0124"


def test_redact_applies_spec_masks_in_text():
    assert redact("uid 2345 6789 0124 mail a.b@example.com") == "uid XXXX XXXX 0124 mail a•••@e•••.com"


def test_redact_keeps_the_key_name_of_assignments():
    assert redact(f'password = "{samples.GENERIC_VALUE}"') == 'password = "FAKE•••••••••••ss"'


def test_redact_leaves_clean_text_alone():
    text = "Nothing sensitive here.\nJust two lines."
    assert redact(text) == text


def test_merge_spans_unions_partial_overlaps():
    assert merge_spans([Span(5, 15, "email"), Span(0, 10, "aadhaar")]) == [Span(0, 15)]


def test_merge_spans_keeps_outer_mask_for_contained_spans():
    assert merge_spans([Span(2, 4), Span(0, 10, "email")]) == [Span(0, 10, "email")]


def test_merge_spans_keeps_disjoint_spans():
    spans = [Span(0, 2), Span(2, 4), Span(6, 8)]
    assert merge_spans(spans) == spans


def test_apply_masks_reports_regions():
    redacted, regions = apply_masks("abcdefghijklmnop rest", [Span(0, 16)])
    assert redacted == "abcd••••••••••op rest"
    assert regions[0] == (0, 16, 0, 16)


def test_partially_overlapping_matches_leave_nothing_raw():
    # The generic value stops at the space, inside the card: neither span contains the other.
    result = scan_text("password=Zq7Xk9-4111 1111 1111 1111 end")
    assert [f["subtype"] for f in result["findings"]] == ["credit_card"]
    assert "k9-4111" not in result["redacted_text"] and "1111 1111" not in result["redacted_text"]


@pytest.mark.parametrize("pem", [samples.PEM_RSA, samples.PEM_OPENSSH, samples.PEM_PGP, samples.PEM_ESCAPED])
def test_private_key_body_is_masked_not_just_the_header(pem):
    result = scan_text(f"here you go:\n{pem}\nthanks!")
    assert samples.PEM_BODY not in json.dumps(result)
    assert "thanks!" in result["redacted_text"]


def test_truncated_private_key_is_masked_to_the_end_of_its_body():
    result = scan_text(f"{samples.PEM_TRUNCATED}\n\nDoes this look right?")
    assert samples.PEM_BODY not in json.dumps(result)
    assert "Does this look right?" in result["redacted_text"]


def test_private_key_in_json_string_without_end_marker():
    pem = "-----BEGIN " + f"PRIVATE KEY-----\\n{samples.PEM_BODY}\\n{samples.PEM_BODY}"
    result = scan_text('{"private_key": "' + pem + '", "client_email_hint": "none"}')
    assert samples.PEM_BODY not in json.dumps(result)
    assert '"client_email_hint"' in result["redacted_text"]


def test_snippet_never_shows_a_secret_cut_by_the_context_window():
    # The second key starts inside the first finding's ±40 window and ends outside it.
    text = f"{samples.AWS_ACCESS} {'x ' * 10}{samples.GROQ} tail"
    for finding in scan_text(text)["findings"]:
        assert samples.GROQ[4:24] not in finding["evidence"]["redacted_snippet"]


def test_snippet_has_forty_chars_of_context():
    left, right = "L" * 60 + " ", " " + "R" * 60
    snippet = only_snippet(f"{left}{samples.AWS_ACCESS}{right}")
    assert snippet == "L" * 39 + " AKIA" + MASK_CHAR * 14 + "34 " + "R" * 39


def only_snippet(text):
    return scan_text(text)["findings"][0]["evidence"]["redacted_snippet"]


@pytest.mark.parametrize("sample", ALL_SAMPLES, ids=lambda s: s.value[:24])
def test_match_redacted_appears_verbatim_in_redacted_text(sample):
    # Part A's detect_adapter rebuilds snippets with redacted_text.find(match_redacted).
    result = scan_text(sample.text)
    assert result["findings"]
    for finding in result["findings"]:
        assert finding["evidence"]["match_redacted"] in result["redacted_text"]


def test_match_redacted_is_verbatim_when_spans_merge():
    result = scan_text("password=Zq7Xk9-4111 1111 1111 1111 end")
    assert result["findings"][0]["evidence"]["match_redacted"] in result["redacted_text"]


@pytest.mark.parametrize("sample", ALL_SAMPLES, ids=lambda s: s.value[:24])
def test_no_raw_value_in_any_output_field(sample):
    result = scan_text(sample.text)
    assert sample.value not in json.dumps(result, ensure_ascii=False)


@pytest.mark.parametrize("sample", ALL_SAMPLES, ids=lambda s: s.value[:24])
def test_redacted_sample_rescans_with_no_critical_findings(sample):
    assert "critical" not in severities(redact(sample.text))


@pytest.mark.parametrize("seed", range(100))
def test_property_redacted_mix_rescans_clean(seed):
    rng = random.Random(seed)
    chosen = rng.sample(ALL_SAMPLES, k=rng.randint(2, 25))
    parts = [piece for sample in chosen for piece in (sample.text, rng.choice(FILLER))]
    text = rng.choice([" ", "\n", ", "]).join(parts)

    redacted = redact(text)
    assert "critical" not in severities(redacted)
    for sample in chosen:
        assert sample.value not in redacted


@pytest.mark.parametrize("seed", range(20))
def test_property_redaction_is_idempotent(seed):
    rng = random.Random(seed)
    text = "\n".join(s.text for s in rng.sample(ALL_SAMPLES, k=10))
    once = redact(text)
    assert redact(once) == once
