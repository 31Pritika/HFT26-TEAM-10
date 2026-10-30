"""SQLite storage (WAL). Each table keeps the full record as JSON plus indexed columns for queries."""
from __future__ import annotations

import base64
import json
import os
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, ts TEXT NOT NULL, source TEXT NOT NULL, provider_id TEXT, provider_name TEXT,
    process_name TEXT, host TEXT, risk_score INTEGER NOT NULL, bytes_out INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_provider ON events(provider_id);
CREATE INDEX IF NOT EXISTS idx_events_process ON events(process_name);

CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY, ts TEXT NOT NULL, event_id TEXT, type TEXT NOT NULL, subtype TEXT NOT NULL,
    severity TEXT NOT NULL, status TEXT NOT NULL, provider_id TEXT, process_name TEXT, fingerprint TEXT,
    occurrences INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_findings_ts ON findings(ts);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_provider ON findings(provider_id);
CREATE INDEX IF NOT EXISTS idx_findings_process ON findings(process_name);
CREATE INDEX IF NOT EXISTS idx_findings_dedupe ON findings(fingerprint, subtype, ts);
CREATE INDEX IF NOT EXISTS idx_findings_event ON findings(event_id);

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY, process_name TEXT NOT NULL, framework TEXT NOT NULL, last_seen TEXT NOT NULL, data TEXT NOT NULL,
    UNIQUE (process_name, framework)
);
CREATE TABLE IF NOT EXISTS agent_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, ts TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_actions_agent ON agent_actions(agent_id, id);

CREATE TABLE IF NOT EXISTS inventory (process_name TEXT PRIMARY KEY, id TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS policies (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS metrics_minute (
    minute TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0, findings INTEGER NOT NULL DEFAULT 0,
    bytes_out INTEGER NOT NULL DEFAULT 0
);
"""
TABLES = ("events", "findings", "agents", "agent_actions", "inventory", "policies", "metrics_minute")

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None
_depth = 0


def init(path: Path | None = None) -> None:
    """Open the database and create the schema. Safe to call again after close()."""
    global _conn
    with _lock:
        if _conn is not None:
            return
        target = Path(path or config.DB_PATH)
        target.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(target, check_same_thread=False, isolation_level=None)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA synchronous=NORMAL")
        _conn.executescript(SCHEMA)
        _return_to_sudo_user(target)


def _return_to_sudo_user(path: Path) -> None:
    """Under sudo the database would be root-owned, and the next normal run could not write to it.

    SQLite gives the -wal and -shm files the owner of the database file, so only these two need changing.
    """
    uid, gid = os.getenv("SUDO_UID"), os.getenv("SUDO_GID")
    if uid and gid and hasattr(os, "geteuid") and os.geteuid() == 0:
        for item in (path.parent, path):
            os.chown(item, int(uid), int(gid))


def close() -> None:
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
            _conn = None


def _db() -> sqlite3.Connection:
    if _conn is None:
        init()
    assert _conn is not None
    return _conn


@contextmanager
def transaction() -> Iterator[None]:
    """Reentrant write transaction. Only the outermost block commits."""
    global _depth
    with _lock:
        conn = _db()
        if _depth == 0:
            conn.execute("BEGIN IMMEDIATE")
        _depth += 1
        try:
            yield
        except BaseException:
            _depth -= 1
            if _depth == 0:
                conn.execute("ROLLBACK")
            raise
        _depth -= 1
        if _depth == 0:
            conn.execute("COMMIT")


def _execute(sql: str, params: tuple | list = ()) -> sqlite3.Cursor:
    with _lock:
        return _db().execute(sql, params)


def _rows(sql: str, params: tuple | list = ()) -> list[sqlite3.Row]:
    with _lock:
        return _execute(sql, params).fetchall()


def _one(sql: str, params: tuple | list = ()) -> sqlite3.Row | None:
    with _lock:
        return _execute(sql, params).fetchone()


def _encode_cursor(ts: str, rowid: int) -> str:
    return base64.urlsafe_b64encode(f"{ts}|{rowid}".encode()).decode()


def _decode_cursor(cursor: str) -> tuple[str, int] | None:
    try:
        ts, rowid = base64.urlsafe_b64decode(cursor.encode()).decode().rsplit("|", 1)
        return ts, int(rowid)
    except ValueError:
        return None


def _page(table: str, where: list[str], params: list[Any], limit: int, cursor: str | None) -> tuple[list[dict], str | None]:
    """Newest-first keyset pagination on (ts, rowid), so inserts between pages never shift results."""
    position = _decode_cursor(cursor) if cursor else None
    if position:
        where = [*where, "(ts, rowid) < (?, ?)"]
        params = [*params, *position]
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    rows = _rows(f"SELECT rowid, ts, data FROM {table} {clause} ORDER BY ts DESC, rowid DESC LIMIT ?", [*params, limit + 1])
    items = [json.loads(row["data"]) for row in rows[:limit]]
    has_more = len(rows) > limit
    return items, _encode_cursor(rows[limit - 1]["ts"], rows[limit - 1]["rowid"]) if has_more else None


# ---- events ---------------------------------------------------------------------------------------
def insert_event(event: dict) -> None:
    provider = event["provider"] or {}
    _execute(
        "INSERT INTO events (id, ts, source, provider_id, provider_name, process_name, host, risk_score, bytes_out, data)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (event["id"], event["ts"], event["source"], provider.get("id"), provider.get("name"), event["process"]["name"],
         event["dest"]["host"], event["risk_score"], event["bytes_out"], json.dumps(event, ensure_ascii=False)),
    )


def get_event(event_id: str) -> dict | None:
    row = _one("SELECT data FROM events WHERE id = ?", (event_id,))
    return json.loads(row["data"]) if row else None


def list_events(limit: int = 100, cursor: str | None = None, provider: str | None = None, process: str | None = None,
                source: str | None = None, min_risk: int | None = None, since: str | None = None) -> tuple[list[dict], str | None]:
    where, params = [], []
    for clause, value in (("provider_id = ?", provider), ("process_name = ?", process), ("source = ?", source),
                          ("risk_score >= ?", min_risk), ("ts >= ?", since)):
        if value is not None:
            where.append(clause)
            params.append(value)
    return _page("events", where, params, limit, cursor)


def event_stats(since: str) -> dict:
    row = _one("SELECT COUNT(*) AS events, COUNT(provider_id) AS ai_requests, COALESCE(SUM(bytes_out), 0) AS bytes_out"
               " FROM events WHERE ts >= ?", (since,))
    return dict(row) if row else {"events": 0, "ai_requests": 0, "bytes_out": 0}


def provider_stats(since: str) -> list[dict]:
    return [dict(row) for row in _rows(
        "SELECT provider_id, provider_name AS name, COUNT(*) AS count, SUM(bytes_out) AS bytes_out FROM events"
        " WHERE ts >= ? AND provider_id IS NOT NULL GROUP BY provider_id ORDER BY count DESC", (since,))]


def process_stats(since: str, limit: int = 5) -> list[dict]:
    return [dict(row) for row in _rows(
        "SELECT process_name AS name, COUNT(*) AS count, MAX(risk_score) AS risk_score FROM events WHERE ts >= ?"
        " GROUP BY process_name ORDER BY risk_score DESC, count DESC LIMIT ?", (since, limit))]


def graph_edges(since: str) -> list[dict]:
    return [dict(row) for row in _rows(
        "SELECT process_name, provider_id, provider_name, host, COUNT(*) AS weight, MAX(risk_score) AS risk FROM events"
        " WHERE ts >= ? AND provider_id IS NOT NULL GROUP BY process_name, provider_id, host", (since,))]


# ---- findings -------------------------------------------------------------------------------------
def insert_finding(finding: dict) -> None:
    _execute(
        "INSERT INTO findings (id, ts, event_id, type, subtype, severity, status, provider_id, process_name, fingerprint, data)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (finding["id"], finding["ts"], finding["event_id"], finding["type"], finding["subtype"], finding["severity"],
         finding["status"], finding["provider_id"], finding["process_name"], finding["evidence"].get("fingerprint"),
         json.dumps(finding, ensure_ascii=False)),
    )


def get_finding(finding_id: str) -> dict | None:
    row = _one("SELECT data FROM findings WHERE id = ?", (finding_id,))
    return json.loads(row["data"]) if row else None


def update_finding(finding: dict) -> None:
    _execute("UPDATE findings SET status = ?, data = ? WHERE id = ?",
             (finding["status"], json.dumps(finding, ensure_ascii=False), finding["id"]))


def list_findings(limit: int = 100, cursor: str | None = None, severity: str | None = None, type: str | None = None,
                  status: str | None = None, q: str | None = None) -> tuple[list[dict], str | None]:
    where, params = [], []
    for clause, value in (("severity = ?", severity), ("type = ?", type), ("status = ?", status)):
        if value is not None:
            where.append(clause)
            params.append(value)
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("data LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    return _page("findings", where, params, limit, cursor)


def findings_for_event(event_id: str) -> list[dict]:
    return [json.loads(row["data"]) for row in _rows("SELECT data FROM findings WHERE event_id = ? ORDER BY ts", (event_id,))]


def find_recent_finding(fp: str, subtype: str, since: str) -> dict | None:
    """An unresolved finding with the same fingerprint and subtype, used for dedupe."""
    row = _one("SELECT data FROM findings WHERE fingerprint = ? AND subtype = ? AND ts >= ?"
               " AND status IN ('open', 'acknowledged') ORDER BY ts DESC LIMIT 1", (fp, subtype, since))
    return json.loads(row["data"]) if row else None


def bump_finding_occurrences(finding_id: str) -> None:
    _execute("UPDATE findings SET occurrences = occurrences + 1 WHERE id = ?", (finding_id,))


def finding_occurrences(finding_id: str) -> int:
    row = _one("SELECT occurrences FROM findings WHERE id = ?", (finding_id,))
    return row["occurrences"] if row else 0


def open_findings(limit: int = 5000) -> list[dict]:
    rows = _rows("SELECT data FROM findings WHERE status = 'open' ORDER BY ts DESC LIMIT ?", (limit,))
    return [json.loads(row["data"]) for row in rows]


def finding_counts(column: str, since: str) -> dict[str, int]:
    if column not in ("severity", "type"):
        raise ValueError(column)
    rows = _rows(f"SELECT {column} AS key, COUNT(*) AS count FROM findings WHERE ts >= ? GROUP BY {column}", (since,))
    return {row["key"]: row["count"] for row in rows}


def finding_totals(since: str) -> dict:
    row = _one(
        "SELECT SUM(status = 'open') AS findings_open, SUM(status = 'open' AND severity = 'critical') AS critical,"
        " SUM(type = 'secret') AS secrets, SUM(type = 'pii') AS pii, SUM(type = 'agent_action') AS agent_actions"
        " FROM findings WHERE ts >= ?", (since,))
    return {key: (row[key] or 0) if row else 0 for key in ("findings_open", "critical", "secrets", "pii", "agent_actions")}


def findings_count_for_process(process_name: str) -> int:
    row = _one("SELECT COUNT(*) AS count FROM findings WHERE process_name = ?", (process_name,))
    return row["count"] if row else 0


# ---- inventory ------------------------------------------------------------------------------------
def get_inventory(process_name: str) -> dict | None:
    row = _one("SELECT data FROM inventory WHERE process_name = ?", (process_name,))
    return json.loads(row["data"]) if row else None


def upsert_inventory(item: dict) -> None:
    _execute("INSERT INTO inventory (process_name, id, data) VALUES (?, ?, ?)"
             " ON CONFLICT(process_name) DO UPDATE SET data = excluded.data",
             (item["process_name"], item["id"], json.dumps(item, ensure_ascii=False)))


def list_inventory() -> list[dict]:
    items = [json.loads(row["data"]) for row in _rows("SELECT data FROM inventory")]
    return sorted(items, key=lambda item: (-item["risk_score"], item["process_name"]))


# ---- agents ---------------------------------------------------------------------------------------
def get_agent(agent_id: str) -> dict | None:
    row = _one("SELECT data FROM agents WHERE id = ?", (agent_id,))
    return json.loads(row["data"]) if row else None


def find_agent(process_name: str, framework: str) -> dict | None:
    row = _one("SELECT data FROM agents WHERE process_name = ? AND framework = ?", (process_name, framework))
    return json.loads(row["data"]) if row else None


def upsert_agent(agent: dict) -> None:
    _execute("INSERT INTO agents (id, process_name, framework, last_seen, data) VALUES (?, ?, ?, ?, ?)"
             " ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, data = excluded.data",
             (agent["id"], agent["process_name"], agent["framework"], agent["last_seen"], json.dumps(agent, ensure_ascii=False)))


def list_agents() -> list[dict]:
    return [json.loads(row["data"]) for row in _rows("SELECT data FROM agents ORDER BY last_seen DESC")]


def insert_agent_action(agent_id: str, action: dict) -> None:
    _execute("INSERT INTO agent_actions (agent_id, ts, data) VALUES (?, ?, ?)",
             (agent_id, action["ts"], json.dumps(action, ensure_ascii=False)))


def agent_actions(agent_id: str, limit: int = 50) -> list[dict]:
    rows = _rows("SELECT data FROM agent_actions WHERE agent_id = ? ORDER BY id DESC LIMIT ?", (agent_id, limit))
    return [json.loads(row["data"]) for row in reversed(rows)]


# ---- policy ---------------------------------------------------------------------------------------
def get_policy() -> dict:
    row = _one("SELECT data FROM policies WHERE id = 1")
    if row:
        return json.loads(row["data"])
    set_policy(config.DEFAULT_POLICY)
    return json.loads(json.dumps(config.DEFAULT_POLICY))


def set_policy(policy: dict) -> None:
    _execute("INSERT INTO policies (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
             (json.dumps(policy, ensure_ascii=False),))


# ---- metrics --------------------------------------------------------------------------------------
def bump_metrics(ts: str, requests: int = 0, findings: int = 0, bytes_out: int = 0) -> None:
    _execute("INSERT INTO metrics_minute (minute, requests, findings, bytes_out) VALUES (?, ?, ?, ?)"
             " ON CONFLICT(minute) DO UPDATE SET requests = requests + excluded.requests,"
             " findings = findings + excluded.findings, bytes_out = bytes_out + excluded.bytes_out",
             (ts[:16], requests, findings, bytes_out))


def metrics_between(start: str, end: str) -> list[dict]:
    rows = _rows("SELECT minute, requests, findings FROM metrics_minute WHERE minute >= ? AND minute <= ? ORDER BY minute",
                 (start[:16], end[:16]))
    return [dict(row) for row in rows]


# ---- maintenance ----------------------------------------------------------------------------------
def is_empty() -> bool:
    return _one("SELECT 1 FROM events LIMIT 1") is None


def table_count(table: str) -> int:
    if table not in TABLES:
        raise ValueError(table)
    row = _one(f"SELECT COUNT(*) AS count FROM {table}")
    return row["count"] if row else 0


def prune(max_events: int = config.MAX_EVENTS) -> int:
    """Keep the newest events. Findings stay, so a finding may outlive its event."""
    with transaction():
        cursor = _execute("DELETE FROM events WHERE rowid IN (SELECT rowid FROM events ORDER BY ts DESC, rowid DESC LIMIT -1 OFFSET ?)",
                          (max_events,))
        return cursor.rowcount


def reset() -> None:
    with transaction():
        for table in TABLES:
            _execute(f"DELETE FROM {table}")
