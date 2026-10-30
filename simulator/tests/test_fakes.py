"""Fakes must be valid enough to trigger the real detector, and stable enough to reproduce."""
import re

import pytest

from shadowscope_detect import scan_text
from shadowscope_detect.validators import luhn, pan_valid, verhoeff
from simulator import fakes


def subtypes(text):
    return {f["subtype"] for f in scan_text(text)["findings"]}


@pytest.mark.parametrize("value,subtype", [
    (fakes.AWS_ACCESS_KEY, "aws_access_key"), (fakes.OPENAI_KEY, "openai_key"), (fakes.STRIPE_LIVE_KEY, "stripe_key"),
    (fakes.GITHUB_TOKEN, "github_token"), (fakes.fake_jwt(), "jwt"), (fakes.DB_URL, "db_connection_url"),
    (fakes.FAKE_PRIVATE_KEY, "private_key"), (f'aws_secret_access_key = "{fakes.AWS_SECRET_KEY}"', "aws_secret_key"),
])
def test_secrets_are_detected(value, subtype):
    assert subtype in subtypes(value)


def test_stripe_key_rates_critical():
    assert scan_text(fakes.STRIPE_LIVE_KEY)["findings"][0]["severity"] == "critical"


def test_jwt_is_not_expired():
    assert scan_text(fakes.fake_jwt())["findings"][0]["severity"] == "high"


@pytest.mark.parametrize("value", [fakes.AWS_ACCESS_KEY, fakes.OPENAI_KEY, fakes.STRIPE_LIVE_KEY, fakes.GITHUB_TOKEN,
                                   fakes.DB_URL, fakes.AWS_SECRET_KEY])
def test_secrets_carry_a_fake_marker(value):
    assert "FAKE" in value or "EXAMPLE" in value


def test_env_file_has_four_critical_kinds():
    critical = {f["subtype"] for f in scan_text(fakes.env_file())["findings"] if f["severity"] == "critical"}
    assert {"aws_access_key", "openai_key", "stripe_key", "db_connection_url"} <= critical


def test_customers_are_valid_and_distinct():
    customers = fakes.fake_customers(20)
    assert len({c.email for c in customers}) == 20
    for customer in customers:
        assert verhoeff(customer.aadhaar.replace(" ", ""))
        assert pan_valid(customer.pan)
        assert re.fullmatch(r"\+91 [6-9]\d{4} \d{5}", customer.phone)


def test_customers_csv_triggers_every_pii_rule():
    assert {"aadhaar", "pan", "phone_in", "upi_id", "email", "bulk_pii"} <= subtypes(fakes.customers_csv(fakes.fake_customers(20)))


def test_same_seed_same_data():
    assert fakes.fake_customers(5) == fakes.fake_customers(5)


@pytest.mark.parametrize("card", fakes.TEST_CARDS)
def test_cards_are_luhn_valid_and_detected(card):
    assert luhn(card.replace(" ", ""))
    assert "credit_card" in subtypes(f"card {card}")


def test_proprietary_module_triggers_code_and_jwt():
    assert {"proprietary_code", "jwt"} <= subtypes(fakes.proprietary_module())


def test_rogue_plan_has_eight_steps():
    assert len(fakes.ROGUE_PLAN) == 8


def test_no_contiguous_provider_prefix_in_the_source():
    source = (fakes.__file__ and open(fakes.__file__).read())
    assert fakes.STRIPE_LIVE_KEY not in source and fakes.AWS_ACCESS_KEY not in source
