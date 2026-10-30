import json
import socket

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.testclient import TestClient as StarletteClient

from app import config, db
from app.gateway import tap
from app.main import app as main_app

AWS = "AKIAFAKEFAKEFAKE1234"
CHAT = "/openai/v1/chat/completions"


@pytest.fixture(autouse=True)
def clean_db():
    db.init()
    db.reset()
    yield


class Upstream:
    """Stands in for the provider. No test here ever reaches a real one."""

    def __init__(self, status=200, chunks=(b'{"ok":true}',), headers=None, error=None):
        self.calls, self.status, self.chunks, self.headers, self.error = [], status, chunks, headers or {}, error

    def __call__(self, request):
        self.calls.append(request)
        if self.error:
            raise self.error

        async def body():
            for chunk in self.chunks:
                yield chunk

        return httpx.Response(self.status, headers=self.headers, content=body())


@pytest.fixture
def gateway():
    def build(**kwargs):
        upstream = Upstream(**kwargs)
        client = StarletteClient(tap.build_app(httpx.MockTransport(upstream)))
        client.__enter__()
        built.append(client)
        return client, upstream

    built = []
    yield build
    for client in built:
        client.__exit__(None, None, None)


def test_forwards_to_the_real_host_over_tls(gateway):
    client, upstream = gateway()
    response = client.post(f"{CHAT}?x=1", json={"model": "gpt-4o", "messages": []}, headers={"Authorization": "Bearer sk-real", "X-Custom": "yes"})
    assert response.status_code == 200 and response.json() == {"ok": True}
    sent = upstream.calls[0]
    assert str(sent.url) == "https://api.openai.com/v1/chat/completions?x=1"
    assert sent.headers["authorization"] == "Bearer sk-real" and sent.headers["x-custom"] == "yes"
    assert sent.headers["host"] == "api.openai.com" and sent.headers["accept-encoding"] == "identity"


def test_records_one_event_with_the_response(gateway):
    client, _ = gateway(chunks=(b'{"reply":', b'"hello"}'))
    client.post(CHAT, content='{"model":"gpt-4o"}')
    events = db.list_events()[0]
    assert len(events) == 1
    event = events[0]
    assert event["source"] == "gateway" and event["provider"]["id"] == "openai" and event["payload_visible"] is True
    assert event["model"] == "gpt-4o" and event["bytes_in"] == 17 and event["dest"]["path"] == "/v1/chat/completions"


def test_api_keys_are_never_stored(gateway):
    client, _ = gateway()
    client.post(CHAT, json={"a": 1}, headers={"Authorization": "Bearer sk-supersecretvalue1234567890"})
    assert "supersecretvalue" not in json.dumps(db.list_events()[0])


def test_streaming_passes_through_in_order(gateway):
    client, _ = gateway(chunks=(b"data: 1\n\n", b"data: 2\n\n", b"data: [DONE]\n\n"), headers={"content-type": "text/event-stream"})
    with client.stream("POST", CHAT, json={"stream": True}) as response:
        body = b"".join(response.iter_raw())
        assert response.headers["content-type"].startswith("text/event-stream")
    assert body == b"data: 1\n\ndata: 2\n\ndata: [DONE]\n\n"


def test_upstream_errors_pass_through(gateway):
    client, _ = gateway(status=429, chunks=(b'{"error":"rate"}',))
    response = client.post(CHAT, json={})
    assert response.status_code == 429 and response.json() == {"error": "rate"}


def test_critical_finding_is_blocked_before_leaving(gateway):
    client, upstream = gateway()
    response = client.post(CHAT, content=f"key {AWS}")
    assert response.status_code == 403 and response.json()["error"].startswith("blocked by ShadowScope: ")
    assert upstream.calls == []
    event = db.list_events()[0][0]
    assert "blocked" in event["tags"] and event["payload_visible"] is True and AWS not in json.dumps(event)
    assert any(f["subtype"] == "aws_access_key" for f in db.list_findings()[0])


def test_blocked_request_with_canary(gateway):
    client, upstream = gateway()
    assert client.post(CHAT, content="ref CANARY-SS-7F3A9").status_code == 403 and not upstream.calls


def test_non_critical_finding_is_forwarded(gateway):
    client, upstream = gateway()
    assert client.post(CHAT, content="mail a.person@example.com").status_code == 200 and len(upstream.calls) == 1
    assert any(f["subtype"] == "email" for f in db.list_findings()[0])


def test_blocking_can_be_turned_off(gateway):
    db.set_policy({**db.get_policy(), "block_on_critical": False})
    client, upstream = gateway()
    assert client.post(CHAT, content=f"key {AWS}").status_code == 200 and len(upstream.calls) == 1


def test_policy_written_before_this_flag_existed_still_blocks(gateway):
    policy = db.get_policy()
    policy.pop("block_on_critical")
    db.set_policy(policy)
    client, upstream = gateway()
    assert client.post(CHAT, content=f"key {AWS}").status_code == 403 and not upstream.calls


def test_policy_flag_is_exposed_by_the_api():
    with TestClient(main_app) as api:
        assert api.get("/api/policies").json()["block_on_critical"] is True
        assert api.put("/api/policies", json={"block_on_critical": False}).json()["block_on_critical"] is False
        assert api.put("/api/policies", json={"block_on_critical": True}).json()["block_on_critical"] is True


def test_own_traffic_is_forwarded_but_not_recorded(gateway):
    client, upstream = gateway()
    assert client.post(CHAT, content=f"key {AWS}", headers={"X-ShadowScope-Self": "1"}).status_code == 200
    assert db.is_empty() and "x-shadowscope-self" not in upstream.calls[0].headers


@pytest.mark.parametrize("path", ["/nope/v1/x", "/ollama/api/chat", "/mock_ai/v1/x", "/azure_openai/x"])
def test_unknown_local_and_wildcard_providers_are_refused(gateway, path):
    client, upstream = gateway()
    response = client.post(path, content="hi")
    assert response.status_code == 404 and response.json()["error"]["code"] == "unknown_provider" and not upstream.calls


@pytest.mark.parametrize("path", ["/openai//evil.example/x", "/openai/@evil.example/x", "/openai/..%2f..%2fevil", "/openai/https://evil.example/"])
def test_the_path_cannot_change_the_host(gateway, path):
    client, upstream = gateway()
    client.post(path, content="hi")
    assert all(call.url.host == "api.openai.com" and call.url.scheme == "https" for call in upstream.calls)


def test_redirects_are_not_followed(gateway):
    client, upstream = gateway(status=302, headers={"location": "https://evil.example/"})
    response = client.post(CHAT, json={}, follow_redirects=False)
    assert response.status_code == 302 and len(upstream.calls) == 1


def test_unreachable_provider(gateway):
    client, _ = gateway(error=httpx.ConnectError("down"))
    response = client.post(CHAT, content="hi")
    assert response.status_code == 502 and response.json()["error"]["code"] == "upstream_unreachable"
    assert db.table_count("events") == 1


def test_oversized_body(gateway, monkeypatch):
    monkeypatch.setattr(tap, "MAX_BODY_BYTES", 10)
    client, upstream = gateway()
    assert client.post(CHAT, content=b"x" * 11).status_code == 413 and not upstream.calls


def test_no_query_means_no_question_mark():
    assert str(tap.upstream_url("api.openai.com", "v1/x", "")) == "https://api.openai.com/v1/x"


def test_override_only_applies_to_this_machine(monkeypatch):
    monkeypatch.setattr(config, "GATEWAY_UPSTREAM", "http://127.0.0.1:9999")
    assert str(tap.upstream_url("api.openai.com", "v1/x", "")).startswith("http://127.0.0.1:9999/v1/x")
    monkeypatch.setattr(config, "GATEWAY_UPSTREAM", "https://evil.example")
    assert tap.upstream_url("api.openai.com", "v1/x", "").host == "api.openai.com"


def test_busy_port_is_a_reason_not_a_crash(monkeypatch):
    busy = socket.socket()
    busy.bind((tap.BIND_HOST, 0))
    busy.listen()
    monkeypatch.setattr(config, "GATEWAY_PORT", busy.getsockname()[1])
    try:
        gateway = tap.Gateway()
        gateway.start()
        assert gateway.status()["enabled"] is False and "unavailable" in gateway.status()["reason"]
    finally:
        busy.close()


def test_gateway_runs_on_its_own_thread_and_stops(monkeypatch):
    finder = socket.socket()
    finder.bind((tap.BIND_HOST, 0))
    port = finder.getsockname()[1]
    finder.close()
    monkeypatch.setattr(config, "GATEWAY_PORT", port)
    gateway = tap.Gateway()
    gateway.start()
    try:
        assert gateway.status()["running"] is True
        for _ in range(50):
            try:
                assert httpx.post(f"http://127.0.0.1:{port}/nope/x", timeout=1).status_code == 404
                break
            except httpx.TransportError:
                __import__("time").sleep(0.05)
        else:
            pytest.fail("gateway never answered")
    finally:
        gateway.stop()
    with pytest.raises(httpx.TransportError):
        httpx.post(f"http://127.0.0.1:{port}/nope/x", timeout=1)
