"""Limits, error format, CORS configuration and cloud mode."""
import importlib
import json
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from app import config, db, pipeline
from app.api import middleware
from app.collectors import process_conn, sniffer
from app.ingest import pcap
from app.main import app

AWS = "AKIAFAKEFAKEFAKE1234"


@pytest.fixture(autouse=True)
def clean_db():
    db.init()
    db.reset()
    yield


@pytest.fixture
def client():
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def envelope(response, code):
    assert set(response.json()) == {"error"} and response.json()["error"]["code"] == code, response.text


# ---- Limits --------------------------------------------------------------------------------------------
def test_oversized_json_is_refused_by_content_length(client):
    response = client.post("/api/scan", content=b"x" * (config.MAX_JSON_BYTES + 1), headers={"content-type": "application/json"})
    assert response.status_code == 413
    envelope(response, "payload_too_large")


def test_oversized_body_with_no_content_length_is_still_refused(client):
    def chunks():
        for _ in range(4):
            yield b"x" * (1024 * 1024)
    response = client.post("/api/scan", content=chunks(), headers={"content-type": "application/json"})
    assert response.status_code == 413
    envelope(response, "payload_too_large")


def test_upload_limit_is_larger_than_the_json_limit(client):
    response = client.post("/api/ingest", files={"file": ("a.log", b"x" * (config.MAX_JSON_BYTES + 10))})
    assert response.status_code == 200, response.text


def test_oversized_upload_is_refused_before_it_is_read(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 1024 * 1024)
    response = client.post("/api/ingest", files={"file": ("a.log", b"x" * (3 * 1024 * 1024))})
    assert response.status_code == 413
    envelope(response, "payload_too_large")


# ---- Errors --------------------------------------------------------------------------------------------
@pytest.mark.parametrize("method,path,status,code", [
    ("GET", "/api/nope", 404, "not_found"), ("DELETE", "/api/health", 405, "method_not_allowed"), ("POST", "/api/events", 405, "method_not_allowed"),
    ("GET", "/api/events?limit=0", 422, "validation_error"), ("GET", "/api/events?min_risk=500", 422, "validation_error"),
    ("POST", "/api/scan", 422, "validation_error"), ("POST", "/api/simulate", 422, "validation_error"),
    ("GET", "/api/report/export?format=pdf", 422, "validation_error"),
])
def test_every_error_uses_the_envelope(client, method, path, status, code):
    response = client.request(method, path)
    assert response.status_code == status
    envelope(response, code)


def test_invalid_json_body(client):
    response = client.post("/api/scan", content=b"{not json", headers={"content-type": "application/json"})
    assert response.status_code == 422
    envelope(response, "validation_error")


def test_a_bad_cursor_is_ignored_not_a_crash(client):
    assert client.get("/api/events?cursor=!!!notbase64").status_code == 200
    assert client.get("/api/findings", params={"cursor": "aGVsbG8="}).status_code == 200


def test_a_crash_never_leaks_details(client, monkeypatch):
    monkeypatch.setattr(db, "list_inventory", lambda: (_ for _ in ()).throw(RuntimeError(f"secret detail {AWS}")))
    response = client.get("/api/inventory")
    assert response.status_code == 500 and AWS not in response.text
    envelope(response, "internal_error")


# ---- Windows paths -------------------------------------------------------------------------------------
def test_pcap_temp_file_is_always_removed(tmp_path, monkeypatch):
    import tempfile
    from scapy.layers.inet import IP, TCP
    from scapy.layers.l2 import Ether
    from scapy.utils import wrpcap
    capture = tmp_path / "input.bin"
    wrpcap(str(capture), [Ether() / IP() / TCP()])
    data = capture.read_bytes()
    capture.unlink()
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    pcap.parse(data)
    assert list(tmp_path.iterdir()) == []
    try:
        pcap.parse(data[:24] + b"\xff" * 8)
    except pcap.IngestError:
        pass
    assert list(tmp_path.iterdir()) == []


def test_missing_lsof_is_a_reason_not_an_error(monkeypatch):
    import psutil

    def denied(kind):
        raise psutil.AccessDenied()

    def missing():
        raise FileNotFoundError("lsof")

    monkeypatch.setattr(psutil, "net_connections", denied)
    monkeypatch.setattr(process_conn, "lsof_connections", missing)
    connections, reason = process_conn.ProcessConn()._snapshot()
    assert connections == [] and "Cannot list connections" in reason


@pytest.mark.parametrize("message", ["winpcap is not installed", "Npcap not found", "Permission denied", "Operation not permitted"])
def test_missing_capture_driver_reads_as_a_clear_reason(message):
    assert sniffer._is_permission_problem(RuntimeError(message))


def test_unrelated_errors_are_not_called_permission_problems():
    assert not sniffer._is_permission_problem(ValueError("cannot compile filter"))


# ---- Rate limit ----------------------------------------------------------------------------------------
def _limited_client(limit, monkeypatch):
    from fastapi import FastAPI
    monkeypatch.setattr(config, "RATE_LIMIT_PER_MINUTE", limit)
    small = FastAPI()
    small.add_middleware(middleware.RateLimitMiddleware)
    small.get("/api/ping")(lambda: {"ok": True})
    small.get("/api/health")(lambda: {"ok": True})
    return TestClient(small)


def test_rate_limit_answers_429_with_the_envelope(monkeypatch):
    client = _limited_client(2, monkeypatch)
    assert [client.get("/api/ping").status_code for _ in range(3)] == [200, 200, 429]
    envelope(client.get("/api/ping"), "rate_limited")
    assert client.get("/api/health").status_code == 200


# ---- Environment-driven behaviour, each in its own process ---------------------------------------------
def run_isolated(code: str, **env) -> dict:
    import os
    script = f"""
import json
from fastapi.testclient import TestClient
from app import config, db
from app.main import app
{code}
"""
    full_env = {**os.environ, "SHADOWSCOPE_SEED": "0", **env}
    result = subprocess.run([sys.executable, "-W", "ignore", "-c", script], capture_output=True, text=True, timeout=60, env=full_env, cwd=str(config.BACKEND_DIR))
    assert result.returncode == 0, result.stderr[-1500:]
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_cors_origins_setting_covers_http_and_websocket(tmp_path):
    result = run_isolated("""
from starlette.websockets import WebSocketDisconnect
with TestClient(app) as c:
    allowed = c.get('/api/health', headers={'Origin': 'https://shadowscope.example'}).headers.get('access-control-allow-origin')
    other = c.get('/api/health', headers={'Origin': 'https://other.example'}).headers.get('access-control-allow-origin')
    with c.websocket_connect('/api/ws/stream', headers={'origin': 'https://two.example'}) as w:
        first = w.receive_json()['type']
print(json.dumps({'allowed': allowed, 'other': other, 'ws': first, 'list': config.ALLOWED_ORIGINS}))
""", SHADOWSCOPE_DB=str(tmp_path / "a.db"), SHADOWSCOPE_COLLECTORS="0",
        SHADOWSCOPE_CORS_ORIGINS="https://shadowscope.example/, https://two.example", SHADOWSCOPE_FRONTEND_ORIGIN="https://old.example")
    assert result["allowed"] == "https://shadowscope.example" and result["other"] is None and result["ws"] == "stats"
    assert "https://old.example" in result["list"]


CLOUD_CHECK = """
key = 'AKIAFAKEFAKEFAKE1234'
with TestClient(app) as c:
    h = c.get('/api/health').json()
    obs = {'source': 'simulator', 'dest': {'host': 'api.openai.com', 'port': 443}}
    scan = c.post('/api/scan', json={'text': f'key {key}'})
    events_after_scan = db.table_count('events')
    out = {
      'running': [v['running'] for v in h['collectors'].values()], 'reasons': sorted({v['reason'] for v in h['collectors'].values()}),
      'observations': c.post('/api/observations', json=obs).status_code, 'reset': c.post('/api/admin/reset').status_code,
      'policy_get': c.get('/api/policies').status_code, 'policy_put': c.put('/api/policies', json={'entropy_threshold': 3}).status_code,
      'extension': c.post('/api/extension/event', json={'site': 'x', 'url': 'x', 'kind': 'paste', 'text': 'x', 'ts': '2026-10-30T10:00:00Z', 'browser': 'chrome'}).status_code,
      'scan': scan.status_code, 'scan_findings': len(scan.json()['findings']), 'scan_has_id': scan.json()['findings'][0]['id'].startswith('fnd_'),
      'raw_in_scan': key in scan.text, 'events_after_scan': events_after_scan,
      'ingest': c.post('/api/ingest', files={'file': ('a.log', f'leak {key}'.encode())}).json().get('events_created'),
      'upload_limit': config.MAX_UPLOAD_BYTES, 'too_big': c.post('/api/ingest', files={'file': ('a.log', b'x' * (config.MAX_UPLOAD_BYTES + 10))}).status_code,
      'scenarios': len(c.get('/api/scenarios').json()['items']), 'simulate': c.post('/api/simulate', json={'scenario_id': 'canary_trip'}).status_code,
    }
    fid = c.get('/api/findings?limit=1').json()['items'][0]['id']
    out['triage_engine'] = c.post(f'/api/findings/{fid}/triage', json={'engine': 'groq'}).json()['engine']
    codes = [c.get('/api/providers').status_code for _ in range(config.RATE_LIMIT_PER_MINUTE + 5)]
    out['rate_limited'] = 429 in codes
print(json.dumps(out))
"""


def test_cloud_mode(tmp_path):
    result = run_isolated(CLOUD_CHECK, SHADOWSCOPE_DB=str(tmp_path / "c.db"), SHADOWSCOPE_CLOUD="1", SHADOWSCOPE_COLLECTORS="1")
    assert not any(result["running"]) and result["reasons"] == ["Disabled in cloud mode: no local traffic to observe"]
    assert result["observations"] == result["reset"] == result["policy_put"] == result["extension"] == 403
    assert result["policy_get"] == 200
    assert result["scan"] == 200 and result["scan_findings"] >= 1 and result["scan_has_id"] and not result["raw_in_scan"]
    assert result["events_after_scan"] == 0, "public scans are not stored"
    assert result["ingest"] == 1 and result["upload_limit"] == 5 * 1024 * 1024 and result["too_big"] == 413
    assert result["scenarios"] == 9 and result["simulate"] == 200
    assert result["triage_engine"] == "rules" and result["rate_limited"] is True
