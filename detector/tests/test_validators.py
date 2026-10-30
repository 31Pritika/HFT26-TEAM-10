"""Validator unit tests: known vectors for each checksum and format check."""
import base64
import json
import time

import pytest

from shadowscope_detect.entropy import (classify_charset, confidence_from_entropy, in_hash_context, in_key_context,
                                        is_uuid, iter_tokens, looks_random, shannon, threshold_for)
from shadowscope_detect.validators import (VALIDATORS, card_brand, decode_jwt, find_card, is_openai_key, is_placeholder,
                                           jwt_expired, luhn, pan_valid, stripe_mode, verhoeff, verhoeff_check_digit)


@pytest.mark.parametrize("number", ["4111111111111111", "5555555555554444", "378282246310005", "6011111111111117",
                                    "4222222222222", "79927398713", "0"])
def test_luhn_accepts_valid_numbers(number):
    assert luhn(number)


@pytest.mark.parametrize("number", ["4111111111111112", "1234567812345678", "79927398710"])
def test_luhn_rejects_invalid_numbers(number):
    assert not luhn(number)


@pytest.mark.parametrize("number,brand", [
    ("4111111111111111", "visa"), ("5105105105105100", "mastercard"), ("2223003122003222", "mastercard"),
    ("2720990000000000", "mastercard"), ("378282246310005", "amex"), ("341111111111111", "amex"),
    ("6011111111111117", "discover"), ("6500000000000000", "discover"), ("6521000000000000", "rupay"),
    ("6073840000000000", "rupay"), ("8100000000000000", "rupay"), ("8200000000000000", "rupay"),
])
def test_card_brand_by_iin(number, brand):
    assert card_brand(number) == brand


@pytest.mark.parametrize("number", ["1234567890123456", "2220999999999999", "2721000000000000", "5000000000000000",
                                    "5600000000000000", "3000000000000000", "9000000000000000"])
def test_card_brand_rejects_unknown_iin(number):
    assert card_brand(number) is None


def test_find_card_trims_neighbouring_numbers():
    assert find_card("4111111111111111 12") == ("visa", 0, 16)
    assert find_card("12 4111 1111 1111 1111") == ("visa", 3, 22)


def test_find_card_rejects_loose_digit_groups():
    assert find_card("4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1") is None


@pytest.mark.parametrize("number", ["2363", "123451"])
def test_verhoeff_accepts_valid_numbers(number):
    assert verhoeff(number)


@pytest.mark.parametrize("number", ["2364", "123452", "234567890123"])
def test_verhoeff_rejects_invalid_numbers(number):
    assert not verhoeff(number)


@pytest.mark.parametrize("payload,digit", [("236", "3"), ("12345", "1")])
def test_verhoeff_check_digit_known_vectors(payload, digit):
    assert verhoeff_check_digit(payload) == digit


@pytest.mark.parametrize("payload", ["23456789012", "98765432109", "50000000000"])
def test_verhoeff_detects_every_single_digit_error(payload):
    number = payload + verhoeff_check_digit(payload)
    assert verhoeff(number)
    for position in range(len(number)):
        for digit in "0123456789":
            if digit != number[position]:
                assert not verhoeff(number[:position] + digit + number[position + 1:])


@pytest.mark.parametrize("pan", ["ABCPE1234F", "ABCAE1234F", "ABCTE1234F", "ABCJE1234F"])
def test_pan_accepts_each_entity_type(pan):
    assert pan_valid(pan)


@pytest.mark.parametrize("pan", ["ABCDE1234F", "ABCZE1234F", "ABCPE1234"])
def test_pan_rejects_bad_entity_or_length(pan):
    assert not pan_valid(pan)


def _jwt(header: dict, claims: dict) -> str:
    def encode(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()
    return f"{encode(header)}.{encode(claims)}.FAKEsignature"


def test_decode_jwt_reads_header_and_claims_without_verifying():
    assert decode_jwt(_jwt({"alg": "HS256"}, {"sub": "x", "exp": 5})) == ({"alg": "HS256"}, {"sub": "x", "exp": 5})


@pytest.mark.parametrize("token", ["a.b", "not.base64!.jwt", "eyJhbGciOiJub25lIn0.bm90anNvbg.x", "W10.W10.x"])
def test_decode_jwt_rejects_malformed_tokens(token):
    assert decode_jwt(token) is None


def test_jwt_expiry():
    assert jwt_expired({"exp": 100}, now=200)
    assert not jwt_expired({"exp": 300}, now=200)
    assert not jwt_expired({}, now=200)
    assert not jwt_expired({"exp": "soon"}, now=200)
    assert not jwt_expired({"exp": True}, now=200)


def test_jwt_validator_never_echoes_claim_values():
    verdict = VALIDATORS["jwt"](_jwt({"alg": "HS256"}, {"sub": "alice@example.com", "iss": "https://corp.example",
                                                        "exp": int(time.time()) + 3600}), "", 0)
    assert "alice" not in verdict.detail and "corp.example" not in verdict.detail
    assert "alg=HS256" in verdict.detail and "sub=redacted" in verdict.detail and verdict.severity is None


def test_jwt_validator_downgrades_expired_tokens():
    assert VALIDATORS["jwt"](_jwt({"alg": "RS256"}, {"exp": 1000}), "", 0).severity == "medium"


def test_stripe_mode():
    assert stripe_mode("sk_" + "live_abc") == "live"
    assert stripe_mode("rk_" + "live_abc") == "live"
    assert stripe_mode("sk_test_abc") == "test"
    assert stripe_mode("sk_test_live_abc") == "test"


def test_openai_key_disambiguation():
    assert is_openai_key("sk-FAKEfakeFAKE1234567890")
    assert is_openai_key("sk-proj-FAKEfakeFAKE1234567890")
    assert not is_openai_key("sk-ant-api03-FAKEfakeFAKE1234567890")
    assert not is_openai_key("sk-learn-contrib-imbalanced-datasets")


@pytest.mark.parametrize("value", ["${DB_PASSWORD}", "$DB_PASSWORD", "{{ vault_password }}", "<your-password>",
                                   "your_api_key_here", "********", "xxxxxxxxxx", "changeme", "%(password)s"])
def test_placeholders(value):
    assert is_placeholder(value)


@pytest.mark.parametrize("value", ["FAKEpassw0rd123", "EXAMPLEKEY12345678", "hunter2hunter2", "$ecretPa55"])
def test_real_looking_values_are_not_placeholders(value):
    assert not is_placeholder(value)


def test_shannon_entropy():
    assert shannon("") == 0
    assert shannon("aaaa") == 0
    assert shannon("abab") == pytest.approx(1.0)
    assert shannon("abcdefgh") == pytest.approx(3.0)


@pytest.mark.parametrize("token,charset", [("deadbeef0123", "hex"), ("Zebra123", "alnum"), ("abc+def/ghi", "base64"),
                                           ("abc-def_ghi", "base64"), ("hello.world", None), ("a@b", None)])
def test_classify_charset(token, charset):
    assert classify_charset(token) == charset


def test_thresholds_follow_policy():
    assert threshold_for("base64") == 4.0
    assert threshold_for("hex") == 3.0
    assert threshold_for("alnum", 4.5) == 4.5
    assert threshold_for("hex", 4.5) == 3.5


def test_confidence_is_clamped():
    assert confidence_from_entropy(3.0) == 0
    assert confidence_from_entropy(4.25) == 0.5
    assert confidence_from_entropy(6.0) == 1


def test_tokenizer_splits_on_delimiters_and_skips_short_tokens():
    text = 'short key="abcdefghijklmnopqrstuvwxyz" x:0123456789012345678901,y (ABCDEFGHIJKLMNOPQRSTU)'
    assert [m.group() for m in iter_tokens(text)] == ["abcdefghijklmnopqrstuvwxyz", "0123456789012345678901",
                                                      "ABCDEFGHIJKLMNOPQRSTU"]


def test_tokenizer_reports_offsets():
    text = "  abcdefghijklmnopqrstuvwxyz"
    assert next(iter_tokens(text)).start() == 2


def test_is_uuid():
    assert is_uuid("550e8400-e29b-41d4-a716-446655440000")
    assert not is_uuid("550e8400e29b41d4a716446655440000")


def test_hash_and_key_context():
    assert in_hash_context("commit a1b2c3", 7)
    assert in_hash_context("sha256:a1b2c3", 7)
    assert not in_hash_context("commit\nabc", 7)
    assert not in_hash_context("committee a1b2c3", 10)
    assert in_key_context("api token a1b2c3", 10)
    assert not in_key_context("request id a1b2c3", 11)


@pytest.mark.parametrize("token", ["AbstractSingletonProxyFactoryBean", "get_user_profile_by_account_id_v2",
                                   "12345678901234567890", "sha512-AbCdEf0123456789AbCdEf0123456789"])
def test_looks_random_rejects_words_and_numbers(token):
    assert not looks_random(token, classify_charset(token))


@pytest.mark.parametrize("token", ["FAKEa9Zk3Qw7Lp2Xv8Rt5Nm1Bc6Yd4", "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b"])
def test_looks_random_accepts_random_tokens(token):
    assert looks_random(token, classify_charset(token))
