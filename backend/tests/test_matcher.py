import pytest

from app.fingerprints import matcher


@pytest.fixture(autouse=True)
def clear_ip_cache():
    matcher.set_ip_cache({})
    yield
    matcher.set_ip_cache({})


def test_providers_yaml_is_complete():
    assert len(matcher.PROVIDERS) == 30
    assert len(matcher.GENERIC_PATHS) == 8
    assert all({"id", "name", "category", "hosts", "ports", "paths"} <= set(p) for p in matcher.PROVIDERS)


@pytest.mark.parametrize("host,provider_id", [
    ("api.openai.com", "openai"),
    ("API.OpenAI.com", "openai"),
    ("api.openai.com:443", "openai"),
    ("api.anthropic.com.", "anthropic"),
    ("chatgpt.com", "chatgpt"),
    ("generativelanguage.googleapis.com", "gemini"),
    ("api.deepseek.com", "deepseek"),
])
def test_exact_host(host, provider_id):
    assert matcher.match(host=host, port=443).provider["id"] == provider_id


@pytest.mark.parametrize("host,provider_id", [
    ("my-team.openai.azure.com", "azure_openai"),
    ("a.b.cursor.sh", "cursor"),
    ("foo.codeium.com", "codeium"),
])
def test_wildcard_host(host, provider_id):
    result = matcher.match(host=host, port=443)
    assert result.provider["id"] == provider_id
    assert result.reason == "wildcard"


@pytest.mark.parametrize("host", ["openai.azure.com", "evilopenai.azure.com", "cursor.sh.attacker.io", "notapi.openai.com"])
def test_lookalike_hosts_do_not_match(host):
    assert matcher.match(host=host, port=443) is None


def test_host_plus_path_raises_confidence():
    assert matcher.match(host="api.openai.com", port=443).confidence < matcher.match(
        host="api.openai.com", port=443, path="/v1/chat/completions?x=1").confidence


@pytest.mark.parametrize("port,provider_id", [(11434, "ollama"), (1234, "lmstudio"), (1337, "jan"), (4891, "gpt4all"), (7860, "textgen"), (8788, "mock_ai")])
def test_local_ports(port, provider_id):
    assert matcher.match(host="localhost", port=port).provider["id"] == provider_id


@pytest.mark.parametrize("port", [8080, 8000, 5000])
def test_common_dev_ports_need_an_ai_path(port):
    assert matcher.match(host="localhost", port=port, path="/index.html") is None
    assert matcher.match(host="127.0.0.1", port=port, path="/v1/chat/completions") is not None


def test_ipv6_loopback():
    assert matcher.match(host="[::1]:11434", port=11434).provider["id"] == "ollama"


def test_ip_cache_and_shared_cdn_confidence():
    matcher.set_ip_cache({"162.159.1.1": ("openai", 0.6), "1.1.1.1": ("groq", 0.3)})
    assert matcher.match(ip="162.159.1.1", port=443).confidence == 0.6
    assert matcher.match(ip="1.1.1.1", port=443) is None


@pytest.mark.parametrize("path", ["/v1/chat/completions", "/api/generate", "/v1beta/models/gemini-pro:generateContent"])
def test_generic_paths_on_unknown_host(path):
    result = matcher.match(host="llm.example.net", port=443, path=path)
    assert result.provider["id"] == "unknown"
    assert result.confidence == 0.6


def test_unrelated_traffic_is_ignored():
    assert matcher.match(host="example.com", port=443, path="/home") is None
    assert matcher.match(host="localhost", port=3000, path="/") is None
    assert matcher.match() is None
