"""Every endpoint against contracts/mock/*.json: same keys, same types."""
import json
from collections import defaultdict
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app import config, db, pipeline, seed
from app.main import app
from app.seed_catalog import DATA_FINDINGS

MOCK = Path(config.CONTRACTS_MOCK_DIR)
AWS = "AKIAFAKEFAKEFAKE1234"
# §6 fields that may be null even though the mock data happens to hold values.
NULLABLE = {"provider", "pid", "exe", "user", "parent", "cmdline_hint", "ip", "path", "method", "model", "payload_preview", "entropy",
            "line", "offset", "fingerprint", "provider_id", "process_name", "event_id", "tool_name", "triage", "next_cursor", "model"}
OPTIONAL = {"logo", "block_on_critical"}
DYNAMIC_MAPS = {"by_type", "by_severity", "compliance", "window"}


def kind(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    return type(value).__name__


def merge_schema(samples):
    """Key → observed value kinds across every mock record, so one null in the mock does not hide the real type."""
    keys = defaultdict(list)
    for sample in samples:
        for key, value in sample.items():
            keys[key].append(value)
    return keys


def assert_shape(actual, samples, path="$"):
    kinds = {kind(sample) for sample in samples}
    if kind(actual) == "null":
        assert path.rsplit(".", 1)[-1] in NULLABLE or "null" in kinds, f"{path} is null"
        return
    if kinds == {"null"}:  # The mock only ever shows null here, so it says nothing about the type.
        return
    assert kind(actual) in kinds, f"{path}: {kind(actual)} not in {kinds}"
    if isinstance(actual, dict):
        if path.rsplit(".", 1)[-1] in DYNAMIC_MAPS:
            return
        schema = merge_schema([sample for sample in samples if isinstance(sample, dict)])
        assert set(actual) - OPTIONAL == set(schema) - OPTIONAL, f"{path}: {set(actual) ^ set(schema)}"
        for key, value in actual.items():
            if key in schema:
                assert_shape(value, schema[key], f"{path}.{key}")
    elif isinstance(actual, list):
        inner = [item for sample in samples if isinstance(sample, list) for item in sample]
        if inner:
            for item in actual:
                assert_shape(item, inner, f"{path}[]")


def mock(name):
    return json.loads((MOCK / f"{name}.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        db.reset()
        seed.run()
        yield test_client


@pytest.mark.parametrize("path,name", [
    ("/api/overview", "overview"), ("/api/overview?window=7d", "overview"), ("/api/overview?window=1h", "overview"),
    ("/api/events?limit=500", "events"), ("/api/findings?limit=500", "findings"), ("/api/inventory", "inventory"),
    ("/api/agents", "agents"), ("/api/graph", "graph"), ("/api/graph?window=7d", "graph"), ("/api/providers", "providers"),
    ("/api/policies", "policies"), ("/api/report", "report"), ("/api/report?window=24h", "report"), ("/api/scenarios", "scenarios"),
])
def test_response_matches_contract(client, path, name):
    response = client.get(path)
    assert response.status_code == 200, response.text
    assert_shape(response.json(), [mock(name)])


def test_detail_endpoints_match_contract(client):
    events, findings, agents = mock("events")["items"], mock("findings")["items"], mock("agents")["items"]
    event = client.get("/api/events?limit=1").json()["items"][0]
    detail = client.get(f"/api/events/{event['id']}").json()
    assert_shape(detail.pop("findings"), [findings])
    assert_shape(detail, events)
    finding = client.get("/api/findings?limit=1").json()["items"][0]
    detail = client.get(f"/api/findings/{finding['id']}").json()
    assert detail.pop("event")["id"] == finding["event_id"]
    assert_shape(detail, findings)
    agent = client.get("/api/agents").json()["items"][0]
    assert_shape(client.get(f"/api/agents/{agent['id']}").json(), agents)


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and set(body["collectors"]) == set(config.COLLECTOR_NAMES)
    assert set(body["collectors"]["loopback"]) >= {"enabled", "running"}
    assert body["detector"]["active"] == "shadowscope_detect" and body["llm_engine"]


def test_seed_targets(client):
    assert 1400 <= db.table_count("events") <= 1600
    assert 100 <= db.table_count("findings") <= 140
    assert db.table_count("agents") == 6 and db.table_count("inventory") == 12


def test_seed_is_realistic(client):
    agents = {item["framework"]: item for item in client.get("/api/agents").json()["items"]}
    assert agents["langchain"]["permissions"]["shell"] and agents["langchain"]["risk_score"] >= 80
    assert all(item["autonomy_score"] < agents["langchain"]["autonomy_score"] for name, item in agents.items() if name != "langchain")
    overview = client.get("/api/overview?window=7d").json()
    assert {"secret", "pii", "source_code", "agent_action", "shadow_ai", "canary", "policy", "exfil_volume"} <= set(overview["by_type"])
    assert 20 < overview["risk_score"] < 95
    assert all(score > 0 for score in overview["compliance"].values())
    assert sum(bucket["requests"] for bucket in overview["timeline"]) == overview["totals"]["ai_requests"]
    assert sum(bucket["findings"] for bucket in overview["timeline"]) == sum(overview["by_type"].values())


def test_seed_never_stores_a_full_fake_value(client):
    db.close()
    blob = b"".join(path.read_bytes() for path in Path(config.DB_PATH).parent.glob(f"{Path(config.DB_PATH).name}*"))
    db.init()
    for entry in DATA_FINDINGS:
        if entry[1] not in ("bytes_out_spike", "canary_token"):  # Metadata, and the policy must store its own canary.
            assert entry[4].encode() not in blob, entry[1]
    stored = json.dumps([db.list_events(500)[0], db.list_findings(500)[0]])
    assert "CANARY-SS-7F3A9" not in stored


def test_events_filters_and_pagination(client):
    first = client.get("/api/events?limit=50").json()
    second = client.get("/api/events", params={"limit": 50, "cursor": first["next_cursor"]}).json()
    assert not {item["id"] for item in first["items"]} & {item["id"] for item in second["items"]}
    assert first["items"][-1]["ts"] >= second["items"][0]["ts"]
    assert all(item["provider"]["id"] == "openai" for item in client.get("/api/events?provider=openai").json()["items"])
    assert all(item["process"]["name"] == "ollama" for item in client.get("/api/events?process=ollama").json()["items"])
    assert all(item["source"] == "gateway" for item in client.get("/api/events?source=gateway").json()["items"])
    assert all(item["risk_score"] >= 60 for item in client.get("/api/events?min_risk=60").json()["items"])
    since = first["items"][10]["ts"]
    assert all(item["ts"] >= since for item in client.get("/api/events", params={"since": since}).json()["items"])


def test_full_walk_of_pages_sees_every_row_once(client):
    seen, cursor = [], None
    while True:
        page = client.get("/api/events", params={"limit": 200, **({"cursor": cursor} if cursor else {})}).json()
        seen += [item["id"] for item in page["items"]]
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert len(seen) == len(set(seen)) == db.table_count("events")


def test_findings_filters(client):
    assert all(item["severity"] == "critical" for item in client.get("/api/findings?severity=critical").json()["items"])
    assert all(item["type"] == "pii" for item in client.get("/api/findings?type=pii").json()["items"])
    assert all(item["status"] == "open" for item in client.get("/api/findings?status=open").json()["items"])
    assert client.get("/api/findings?q=Honeytoken").json()["items"]
    assert client.get("/api/findings", params={"q": "100%_no_such"}).json()["items"] == []


def test_finding_status_update(client):
    finding = client.get("/api/findings?status=open&limit=1").json()["items"][0]
    updated = client.patch(f"/api/findings/{finding['id']}", json={"status": "acknowledged"})
    assert updated.status_code == 200 and updated.json()["status"] == "acknowledged"
    assert client.get(f"/api/findings/{finding['id']}").json()["status"] == "acknowledged"
    assert client.patch(f"/api/findings/{finding['id']}", json={"status": "nope"}).status_code == 422


def test_triage_is_cached_on_the_finding(client):
    finding = client.get("/api/findings?type=secret&limit=1").json()["items"][0]
    result = client.post(f"/api/findings/{finding['id']}/triage", json={"engine": "rules"})
    assert result.status_code == 200
    assert_shape(result.json(), [item["triage"] for item in mock("findings")["items"] if item["triage"]])
    assert client.get(f"/api/findings/{finding['id']}").json()["triage"]["engine"] == "rules"
    assert client.post(f"/api/findings/{finding['id']}/triage", json={"engine": "rules"}).json() == result.json()


def test_policy_put_is_partial_and_applies(client):
    before = client.get("/api/policies").json()
    updated = client.put("/api/policies", json={"sanctioned_processes": [*before["sanctioned_processes"], "aider"], "entropy_threshold": 3.5})
    assert updated.status_code == 200 and updated.json()["entropy_threshold"] == 3.5
    assert updated.json()["blocked_providers"] == before["blocked_providers"]
    assert next(item for item in client.get("/api/inventory").json()["items"] if item["process_name"] == "aider")["sanctioned"]
    client.put("/api/policies", json=before)


def test_policy_cannot_disable_redaction(client):
    assert client.put("/api/policies", json={"redact_in_storage": False}).status_code == 422
    assert client.put("/api/policies", json={"self_exclude": False}).status_code == 422


def test_scan_returns_redacted_text(client):
    body = client.post("/api/scan", json={"text": f"key {AWS}", "source": "playground"}).json()
    assert AWS not in json.dumps(body) and body["findings"][0]["id"].startswith("fnd_")
    assert_shape(body["findings"], [mock("findings")["items"]])
    assert client.post("/api/scan", json={"text": "fine"}).json()["findings"] == []


def test_scan_size_limit(client):
    assert client.post("/api/scan", json={"text": "x" * 2_000_001}).status_code == 413


def test_observations_single_and_list(client):
    observation = {"source": "simulator", "dest": {"host": "api.openai.com", "port": 443}, "body_text": "hello"}
    one = client.post("/api/observations", json=observation).json()
    assert one["accepted"] == 1 and one["event_ids"][0].startswith("evt_")
    many = client.post("/api/observations", json=[observation, {**observation, "dest": {"host": "example.com", "port": 443}}]).json()
    assert many["accepted"] == 1 and len(many["event_ids"]) == 1


def test_observations_reject_remote_clients(client):
    remote = TestClient(app, client=("10.0.0.5", 5000))  # No `with`: a second lifespan would rebind the bus.
    observation = {"source": "simulator", "dest": {"host": "api.openai.com", "port": 443}}
    assert remote.post("/api/observations", json=observation).status_code == 403
    assert remote.post("/api/admin/reset").status_code == 403


def test_extension_event(client):
    body = client.post("/api/extension/event", json={"site": "chatgpt.com", "url": "https://chatgpt.com/c/1", "kind": "paste",
                                                     "text": f"key {AWS}", "ts": "2026-10-30T10:00:00Z", "browser": "chrome"}).json()
    assert body["event_id"].startswith("evt_") and AWS not in json.dumps(body)
    assert client.get(f"/api/events/{body['event_id']}").json()["source"] == "extension"


def test_simulate(client):
    started = client.post("/api/simulate", json={"scenario_id": "canary_trip", "intensity": 1}).json()
    assert started["started"] is True and started["run_id"].startswith("run_")
    assert client.post("/api/simulate", json={"scenario_id": "unknown"}).status_code == 404
    assert client.post("/api/simulate", json={"scenario_id": "canary_trip", "intensity": 9}).status_code == 422


@pytest.mark.parametrize("scenario_id", list(json.loads((MOCK / "scenarios.json").read_text(encoding="utf-8"))["items"]))
def test_every_scenario_has_a_fallback(scenario_id):
    from app.simulate import CANNED
    assert CANNED[scenario_id["id"]]


def test_report_export(client):
    as_csv = client.get("/api/report/export?format=csv")
    assert as_csv.headers["content-type"].startswith("text/csv") and "attachment" in as_csv.headers["content-disposition"]
    assert as_csv.text.splitlines()[0].startswith("id,ts,severity")
    assert len(as_csv.text.splitlines()) > 50
    as_json = client.get("/api/report/export?format=json")
    assert "attachment" in as_json.headers["content-disposition"] and as_json.json()["frameworks"]
    assert client.get("/api/report/export?format=xml").status_code == 422


def test_csv_cells_cannot_become_formulas():
    from app.api.routes_report import _csv_cell
    assert _csv_cell("=HYPERLINK(1)") == "'=HYPERLINK(1)" and _csv_cell("normal") == "normal" and _csv_cell(None) == ""


def test_error_envelope(client):
    for response in (client.get("/api/events/nope"), client.get("/api/findings/nope"), client.get("/api/agents/nope"),
                     client.get("/api/nope"), client.get("/api/overview?window=2d"), client.post("/api/scan", json={})):
        assert set(response.json()) == {"error"} and set(response.json()["error"]) == {"code", "message"}, response.text


def test_validation_errors_do_not_echo_input(client):
    response = client.put("/api/policies", json={"canary_tokens": AWS})
    assert response.status_code == 422 and AWS not in response.text


def test_cors(client):
    allowed = client.options("/api/overview", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    extension = client.get("/api/health", headers={"Origin": "chrome-extension://abc"})
    assert extension.headers["access-control-allow-origin"] == "chrome-extension://abc"
    assert "access-control-allow-origin" not in client.get("/api/health", headers={"Origin": "https://evil.example"}).headers


def test_websocket_stream(client):
    with client.websocket_connect("/api/ws/stream") as socket:
        first = socket.receive_json()
        assert first["type"] == "stats" and set(first["data"]) == {"risk_score", "risk_grade", "totals"}
        collectors = [socket.receive_json() for _ in config.COLLECTOR_NAMES]
        assert {message["type"] for message in collectors} == {"collector"}
        result = pipeline.process({"source": "simulator", "dest": {"host": "api.openai.com", "port": 443}, "body_text": f"key {AWS}"})
        event = socket.receive_json()
        assert event["type"] == "event" and event["data"]["id"] == result.event["id"]
        assert socket.receive_json()["type"] == "finding"


def test_websocket_rejects_foreign_origins(client):
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect("/api/ws/stream", headers={"origin": "https://evil.example"}) as socket:
            socket.receive_json()
    assert closed.value.code == 1008


def test_admin_reset_reseeds(client):
    assert client.post("/api/admin/reset").json()["agents"] == 6


def test_prune_keeps_newest_events(client):
    assert db.prune(100) > 0
    assert db.table_count("events") == 100
    client.post("/api/admin/reset")


# ---- Simulator integration (spec 01 §A6) ---------------------------------------------------------------
@pytest.fixture
def simulator(monkeypatch, tmp_path):
    from app.api import routes_scenarios
    monkeypatch.setattr(config, "SIMULATOR_DIR", tmp_path)
    monkeypatch.setattr(routes_scenarios, "_cache", None)
    yield tmp_path
    routes_scenarios._cache = None


def test_without_simulator_scenarios_come_from_the_contract(simulator):
    from app.api.routes_scenarios import load_scenarios
    assert [item["id"] for item in load_scenarios()] == [item["id"] for item in mock("scenarios")["items"]]


def test_simulator_cli_supplies_the_scenarios(simulator, monkeypatch):
    import subprocess
    from app.api import routes_scenarios
    (simulator / "run.py").write_text("")
    calls = []
    item = {"id": "x", "name": "X", "description": "d", "icon": "bot", "severity": "high", "tags": []}

    def fake_run(command, **kwargs):
        calls.append((command, kwargs["cwd"]))
        return subprocess.CompletedProcess(command, 0, stdout=json.dumps([item]))

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert routes_scenarios.load_scenarios() == [item] == routes_scenarios.load_scenarios()
    assert len(calls) == 1, "cached for 60 s"
    assert calls[0][0][1:] == ["-m", "simulator.run", "--list", "--json"] and calls[0][1] == config.REPO_ROOT


def test_broken_simulator_falls_back_to_the_contract(simulator, monkeypatch):
    import subprocess
    from app.api import routes_scenarios
    (simulator / "run.py").write_text("")

    def failing(command, **kwargs):
        raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(subprocess, "run", failing)
    assert len(routes_scenarios.load_scenarios()) == 9


def test_simulate_spawns_the_cli_from_the_repo_root(simulator, monkeypatch):
    import subprocess
    from app import simulate
    (simulator / "run.py").write_text("")
    calls = []
    monkeypatch.setattr(subprocess, "Popen", lambda command, **kwargs: calls.append((command, kwargs["cwd"])))
    run_id = simulate.start("rogue_agent", 2)
    assert run_id.startswith("run_")
    assert calls[0][0][1:] == ["-m", "simulator.run", "rogue_agent", "--intensity", "2"] and calls[0][1] == config.REPO_ROOT


# ---- Triage (real chain, fake network) -------------------------------------------------------------------
@pytest.fixture
def llm(monkeypatch):
    """A local stand-in for an LLM. Records what was sent, and proves the marker header is present."""
    import httpx
    calls = []
    answer = {"verdict": "true_positive", "sensitivity": "critical", "reasoning": "Looks real.", "remediation_steps": ["Rotate it"], "policy_suggestion": "Block it"}

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(answer)}}]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    return calls


def test_triage_uses_policy_engine_and_creates_no_events(client, llm):
    before = client.get("/api/policies").json()
    client.put("/api/policies", json={"llm_triage": {"enabled": True, "engine": "ollama", "model": "gemma3:4b"}})
    pipeline.process({"source": "simulator", "dest": {"host": "api.openai.com", "port": 443}, "body_text": f"key {AWS}"})
    finding = client.get("/api/findings?type=secret&limit=1").json()["items"][0]
    events = db.table_count("events")
    result = client.post(f"/api/findings/{finding['id']}/triage").json()
    client.put("/api/policies", json=before)
    assert result["engine"] == "ollama" and result["model"] == "gemma3:4b" and result["verdict"] == "true_positive"
    assert llm and llm[0].headers["x-shadowscope-self"] == "1" and AWS.encode() not in llm[0].content
    assert db.table_count("events") == events
    assert client.get(f"/api/findings/{finding['id']}").json()["triage"]["engine"] == "ollama"


def test_rules_answer_is_retried_but_a_real_answer_is_kept(client, llm):
    before = client.get("/api/policies").json()
    client.put("/api/policies", json={"llm_triage": {"enabled": True, "engine": "ollama", "model": "gemma3:4b"}})
    pipeline.process({"source": "simulator", "dest": {"host": "api.openai.com", "port": 443}, "body_text": "key AKIAEXAMPLEEXAMPLE33"})
    finding = next(item for item in client.get("/api/findings?type=secret").json()["items"] if not item["triage"])
    db.update_finding({**finding, "triage": {"verdict": "needs_review", "sensitivity": "high", "reasoning": "x", "remediation_steps": [],
                                             "policy_suggestion": "x", "engine": "rules", "model": "rules-v1", "latency_ms": 1, "redacted_input_preview": "x"}})
    assert client.post(f"/api/findings/{finding['id']}/triage").json()["engine"] == "ollama"
    calls = len(llm)
    assert client.post(f"/api/findings/{finding['id']}/triage").json()["engine"] == "ollama"
    client.put("/api/policies", json=before)
    assert len(llm) == calls, "a real answer is reused"


def test_triage_disabled_never_calls_an_llm(client, llm):
    before = client.get("/api/policies").json()
    client.put("/api/policies", json={"llm_triage": {"enabled": False, "engine": "groq", "model": None}})
    pipeline.process({"source": "simulator", "dest": {"host": "api.openai.com", "port": 443}, "body_text": "key AKIAEXAMPLEEXAMPLE77"})
    finding = next(item for item in client.get("/api/findings?type=secret").json()["items"] if not item["triage"])
    result = client.post(f"/api/findings/{finding['id']}/triage").json()
    client.put("/api/policies", json=before)
    assert result["engine"] == "rules" and llm == []


def test_triage_timeout_answers_with_rules(client, monkeypatch):
    import asyncio
    from app.engine import detect_adapter
    monkeypatch.setattr(config, "TRIAGE_TIMEOUT_S", 0.05)

    async def stuck(*args, **kwargs):
        await asyncio.sleep(5)

    monkeypatch.setattr(detect_adapter._detector, "triage", stuck)
    pipeline.process({"source": "simulator", "dest": {"host": "api.openai.com", "port": 443}, "body_text": "key AKIAEXAMPLEEXAMPLE55"})
    finding = next(item for item in client.get("/api/findings?type=secret").json()["items"] if not item["triage"])
    assert client.post(f"/api/findings/{finding['id']}/triage").json()["engine"] == "rules"
