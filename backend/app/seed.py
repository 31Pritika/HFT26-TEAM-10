"""Demo history, generated through the pipeline so every derived number is real.

Run `python -m app.seed` to wipe the database and re-seed. The detection step is scripted (app/seed_catalog.py),
so the dashboard has full variety whichever detector is installed.
"""
from __future__ import annotations

import json
import logging
import random
import time
from datetime import datetime, timedelta

from . import db, pipeline
from .fingerprints import matcher
from .seed_catalog import AGENT_FINDINGS, DATA_FINDINGS, agent_action, agent_finding, no_agent, scan_result
from .utils import now, parse_ts, to_iso

log = logging.getLogger("shadowscope.seed")

EVENTS = 1473
HISTORY_HOURS = 48
DATA_FINDING_EVENTS = 52
FINDING_SALT_SEED = 261030
ROGUE_BURSTS_HOURS_AGO = (14, 5, 0)

BENIGN_PROMPTS = [
    "Summarize these meeting notes into three bullet points.",
    "Explain the difference between TCP and UDP for a new hire.",
    "Rewrite this paragraph in a friendlier tone.",
    "Write a unit test for a function that parses dates.",
    "Why is my CSS grid overflowing on mobile?",
    "Draft a release note for the login page fix.",
    "Refactor this loop into a list comprehension.",
]
MODELS = {"openai": "gpt-4o", "anthropic": "claude-sonnet-4-5", "ollama": "llama3.2:3b", "lmstudio": "qwen2.5-coder",
          "groq": "llama-3.1-8b-instant", "gemini": "gemini-2.0-flash"}
BROWSER_SOURCES = ["extension", "extension", "har", "dns_sni", "live_conn"]
APP_SOURCES = ["live_conn", "dns_sni", "gateway", "gateway", "pcap", "log", "simulator"]
LOCAL_SOURCES = ["loopback", "loopback", "simulator"]
VISIBLE_SOURCES = {"loopback", "gateway", "pcap", "har", "log", "extension", "simulator"}

TOOLS = [
    {"name": "Cursor Helper", "exe": "/Applications/Cursor.app/Contents/MacOS/Cursor Helper", "providers": ["cursor", "openai"], "weight": 20, "hint": "cursor --agent-mode"},
    {"name": "claude", "exe": "/opt/homebrew/bin/claude", "providers": ["anthropic"], "weight": 14, "hint": "claude --print"},
    {"name": "ollama", "exe": "/usr/local/bin/ollama", "providers": ["ollama"], "weight": 14, "hint": "ollama serve"},
    {"name": "python3", "exe": "/usr/bin/python3", "providers": ["openai"], "weight": 16, "hint": "python3 langchain_agent.py --tools shell,fs"},
    {"name": "Google Chrome", "exe": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "providers": ["chatgpt", "gemini_web", "claude_web"], "weight": 20, "hint": None},
    {"name": "Code Helper (Plugin)", "exe": "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin)", "providers": ["copilot"], "weight": 12, "hint": None},
    {"name": "Windsurf", "exe": "/Applications/Windsurf.app/Contents/MacOS/Windsurf", "providers": ["codeium"], "weight": 8, "hint": None},
    {"name": "LM Studio", "exe": "/Applications/LM Studio.app/Contents/MacOS/LM Studio", "providers": ["lmstudio"], "weight": 5, "hint": None},
    {"name": "aider", "exe": "/opt/homebrew/bin/aider", "providers": ["openai"], "weight": 7, "hint": "aider --yes src/billing.py"},
    {"name": "interpreter", "exe": "/opt/homebrew/bin/interpreter", "providers": ["gemini"], "weight": 4, "hint": "interpreter --auto-run"},
    {"name": "node", "exe": "/opt/homebrew/bin/node", "providers": ["groq"], "weight": 8, "hint": "node crewai_worker.js"},
    {"name": "Microsoft Edge", "exe": "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "providers": ["ms_copilot", "perplexity"], "weight": 8, "hint": None},
]
_BY_NAME = {tool["name"]: tool for tool in TOOLS}
AGENT_FRAMEWORKS = {"Cursor Helper": "cursor", "claude": "claude_code", "python3": "langchain", "aider": "aider",
                    "interpreter": "open_interpreter", "node": "crewai"}
AGENT_TOOLS = {"cursor": ["run_command", "read_file", "write_file"], "claude_code": ["bash", "read_file", "write_file"],
               "langchain": ["shell", "read_file", "http_request", "internal_admin_api"], "aider": ["write_file"],
               "open_interpreter": ["python_repl", "shell"], "crewai": ["http_request", "python_repl"]}
SAFE_ACTIONS = {
    "cursor": [("run_command", "shell_exec", "npm test"), ("read_file", "file_read", "read_file src/app.tsx"), ("write_file", "file_write", "write_file src/billing.py")],
    "claude_code": [("bash", "shell_exec", "git status"), ("read_file", "file_read", "read_file src/api/routes.py")],
    "aider": [("write_file", "file_write", "write_file src/billing.py")],
    "open_interpreter": [("python_repl", "code_exec", "python_repl: print(sum(range(10)))"), ("shell", "shell_exec", "ls -la")],
    "crewai": [("http_request", "http_request", "GET https://example.com/prices"), ("python_repl", "code_exec", "python_repl: import os; os.listdir('.')")],
}


def _timestamps(rng: random.Random, moment: datetime, count: int) -> list[datetime]:
    """More traffic in working hours, and always some in the most recent hours."""
    weights = [3 if 8 <= (moment - timedelta(hours=hour)).hour <= 21 else 1 for hour in range(HISTORY_HOURS)]
    hours = rng.choices(range(HISTORY_HOURS), weights=weights, k=count)
    return sorted(moment - timedelta(hours=hour, seconds=rng.randint(30, 3599)) for hour in hours)


def _source(rng: random.Random, tool: dict, provider: dict) -> str:
    if provider["category"] == "local_llm":
        return rng.choice(LOCAL_SOURCES)
    return rng.choice(BROWSER_SOURCES if tool["name"] in ("Google Chrome", "Microsoft Edge") else APP_SOURCES)


def _observation(rng: random.Random, tool: dict, provider_id: str, ts: datetime, prompt: str | None) -> dict:
    provider = matcher.provider_by_id(provider_id)
    assert provider is not None
    source = _source(rng, tool, provider)
    local = provider["category"] == "local_llm"
    visible = source in VISIBLE_SOURCES and prompt is not None
    body = json.dumps({"model": MODELS.get(provider_id), "messages": [{"role": "user", "content": prompt}]}) if visible else None
    return {
        "source": source, "ts": to_iso(ts),
        "process": {"pid": 2000 + TOOLS.index(tool) * 137, "name": tool["name"], "exe": tool["exe"], "user": "dev",
                    "parent": "launchd", "cmdline_hint": tool["hint"]},
        "dest": {"host": provider["hosts"][0], "ip": "127.0.0.1" if local else f"104.18.{rng.randint(0, 255)}.{rng.randint(1, 254)}",
                 "port": provider["ports"][0], "path": (provider["paths"] or [None])[0] if visible else None,
                 "protocol": ("http" if local else "https") if visible else ("tcp" if source == "live_conn" else "tls")},
        "method": "POST" if visible else None, "body_text": body,
        "bytes_out": rng.randint(800, 60_000), "bytes_in": rng.randint(400, 120_000),
    }


def _agent_analysis(rng: random.Random, framework: str, salt: str) -> dict:
    """A session's ordinary activity: mostly verified, low-risk tool calls."""
    tools = AGENT_TOOLS[framework]
    if framework == "langchain" or rng.random() > 0.2:
        return {**no_agent(), "is_agent": True, "framework": framework, "tools_declared": tools}
    tool, kind, command = rng.choice(SAFE_ACTIONS[framework])
    action = {"kind": kind, "detail": command, "severity": "low", "verified": True, "tool_name": tool}
    analysis = {**no_agent(), "is_agent": True, "framework": framework, "tools_declared": tools, "actions": [action]}
    if rng.random() < 0.08:
        entry = next(item for item in AGENT_FINDINGS if item[0] == "unverified_tool_call")
        analysis["actions"] = [agent_action(entry)]
        analysis["findings"] = [agent_finding(entry, salt)]
    return analysis


def _rogue_steps(moment: datetime) -> list[tuple[datetime, tuple]]:
    """The rogue LangChain agent: repeated bursts of dangerous tool calls at machine speed."""
    steps = []
    for hours_ago in ROGUE_BURSTS_HOURS_AGO:
        start = moment - timedelta(hours=hours_ago, minutes=7)
        steps += [(start + timedelta(seconds=index * 1.5), entry) for index, entry in enumerate(AGENT_FINDINGS)]
    return steps


def _triage_history(rng: random.Random, moment: datetime) -> None:
    """Older findings have been worked on. Recent ones are still waiting."""
    cursor = None
    while True:
        findings, cursor = db.list_findings(500, cursor)
        for finding in findings:
            age_hours = (moment - parse_ts(finding["ts"])).total_seconds() / 3600
            if age_hours > 4 and finding["type"] != "canary" and rng.random() < 0.55:
                finding["status"] = rng.choices(["resolved", "acknowledged", "false_positive"], weights=[5, 3, 2])[0]
                db.update_finding(finding)
        if cursor is None:
            return


def run(events: int = EVENTS, seed: int = FINDING_SALT_SEED) -> dict:
    """Fills an empty database and returns row counts."""
    rng = random.Random(seed)
    moment = now()
    started = time.perf_counter()
    stamps = _timestamps(rng, moment, events)
    leaks = set(rng.sample(range(events), min(DATA_FINDING_EVENTS, events)))
    blocked = set(rng.sample(range(events), min(3, events)))
    rogue = _rogue_steps(moment)
    rogue_index = 0

    with db.transaction():
        for index, ts in enumerate(stamps):
            while rogue_index < len(rogue) and rogue[rogue_index][0] <= ts:
                step_ts, entry = rogue[rogue_index]
                rogue_index += 1
                salt = f"rogue:{rogue_index}"
                analysis = {**no_agent(), "is_agent": True, "framework": "langchain", "tools_declared": AGENT_TOOLS["langchain"],
                            "actions": [agent_action(entry)], "findings": [agent_finding(entry, salt)]}
                observation = _observation(rng, _BY_NAME["python3"], "openai", step_ts, "Continue with the next tool call.")
                observation["source"] = "gateway"
                pipeline.process(observation, prescan={"scan": None, "analysis": analysis}, publish=False)

            tool = rng.choices(TOOLS, weights=[item["weight"] for item in TOOLS])[0]
            provider_id = rng.choice(tool["providers"])
            if index in blocked:
                tool, provider_id = _BY_NAME["Microsoft Edge"], "deepseek"
            salt = f"{seed}:{index}"
            prompt = rng.choice(BENIGN_PROMPTS)
            observation = _observation(rng, tool, provider_id, ts, prompt)
            entries: list[tuple] = []
            if index in leaks:
                if observation["body_text"] is None:  # A leak has to be visible: use a source that sees payloads.
                    observation = _observation(rng, tool, provider_id, ts, prompt)
                    observation["source"] = "gateway"
                    observation["body_text"] = json.dumps({"model": MODELS.get(provider_id), "messages": [{"role": "user", "content": prompt}]})
                entries = rng.sample(DATA_FINDINGS, rng.choice((1, 1, 1, 2)))
            framework = AGENT_FRAMEWORKS.get(tool["name"])
            prescan = {
                "scan": scan_result(prompt, entries, salt) if observation["body_text"] else None,
                "analysis": _agent_analysis(rng, framework, salt) if framework else no_agent(),
            }
            pipeline.process(observation, prescan=prescan, publish=False)
        _triage_history(rng, moment)

    counts = {table: db.table_count(table) for table in ("events", "findings", "agents", "inventory")}
    log.info("seeded %s in %.1f s", counts, time.perf_counter() - started)
    return counts


def seed_if_empty() -> bool:
    db.init()
    if not db.is_empty():
        return False
    run()
    return True


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    db.init()
    db.reset()
    print(run())
