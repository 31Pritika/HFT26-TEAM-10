"""Master §8.1 as data. Regexes follow the spec; deviations are listed in docs/progress/aaraadhyaa.md."""
from __future__ import annotations

import re

from . import TIER_GENERIC, TIER_NAMED, Rule


def _secret(id: str, pattern: str, severity: str, title: str, *, flags: int = re.ASCII, tier: int = TIER_NAMED,
            **kw) -> Rule:
    return Rule(id=id, type="secret", regex=re.compile(pattern, flags), severity=severity, title=title, tier=tier, **kw)


AWS_ACCESS_KEY = _secret(
    "aws_access_key", r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b", "critical", "AWS access key in AI prompt",
    keywords=("akia", "asia"), confidence=0.97,
)
AWS_SECRET_KEY = _secret(
    "aws_secret_key",
    r"""aws.{0,20}(?:secret|private).{0,20}?(?<![0-9a-zA-Z/+])(?P<value>[0-9a-zA-Z/+]{40})(?![0-9a-zA-Z/+=])""",
    "critical", "AWS secret key in AI prompt", flags=re.ASCII | re.IGNORECASE,
    keywords=("aws",), value_groups=("value",), confidence=0.95,
)
OPENAI_KEY = _secret(
    "openai_key", r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b", "critical", "OpenAI API key exposed",
    validator="openai_key", keywords=("sk-",), confidence=0.95,
)
ANTHROPIC_KEY = _secret(
    "anthropic_key", r"\bsk-ant-[A-Za-z0-9_-]{20,}\b", "critical", "Anthropic API key exposed",
    keywords=("sk-ant-",), confidence=0.98,
)
GITHUB_TOKEN = _secret(
    "github_token", r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b", "critical",
    "GitHub token exposed", keywords=("ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"), confidence=0.98,
)
GOOGLE_API_KEY = _secret(
    "google_api_key", r"\bAIza[0-9A-Za-z_-]{35}(?![\w-])", "high", "Google API key exposed",
    keywords=("aiza",), confidence=0.95,
)
SLACK_TOKEN = _secret(
    "slack_token", r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b", "high", "Slack token exposed",
    keywords=("xox",), confidence=0.95,
)
STRIPE_KEY = _secret(
    "stripe_key", r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b", "critical", "{mode} Stripe key exposed",
    validator="stripe_key", keywords=("sk_live_", "sk_test_", "rk_live_", "rk_test_"), confidence=0.97,
)
HF_TOKEN = _secret(
    "hf_token", r"\bhf_[A-Za-z0-9]{30,}\b", "high", "Hugging Face token exposed", keywords=("hf_",),
    confidence=0.93,
)
GROQ_KEY = _secret(
    "groq_key", r"\bgsk_[A-Za-z0-9]{40,}\b", "high", "Groq API key exposed", keywords=("gsk_",), confidence=0.95,
)
NPM_TOKEN = _secret(
    "npm_token", r"\bnpm_[A-Za-z0-9]{36}\b", "high", "npm token exposed", keywords=("npm_",), confidence=0.95,
)
SENDGRID_KEY = _secret(
    "sendgrid_key", r"\bSG\.[\w-]{22}\.[\w-]{43}(?![\w-])", "high", "SendGrid key exposed", keywords=("sg.",),
    confidence=0.97,
)
JWT = _secret(
    "jwt", r"\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b", "high", "JWT in AI prompt{claims}",
    validator="jwt", keywords=("eyj",), confidence=0.95, detector="validator",
)
PRIVATE_KEY = _secret(
    "private_key", r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----", "critical",
    "Private key pasted into AI tool", validator="private_key", keywords=("private key",), confidence=0.99,
)
DB_CONNECTION_URL = _secret(
    "db_connection_url",
    r"""\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)://[^\s:@/'"]*:[^\s@/'"]+@[^\s/'"]+""",
    "critical", "Database URL with credentials", validator="db_url", keywords=("://",), confidence=0.95,
)
AZURE_CONN_STRING = _secret(
    "azure_conn_string", r"""DefaultEndpointsProtocol=https?;AccountName=[^;\s'"]+;AccountKey=[^;\s'"]+""",
    "critical", "Azure storage connection string", keywords=("defaultendpointsprotocol=",), confidence=0.98,
)
GCP_SERVICE_ACCOUNT = _secret(
    "gcp_service_account", r'"type"\s*:\s*"service_account"', "critical", "GCP service account JSON",
    keywords=("service_account",), confidence=0.97,
)
GENERIC_SECRET_ASSIGNMENT = _secret(
    "generic_secret_assignment",
    r"""(?<![A-Za-z0-9])(?:password|passwd|pwd|secret(?:[_-]?key)?|api[_-]?key|access[_-]?token|auth[_-]?token"""
    r"""|client[_-]?secret)(?![A-Za-z0-9_-])['"]?\s*(?::=|=>|[:=])\s*"""
    r"""(?:"(?P<dq>[^"\n]{8,})"|'(?P<sq>[^'\n]{8,})'|(?P<bare>[^\s'"]{8,}))""",
    "high", "Hard-coded secret assignment", flags=re.ASCII | re.IGNORECASE, tier=TIER_GENERIC,
    validator="generic_value", value_groups=("dq", "sq", "bare"), confidence=0.75,
    keywords=("password", "passwd", "pwd", "secret", "api_key", "api-key", "apikey", "token"),
)
HIGH_ENTROPY_STRING = Rule(
    id="high_entropy_string", type="secret", regex=None, severity="medium", title="High-entropy token",
    detector="entropy", tier=0,
)

SECRET_RULES: tuple[Rule, ...] = (
    AWS_ACCESS_KEY, AWS_SECRET_KEY, OPENAI_KEY, ANTHROPIC_KEY, GITHUB_TOKEN, GOOGLE_API_KEY, SLACK_TOKEN,
    STRIPE_KEY, HF_TOKEN, GROQ_KEY, NPM_TOKEN, SENDGRID_KEY, JWT, PRIVATE_KEY, DB_CONNECTION_URL,
    AZURE_CONN_STRING, GCP_SERVICE_ACCOUNT, GENERIC_SECRET_ASSIGNMENT,
)
