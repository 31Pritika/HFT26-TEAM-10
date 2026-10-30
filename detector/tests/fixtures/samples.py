"""Fake-but-valid detection samples for every §8.1/§8.2 subtype. Nothing here is a real credential.

Values are marked FAKE/EXAMPLE where the format allows. Provider prefixes are split across string literals so that
secret scanners (GitHub push protection included) do not mistake this file for a real leak.
"""
from typing import NamedTuple


class Sample(NamedTuple):
    text: str
    value: str  # the raw sensitive value, which must never appear in scan output


def _s(template: str, value: str) -> Sample:
    return Sample(template.format(value), value)


AWS_ACCESS = "AKIA" "FAKEFAKEFAKE1234"
AWS_STS = "ASIA" "FAKEFAKEFAKE5678"
AWS_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
OPENAI = "sk-" "FAKEfakeFAKEfake1234567890abcd"
OPENAI_PROJECT = "sk-" "proj-FAKEfake_FAKEfake-1234567890"
ANTHROPIC = "sk-" "ant-api03-FAKEfakeFAKEfake1234567890"
GITHUB_CLASSIC = "ghp_" "FAKEfakeFAKEfakeFAKEfakeFAKEfake1234"
GITHUB_SERVER = "ghs_" "FAKEfakeFAKEfakeFAKEfakeFAKEfake5678"
GITHUB_FINE = "github_" "pat_FAKEfake_FAKEfakeFAKEfake1234"
GOOGLE = "AIza" "FAKEfakeFAKEfakeFAKEfakeFAKEfake123"
SLACK = "xoxb-" "0000000000-FAKEfakeFAKEfake"
STRIPE_LIVE = "sk_" "live_FAKEfakeFAKEfake1234"
STRIPE_RESTRICTED = "rk_" "live_FAKEfakeFAKEfake5678"
STRIPE_TEST = "sk_" "test_FAKEfakeFAKEfake1234"
HF = "hf_" "FAKEfakeFAKEfakeFAKEfakeFAKEfake12"
GROQ = "gsk_" "FAKEfakeFAKEfakeFAKEfakeFAKEfakeFAKEfake1234"
NPM = "npm_" "FAKEfakeFAKEfakeFAKEfakeFAKEfake1234"
SENDGRID = "SG." "FAKEfakeFAKEfakeFAKE12." "FAKEfakeFAKEfakeFAKEfakeFAKEfakeFAKEfake123"
JWT_HEADER = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
JWT_VALID = (JWT_HEADER + ".eyJzdWIiOiJGQUtFLXVzZXItMTIzNCIsImlzcyI6Imh0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSIsImV4cCI6"
             "NDEwMjQ0NDgwMH0.FAKEsignatureFAKEsignature")
JWT_EXPIRED = JWT_HEADER + ".eyJzdWIiOiJGQUtFLXVzZXItMTIzNCIsImV4cCI6MTAwMDAwMDAwMH0.FAKEsignatureFAKEsignature"
PEM_BODY = "FAKEKEYFAKEKEYFAKEKEYFAKEKEYFAKEKEYFAKEKEYFAKEKEYFAKEKEY1234"
PEM_RSA = "-----BEGIN RSA " f"PRIVATE KEY-----\n{PEM_BODY}\n{PEM_BODY}\n-----END RSA " "PRIVATE KEY-----"
PEM_OPENSSH = "-----BEGIN OPENSSH " f"PRIVATE KEY-----\n{PEM_BODY}\n-----END OPENSSH " "PRIVATE KEY-----"
PEM_PGP = ("-----BEGIN PGP " f"PRIVATE KEY BLOCK-----\nVersion: FAKE\n\n{PEM_BODY}\n"
           "-----END PGP " "PRIVATE KEY BLOCK-----")
PEM_TRUNCATED = "-----BEGIN " f"PRIVATE KEY-----\n{PEM_BODY}\n{PEM_BODY}"
PEM_ESCAPED = "-----BEGIN " f"PRIVATE KEY-----\\n{PEM_BODY}\\n-----END " "PRIVATE KEY-----\\n"
DB_POSTGRES = "postgres://admin:FAKEpassw0rd@db.example.com:5432"
DB_MONGO = "mongodb+srv://svc:FAKEpassw0rd@cluster0.example.net"
DB_REDIS = "redis://:FAKEpassw0rd@cache.example.com:6379"
AZURE = ("DefaultEndpointsProtocol=https;AccountName=fakeacct;" "AccountKey=" "FAKEfakeFAKEfakeFAKEfake1234567890==")
GENERIC_VALUE = "FAKE-hunter2-pass"
ENTROPY_ALNUM = "FAKEa9Zk3Qw7Lp2Xv8Rt5Nm1Bc6Yd4Hs0J"
ENTROPY_B64 = "FAKE+9Zk3Qw7/Lp2Xv8Rt5Nm1Bc6Yd4Hs0Jq"
ENTROPY_HEX = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b"

POSITIVE: dict[str, list[Sample]] = {
    "aws_access_key": [_s("AWS_ACCESS_KEY_ID={}", AWS_ACCESS), _s("session key {} issued", AWS_STS)],
    "aws_secret_key": [_s('aws_secret_access_key = "{}"', AWS_SECRET), _s("AWS_SECRET_ACCESS_KEY={}", AWS_SECRET)],
    "openai_key": [_s("OPENAI_API_KEY={}", OPENAI), _s("client = OpenAI(api_key='{}')", OPENAI_PROJECT)],
    "anthropic_key": [_s("x-api-key: {}", ANTHROPIC)],
    "github_token": [_s("token {}", GITHUB_CLASSIC), _s("GH={}", GITHUB_SERVER), _s("pat: {}", GITHUB_FINE)],
    "google_api_key": [_s("key={}&q=test", GOOGLE)],
    "slack_token": [_s("SLACK_BOT={}", SLACK)],
    "stripe_key": [_s("stripe.api_key = '{}'", STRIPE_LIVE), _s("restricted {}", STRIPE_RESTRICTED),
                   _s("test mode {}", STRIPE_TEST)],
    "hf_token": [_s("HF_TOKEN={}", HF)],
    "groq_key": [_s("GROQ_API_KEY={}", GROQ)],
    "npm_token": [_s("//registry.npmjs.org/:_authToken={}", NPM)],
    "sendgrid_key": [_s("SENDGRID={}", SENDGRID)],
    "jwt": [_s("Authorization: Bearer {}", JWT_VALID), _s("old token {}", JWT_EXPIRED)],
    "private_key": [_s("key:\n{}\n", PEM_RSA), _s("{}", PEM_OPENSSH), _s("{}", PEM_PGP), _s("{}", PEM_TRUNCATED),
                    _s('{{"private_key": "{}"}}', PEM_ESCAPED)],
    "db_connection_url": [_s("DATABASE_URL={}/prod", DB_POSTGRES), _s("mongo: {}/app", DB_MONGO), _s("{}/0", DB_REDIS)],
    "azure_conn_string": [_s("conn = {};EndpointSuffix=core.windows.net", AZURE)],
    "gcp_service_account": [_s("{}", '{"type": "service_account", "project_id": "fake-project"}'),
                            _s("{}", '"type":"service_account"')],
    "generic_secret_assignment": [_s("password = '{}'", GENERIC_VALUE), _s("DB_PASSWORD={}", GENERIC_VALUE),
                                  _s('{{"client_secret": "{}"}}', GENERIC_VALUE), _s("api-key: {}", GENERIC_VALUE),
                                  _s('SECRET_KEY = "{}"', GENERIC_VALUE), _s("password := \"{}\"", GENERIC_VALUE),
                                  _s('password = "{}"', "FAKE horse battery staple")],
    "high_entropy_string": [_s("blob {} end", ENTROPY_ALNUM), _s("blob {} end", ENTROPY_B64),
                            _s("session_id: {}", ENTROPY_HEX)],
    "email": [_s("contact {} today", "priya.sharma+test@example.com"), _s("mail: {}.", "bob@mail.example.co.in")],
    "phone_in": [_s("call {} now", "+91 98765 43210"), _s("call {} now", "+91-9876543210"),
                 _s("mobile: {}", "9876543210"), _s("mobile: {}", "98765-43210")],
    "phone_intl": [_s("call {}", "+44 20 7946 0958"), _s("call {}", "+14155550100")],
    "aadhaar": [_s("Aadhaar: {}", "2345 6789 0124"), _s("uid {}", "987654321012"), _s("uid {}", "5678-1234-5678")],
    "pan": [_s("PAN {}", "FAKPE1234X"), _s("pan: {}", "ABCTE9876Z")],
    "gstin": [_s("GSTIN {}", "27FAKPE1234F1Z5")],
    "upi_id": [_s("pay {}", "demo.user@okaxis"), _s("pay {}", "9876543210@ybl"), _s("pay {} now", "fake-shop@paytm")],
    "ifsc": [_s("IFSC {}", "FAKE0001234"), _s("branch {}", "SBIN0123456")],
    "passport_in": [_s("Passport No: {}", "A1234567"), _s("{} is the passport on file", "S7654321")],
    "credit_card": [_s("card {}", "4111 1111 1111 1111"), _s("card {}", "5555-5555-5555-4444"),
                    _s("card {}", "378282246310005"), _s("card {}", "6011111111111117"),
                    _s("card {}", "2223000000000007"), _s("rupay {}", "6073840000000008"),
                    _s("rupay {}", "6521000000000007"), _s("rupay {}", "8170000000000007"),
                    _s("rupay {}", "8200000000000001"), _s("card {} 12/26", "4111111111111111")],
    "us_ssn": [_s("SSN: {}", "123-45-6789")],
    "private_ip": [_s("host {} is up", "10.0.0.12"), _s("gw {}", "172.16.5.1"), _s("router {}", "192.168.1.254")],
    "internal_host": [_s("GET http://{}/admin", "internal-api.corp"), _s("connect {}:5432", "db.prod.internal"),
                      _s("ssh {}", "build01.lan")],
}

NEGATIVE: dict[str, list[str]] = {
    "aws_access_key": ["AKIA1234", "XAKIAFAKEFAKEFAKE1234", "akiafakefakefake1234"],
    "aws_secret_key": ['aws_region = "us-east-1"', 'secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" # no provider'],
    "openai_key": ["sk-short", "sk-learn-contrib-imbalanced-datasets", "task-abcdefghijklmnopqrstuvwxyz", ANTHROPIC],
    "anthropic_key": ["sk-ant-short", OPENAI],
    "github_token": ["ghp_short", "github_pat_short"],
    "google_api_key": ["AIzaShort", "AIza" + "a" * 34],
    "slack_token": ["xoxb-short", "xoxz-0000000000-FAKE"],
    "stripe_key": ["sk_live_short", "pk_" + "live_FAKEfakeFAKEfake1234"],
    "hf_token": ["hf_short"],
    "groq_key": ["gsk_short"],
    "npm_token": ["npm_short", "npm_" + "a" * 35],
    "sendgrid_key": ["SG.short.short"],
    "jwt": ["eyJhbGciOi", "eyJabc.def.ghi"],
    "private_key": ["-----BEGIN PUBLIC KEY-----", "-----BEGIN CERTIFICATE-----", "a private key is secret"],
    "db_connection_url": ["postgres://localhost:5432/app", "postgres://user:${DB_PASSWORD}@db/app",
                          "mysql://root:<password>@localhost/app", "https://user:pw@example.com/x"],
    "azure_conn_string": ["DefaultEndpointsProtocol=https;AccountName=fakeacct"],
    "gcp_service_account": ['"type": "user"', "service_account = 1"],
    "generic_secret_assignment": ["password = aaaaaaaa", "password: str", "password = ${DB_PASSWORD}",
                                  'api_key = os.environ["API_KEY"]', "password = settings.DB_PASSWORD",
                                  "secret: <your-secret>", "api_key: your_api_key_here", "secret: {{ vault_secret }}",
                                  "password_reset_url = 'https://example.com/reset'", "password == other_value",
                                  "api_key=https://docs.example.com/keys", "pwd = os.getcwd()"],
    "high_entropy_string": ["AbstractSingletonProxyFactoryBean", "get_user_profile_by_account_id_v2",
                            "/usr/local/lib/node_modules/typescript/bin/tsserver",
                            "12345678901234567890", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    "email": ["react@18.2.0", "logo@2x.png", "git@github.com:org/repo.git", "@types/node", "foo @ bar.com"],
    "phone_in": ["1698765432123", "5876543210", "98765", "0.9876543210", "order-9876543210", "20236234567890"],
    "phone_intl": ["a+1234567", "+12", "3+456789012"],
    "aadhaar": ["2345 6789 0123", "1234 5678 9012", "234567890123", "4111 1111 1111 1111", "23456789012412"],
    "pan": ["ABCDE1234F", "abcpe1234f", "ABCPE12345"],
    "gstin": ["27ABCPE1234F1Y5", "ABCPE1234F"],
    "upi_id": ["user@example.com", "user@paytm.com", "a@ybl"],
    "ifsc": ["FAKE1001234", "SBIN012345"],
    "passport_in": ["A1234567", "Q1234567 passport", "invoice A1234567 approved"],
    "credit_card": ["4111111111111112", "1234567890123456", "5000000000000009", "4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1",
                    "1698765432123", "2024-01-15 10:30:45"],
    "us_ssn": ["000-12-3456", "666-12-3456", "900-12-3456", "123-00-6789", "123-45-0000", "123456789"],
    "private_ip": ["8.8.8.8", "172.32.0.1", "10.0.19041.1", "192.168.1.300", "v10.0.0.1", "172.15.0.1"],
    "internal_host": ["self.internal", "threading.local()", "settings.local.py", "example.com"],
}
