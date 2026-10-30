"""Phase 3 engines: anomaly, risk history, compliance controls, policy effects."""
import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app import db, pipeline, seed
from app.engine import anomaly, compliance, risk
from app.engine.overview import build_overview
from app.main import app
from app.utils import now, now_iso, to_iso

AWS = "AKIAFAKEFAKEFAKE1234"
OPENAI = {"host": "api.openai.com", "port": 443, "path": "/v1/chat/completions"}


@pytest.fixture(autouse=True)
def clean():
    db.init()
    db.reset()
    anomaly.reset()
    yield


def obs(ts, bytes_out=1000, name="worker", source="simulator", **extra):
    return {"source": source, "ts": ts, "process": {"name": name}, "dest": OPENAI, "method": "POST", "bytes_out": bytes_out, **extra}


def at(seconds):
    return to_iso(now().replace(microsecond=0) - timedelta(hours=2) + timedelta(seconds=seconds))


def findings_of(result, subtype="bytes_out_spike"):
    return [f for f in result.findings if f["subtype"] == subtype]


# ---- anomaly ---------------------------------------------------------------------------------------------
def test_z_score_needs_a_baseline_and_handles_no_spread():
    assert anomaly.z_score(100, [1] * 9) is None
    assert anomaly.z_score(1000, [1000] * 20) == 0
    assert anomaly.z_score(11024, [10000] * 20) == 1


def test_large_upload_against_a_steady_baseline_raises_exfil_volume():
    for index in range(20):
        assert not findings_of(pipeline.process(obs(at(index * 120), 2000 + index * 50)))
    spike = pipeline.process(obs(at(4000), 3_000_000))
    finding = findings_of(spike)[0]
    assert finding["type"] == "exfil_volume" and finding["severity"] == "high" and "z-score" in finding["description"]
    assert finding["detector"] == "anomaly" and finding["remediation"] and finding["compliance"] == ["ISO27001"]


def test_normal_variation_stays_quiet():
    import random
    rng = random.Random(1)
    assert not any(findings_of(pipeline.process(obs(at(index * 90), rng.randint(800, 60_000)))) for index in range(200))


def test_each_process_has_its_own_baseline():
    for index in range(20):
        pipeline.process(obs(at(index * 90), 1000, name="small"))
        pipeline.process(obs(at(index * 90), 3_000_000, name="large"))
    assert not findings_of(pipeline.process(obs(at(4000), 3_000_000, name="large")))
    assert findings_of(pipeline.process(obs(at(4000), 3_000_000, name="small")))


def test_exfil_spike_scenario_fires_with_no_history():
    """Spec 02 §B6: 40 rapid 200 KB payloads from one process, which has no baseline and no deviation."""
    results = [pipeline.process(obs(at(index), 200 * 1024)) for index in range(40)]
    assert len({f["id"] for result in results for f in findings_of(result)}) == 1, "later events attach to the same finding"
    assert sum(result.created for result in results if findings_of(result)) <= 2
    assert "sent in 60 s" in next(f for r in results for f in findings_of(r))["description"]


def test_volume_outside_the_window_does_not_add_up():
    assert not any(findings_of(pipeline.process(obs(at(index * 90), 2 * 1024 * 1024))) for index in range(5))


def test_connection_reports_are_not_uploads():
    assert anomaly.check_bytes("x", at(0), 50_000_000, "live_conn") is None
    assert anomaly.check_bytes("x", at(0), 0, "gateway") is None


def test_burst_data():
    counts = [anomaly.track_request("x", at(index), "simulator") for index in range(6)]
    assert counts[0][0] == 1 and counts[-1] == (6, 1.0) and anomaly.is_burst(*counts[-1])
    assert anomaly.track_request("y", at(0), "live_conn")[0] == 0
    slow = [anomaly.track_request("z", at(index * 5), "simulator") for index in range(6)]
    assert not anomaly.is_burst(*slow[-1])


def test_burst_is_tagged_on_any_process_but_loops_only_on_agents():
    results = [pipeline.process(obs(at(index))) for index in range(7)]
    assert "burst" in results[-1].event["tags"] and not any(f["subtype"] == "autonomous_loop" for r in results for f in r.findings)


def test_burst_from_an_agent_is_an_autonomous_loop():
    agent = {"name": "aider"}
    results = [pipeline.process({**obs(at(index)), "process": agent}) for index in range(7)]
    assert any(f["subtype"] == "autonomous_loop" for r in results for f in r.findings)


# ---- risk history ----------------------------------------------------------------------------------------
def test_old_databases_gain_the_risk_column(tmp_path):
    import sqlite3
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE metrics_minute (minute TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0, findings INTEGER NOT NULL DEFAULT 0, bytes_out INTEGER NOT NULL DEFAULT 0)")
    conn.commit()
    conn.close()
    db.close()
    db.init(path)
    try:
        db.record_risk("2026-10-30T10:00:00Z", 42)
        assert db.metrics_between("2026-10-30T09:00:00Z", "2026-10-30T11:00:00Z")[0]["risk_score"] == 42
    finally:
        db.close()
        db.init()


def test_trend_reads_recorded_scores_and_does_not_rewrite_history():
    pipeline.process(obs(now_iso(), body_text=f"key {AWS}"))
    moment = now()
    for hours, score in ((20, 11), (12, 22), (6, 33)):
        db.record_risk(to_iso(moment - timedelta(hours=hours)), score)
    trend = build_overview("24h")["risk_trend"]
    scores = [point["score"] for point in trend]
    assert len(trend) == 24 and 11 in scores and 22 in scores and 33 in scores
    assert scores[scores.index(22) + 1] in (22, 33), "gaps hold the last score"
    db.update_finding({**db.list_findings()[0][0], "status": "resolved"})
    assert 33 in [point["score"] for point in build_overview("24h")["risk_trend"]]


def test_trend_is_estimated_where_nothing_was_recorded():
    pipeline.process(obs(to_iso(now() - timedelta(hours=3)), body_text=f"key {AWS}"))
    overview = build_overview("24h")
    assert overview["risk_trend"][0]["score"] == 0 and overview["risk_trend"][-1]["score"] == overview["risk_score"] > 0


def test_last_point_is_always_the_current_score():
    seed.run()
    overview = build_overview("24h")
    assert overview["risk_trend"][-1]["score"] == overview["risk_score"]
    assert len({point["score"] for point in overview["risk_trend"]}) > 3


def test_components_are_reported():
    org = risk.org_score([{"severity": "critical", "type": t, "subtype": "x", "ts": now_iso()} for t in ("secret", "shadow_ai", "agent_action", "exfil_volume")])
    assert all(org[key] > 0 for key in ("leak", "shadow", "agent", "volume"))
    assert org["score"] == round(0.40 * org["leak"] + 0.25 * org["shadow"] + 0.25 * org["agent"] + 0.10 * org["volume"])


# ---- compliance -------------------------------------------------------------------------------------------
@pytest.fixture
def seeded_report():
    seed.run()
    return compliance.build_report("7d")


def test_every_framework_has_at_least_five_controls(seeded_report):
    assert {framework["id"] for framework in seeded_report["frameworks"]} == set(compliance.FRAMEWORK_IDS)
    for framework in seeded_report["frameworks"]:
        assert len(framework["controls"]) >= 5, framework["id"]
        assert len({control["id"] for control in framework["controls"]}) == len(framework["controls"])
        assert all(control["status"] in ("pass", "warn", "fail") and control["evidence"] for control in framework["controls"])


def test_control_status_follows_open_findings():
    rule = lambda f: True  # noqa: E731
    finding = {"severity": "low", "process_name": "worker"}
    assert compliance._control("X", "x", rule, [])["status"] == "pass"
    warned = compliance._control("X", "x", rule, [finding])
    assert warned["status"] == "warn" and "worker" in warned["evidence"]
    assert compliance._control("X", "x", rule, [{**finding, "severity": "high"}])["status"] == "fail"


def test_clean_install_has_all_controls_passing_and_a_calm_recommendation():
    report = compliance.build_report("7d")
    assert all(control["status"] == "pass" for framework in report["frameworks"] for control in framework["controls"])
    assert [item["title"] for item in report["recommendations"]] == ["Keep monitoring"]


def test_recommendations_come_from_open_findings():
    pipeline.process(obs(now_iso(), body_text=f"key {AWS}", name="leaky-tool"))
    report = compliance.build_report("7d")
    rotate = next(item for item in report["recommendations"] if item["title"] == "Rotate exposed credentials")
    assert rotate["priority"] == "P0" and "leaky-tool" in rotate["detail"]
    for finding in db.open_findings():
        db.update_finding({**finding, "status": "resolved"})
    titles = [item["title"] for item in compliance.build_report("7d")["recommendations"]]
    assert "Rotate exposed credentials" not in titles


def test_recommendations_use_every_priority(seeded_report):
    assert {item["priority"] for item in seeded_report["recommendations"]} == {"P0", "P1", "P2"}
    assert [item["priority"] for item in seeded_report["recommendations"]] == sorted(item["priority"] for item in seeded_report["recommendations"])


def test_report_window_limits_findings():
    pipeline.process(obs(to_iso(now() - timedelta(hours=5)), body_text=f"key {AWS}"))
    assert compliance.build_report("24h")["top_findings"] and not compliance.build_report("1h")["top_findings"]


def test_csv_export_has_the_full_record():
    pipeline.process(obs(now_iso(), body_text=f"key {AWS}"))
    with TestClient(app) as client:
        text = client.get("/api/report/export?format=csv").text
        assert client.get("/api/report/export?format=json").json()["frameworks"]
    header = text.splitlines()[0]
    assert "redacted_snippet" in header and "remediation" in header and AWS not in text


# ---- policies take effect ---------------------------------------------------------------------------------
@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def shadow_open(name="worker"):
    return [f for f in db.open_findings() if f["type"] == "shadow_ai" and f["process_name"] == name]


def test_sanctioning_a_process_resolves_its_shadow_findings_and_lowers_risk(client):
    for name in ("worker", "other"):
        pipeline.process(obs(now_iso(), name=name))
    before = client.get("/api/overview").json()
    policy = client.get("/api/policies").json()
    assert client.put("/api/policies", json={"sanctioned_processes": [*policy["sanctioned_processes"], "worker"]}).status_code == 200
    assert not shadow_open("worker") and shadow_open("other")
    after = client.get("/api/overview").json()
    assert after["risk_score"] < before["risk_score"] and after["totals"]["shadow_tools"] == before["totals"]["shadow_tools"] - 1


def test_sanctioning_a_provider_resolves_its_shadow_findings(client):
    pipeline.process(obs(now_iso()))
    policy = client.get("/api/policies").json()
    client.put("/api/policies", json={"sanctioned_providers": [*policy["sanctioned_providers"], "openai"]})
    assert not shadow_open() and db.get_inventory("worker")["sanctioned"] is True


def test_sanctioning_leaves_leak_findings_open(client):
    pipeline.process(obs(now_iso(), body_text=f"key {AWS}"))
    policy = client.get("/api/policies").json()
    client.put("/api/policies", json={"sanctioned_processes": [*policy["sanctioned_processes"], "worker"]})
    assert [f["subtype"] for f in db.open_findings()] == ["aws_access_key"]


def test_a_new_canary_applies_to_the_next_observation(client):
    token = "CANARY-NEW-TOKEN-991"
    assert not any(f["type"] == "canary" for f in pipeline.process(obs(now_iso(), body_text=f"ref {token}")).findings)
    policy = client.get("/api/policies").json()
    client.put("/api/policies", json={"canary_tokens": [*policy["canary_tokens"], token]})
    result = pipeline.process(obs(now_iso(), body_text=f"ref {token} again", name="second"))
    assert any(f["type"] == "canary" and f["severity"] == "critical" for f in result.findings)
    assert token not in json.dumps(result.event)


def test_blocking_a_provider_flags_tools_already_using_it(client):
    pipeline.process(obs(now_iso()))
    policy = client.get("/api/policies").json()
    client.put("/api/policies", json={"blocked_providers": [*policy["blocked_providers"], "openai"]})
    flagged = [f for f in db.open_findings() if f["type"] == "policy"]
    assert len(flagged) == 1 and flagged[0]["severity"] == "critical" and flagged[0]["process_name"] == "worker"
    assert flagged[0]["event_id"] is None and client.get(f"/api/findings/{flagged[0]['id']}").json()["event"] is None


def test_blocked_provider_on_next_contact_is_not_doubled(client):
    pipeline.process(obs(now_iso()))
    policy = client.get("/api/policies").json()
    client.put("/api/policies", json={"blocked_providers": [*policy["blocked_providers"], "openai"]})
    pipeline.process(obs(now_iso()))
    assert sum(f["type"] == "policy" for f in db.open_findings()) == 1


def test_a_put_with_no_changes_does_nothing(client):
    pipeline.process(obs(now_iso()))
    count = db.table_count("findings")
    client.put("/api/policies", json=client.get("/api/policies").json())
    assert db.table_count("findings") == count and shadow_open()
