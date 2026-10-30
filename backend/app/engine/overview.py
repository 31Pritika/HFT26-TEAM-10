"""Builds the Overview and GraphData responses."""
from __future__ import annotations

from .. import collectors, db
from ..utils import now, parse_ts, to_iso, window_start
from . import agents, compliance, risk, stats

BUCKETS = 24
SEVERITIES = ("critical", "high", "medium", "low", "info")


def build_overview(window: str) -> dict:
    moment = now()
    start = window_start(window, moment)
    since = to_iso(start)
    step = (moment - start) / BUCKETS
    open_findings = db.open_findings()
    org = risk.org_score(open_findings, moment)

    timeline = [{"ts": to_iso(start + step * index), "requests": 0, "findings": 0} for index in range(BUCKETS)]
    for row in db.metrics_between(since, to_iso(moment)):
        index = int((parse_ts(row["minute"]) - start) / step)
        bucket = timeline[min(max(index, 0), BUCKETS - 1)]
        bucket["requests"] += row["requests"]
        bucket["findings"] += row["findings"]

    trend = [{"ts": to_iso(start + step * (index + 1)), "score": risk.org_score(open_findings, start + step * (index + 1))["score"]}
             for index in range(BUCKETS)]
    severity_counts = db.finding_counts("severity", since)
    return {
        "risk_score": org["score"], "risk_grade": org["grade"], "risk_trend": trend, "totals": stats.totals(since),
        "by_provider": db.provider_stats(since), "by_severity": {key: severity_counts.get(key, 0) for key in SEVERITIES},
        "by_type": db.finding_counts("type", since), "timeline": timeline, "top_processes": db.process_stats(since),
        "compliance": compliance.scores(open_findings), "collectors": collectors.summary(),
    }


def build_graph(window: str) -> dict:
    since = to_iso(window_start(window))
    nodes: dict[str, dict] = {}
    links: dict[tuple[str, str], dict] = {}

    def add_node(node_id: str, label: str, kind: str, node_risk: int, size: int) -> None:
        node = nodes.setdefault(node_id, {"id": node_id, "label": label, "kind": kind, "risk": 0, "size": 0})
        node["risk"] = max(node["risk"], node_risk)
        node["size"] += size

    def add_link(source: str, target: str, weight: int, link_risk: int) -> None:
        link = links.setdefault((source, target), {"source": source, "target": target, "weight": 0, "risk": 0})
        link["weight"] += weight
        link["risk"] = max(link["risk"], link_risk)

    for edge in db.graph_edges(since):
        process, provider, host = f"proc:{edge['process_name']}", f"prov:{edge['provider_id']}", f"host:{edge['host']}"
        add_node(process, edge["process_name"], "process", edge["risk"], edge["weight"])
        add_node(provider, edge["provider_name"], "provider", edge["risk"], edge["weight"])
        add_node(host, edge["host"], "host", edge["risk"], edge["weight"])
        add_link(process, provider, edge["weight"], edge["risk"])
        add_link(provider, host, edge["weight"], edge["risk"])

    for session in agents.list_sessions():
        process = f"proc:{session['process_name']}"
        if process in nodes:
            agent = f"agent:{session['id']}"
            add_node(agent, f"{session['framework']} agent", "agent", session["risk_score"], session["requests"])
            add_link(agent, process, session["requests"], session["risk_score"])
    return {"nodes": list(nodes.values()), "links": list(links.values())}
