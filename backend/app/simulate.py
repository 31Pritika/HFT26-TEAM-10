"""Starts simulator runs: Part B's CLI when it exists, otherwise a few canned observations so the UI still reacts."""
from __future__ import annotations

import subprocess
import sys
import threading
import time

from . import config, pipeline
from .api.routes_scenarios import simulator_available
from .seed_catalog import AGENT_FINDINGS, agent_action, agent_finding, data_entry, no_agent, scan_result
from .utils import new_id

STEP_DELAY_S = 0.3
OPENAI = {"host": "api.openai.com", "port": 443, "path": "/v1/chat/completions", "protocol": "https"}
LANGCHAIN = {"name": "python3", "cmdline_hint": "python3 langchain_agent.py --tools shell,fs"}


def _hosts(*hosts: str) -> list[dict]:
    return [{"dest": {"host": host, "port": 443, "protocol": "tls"}, "process": {"name": "curl"}} for host in hosts]


def _leak(prompt: str, *subtypes: str, process: dict | None = None, dest: dict | None = None) -> dict:
    return {"dest": dest or OPENAI, "process": process or {"name": "python3"}, "prompt": prompt, "entries": [data_entry(s) for s in subtypes]}


def _agent(*subtypes: str) -> list[dict]:
    return [{"dest": OPENAI, "process": LANGCHAIN, "prompt": "Continue with the next tool call.", "entries": [],
             "agent": next(entry for entry in AGENT_FINDINGS if entry[0] == subtype)} for subtype in subtypes]


CANNED: dict[str, list[dict]] = {
    "shadow_saas_sweep": _hosts("api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com", "api.groq.com", "huggingface.co"),
    "env_file_leak": [_leak("Why does this .env not load?", "aws_access_key", "openai_key", "stripe_key", "db_connection_url")],
    "customer_pii_dump": [_leak("Clean up this customer CSV.", "bulk_pii", "aadhaar", "pan", "phone_in", "upi_id")],
    "proprietary_code": [_leak("Review this module.", "proprietary_code", "jwt", dest={"host": "api.anthropic.com", "port": 443, "path": "/v1/messages", "protocol": "https"})],
    "rogue_agent": _agent("sensitive_file_read", "remote_code_exec", "recon", "unverified_tool_call"),
    "canary_trip": [_leak("Look up this reference.", "canary_token")],
    "gateway_block": [_leak("Why does this .env not load?", "aws_access_key", "db_connection_url")],
    "exfil_spike": [{**_leak("Batch upload.", "bytes_out_spike"), "bytes_out": 8_400_000}],
    "local_llm_chat": [_leak("Summarize this note.", "email", "internal_host", process={"name": "ollama"},
                             dest={"host": "localhost", "port": 11434, "path": "/api/chat", "protocol": "http"})],
}


def _run_canned(scenario_id: str, intensity: int, run_id: str) -> None:
    for repeat in range(intensity):
        for index, step in enumerate(CANNED.get(scenario_id, [])):
            salt = f"{run_id}:{repeat}:{index}"
            prompt = step.get("prompt")
            scan = scan_result(prompt, step["entries"], salt) if prompt else None
            analysis = no_agent()
            if "agent" in step:
                entry = step["agent"]
                analysis = {**analysis, "is_agent": True, "framework": "langchain", "actions": [agent_action(entry)], "findings": [agent_finding(entry, salt)]}
            pipeline.process(
                {"source": "simulator", "process": step["process"], "dest": step["dest"], "method": "POST" if prompt else None,
                 "body_text": prompt, "bytes_out": step.get("bytes_out"), "meta": {"scenario_id": scenario_id, "run_id": run_id}},
                prescan={"scan": scan, "analysis": analysis},
            )
            time.sleep(STEP_DELAY_S)


def start(scenario_id: str, intensity: int) -> str:
    """Launches a run in the background and returns its id. `scenario_id` must already be validated."""
    run_id = new_id("run")
    if simulator_available():
        subprocess.Popen([sys.executable, "-m", "simulator.run", scenario_id, "--intensity", str(intensity)], cwd=config.REPO_ROOT,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        threading.Thread(target=_run_canned, args=(scenario_id, intensity, run_id), daemon=True).start()
    return run_id
