"""Watches processes that recently talked to an AI provider for shells and sensitive open files."""
from __future__ import annotations

import re

import psutil

from .. import config, pipeline
from ..engine.detect_adapter import harden
from ..utils import fingerprint
from . import activity
from .base import Collector

SHELLS = {"bash", "sh", "zsh", "fish", "cmd.exe", "powershell.exe", "pwsh", "pwsh.exe"}
BROWSERS = ("Google Chrome", "Microsoft Edge", "Brave Browser", "Safari", "firefox", "chrome", "msedge", "brave")
BROWSER_DATA = {"Login Data", "Cookies"}
# Electron apps keep their own Cookies file, so only a real browser profile counts, and only if it isn't that browser's.
BROWSER_PROFILE = re.compile(r"Google[/\\]Chrome|Chrome[/\\]User Data|Microsoft[/\\]Edge|Microsoft Edge|BraveSoftware|Mozilla[/\\]Firefox|Safari[/\\]")
SENSITIVE_PATHS: list[tuple[str, re.Pattern, str]] = [
    ("SSH key", re.compile(r"/\.ssh/|id_rsa|id_ed25519"), "critical"),
    ("Password hashes", re.compile(r"/etc/shadow"), "critical"),
    ("Windows credential store", re.compile(r"\\config\\SAM", re.I), "critical"),
    ("Environment file", re.compile(r"(?:^|[/\\])\.env$"), "high"),
    ("System accounts", re.compile(r"/etc/passwd"), "high"),
    ("AWS credentials", re.compile(r"\.aws/credentials"), "high"),
    ("Kubernetes config", re.compile(r"\.kube/config"), "high"),
    ("Git credentials", re.compile(r"\.git-credentials"), "high"),
    ("npm credentials", re.compile(r"\.npmrc"), "high"),
    ("Docker credentials", re.compile(r"\.docker/config\.json"), "high"),
    ("Login Data", re.compile(r"Login Data"), "high"),
    ("Cookies", re.compile(r"Cookies"), "high"),
]


def classify_path(path: str, process_name: str) -> tuple[str, str] | None:
    """Label and severity for a sensitive path, or None."""
    for label, pattern, severity in SENSITIVE_PATHS:
        if pattern.search(path):
            if label in BROWSER_DATA and (not BROWSER_PROFILE.search(path) or process_name.startswith(BROWSERS)):
                return None
            return label, severity
    return None


def _finding(subtype: str, severity: str, title: str, detail: str, key: str) -> dict:
    return {
        "type": "agent_action", "subtype": subtype, "severity": severity, "confidence": 0.9, "title": title,
        "description": detail, "detector": "process", "compliance": [], "remediation": [],
        "evidence": {"redacted_snippet": detail, "match_redacted": detail, "entropy": None, "line": None, "offset": None,
                     "fingerprint": fingerprint(key)},
    }


def _analysis(kind: str, detail: str, severity: str, finding: dict) -> dict:
    return {"is_agent": True, "framework": "unknown", "tools_declared": [], "findings": [finding],
            "actions": [{"kind": kind, "detail": detail, "severity": severity, "verified": False, "tool_name": None}]}


def shell_analysis(process_name: str, shell_name: str, command: str) -> dict:
    detail = f"{process_name} spawned {shell_name}: {harden(command)}"[:300]
    finding = _finding("shell_spawn", "high", f"AI process spawned a shell: {process_name}", detail, f"shell:{process_name}:{shell_name}")
    return _analysis("shell_exec", detail, "high", finding)


def file_analysis(process_name: str, path: str, label: str, severity: str) -> dict:
    detail = f"{process_name} has {path} open"[:300]
    finding = _finding("sensitive_file_read", severity, f"AI process opened a sensitive file: {label}", detail, f"file:{process_name}:{path}")
    return _analysis("file_read", detail, severity, finding)


class AgentWatch(Collector):
    name = "agent_watch"
    interval = 2.0

    def __init__(self) -> None:
        super().__init__()
        self._seen: set[tuple] = set()
        self._denied: set[int] = set()

    def _send(self, entry: dict, analysis: dict) -> None:
        pipeline.process({"source": "live_conn", "process": entry["process"], "dest": entry["dest"]},
                         prescan={"scan": None, "analysis": analysis}, force=True)

    def _check_children(self, process: psutil.Process, pid: int, entry: dict) -> None:
        for child in process.children(recursive=True):
            key = (pid, "child", child.pid)
            if key in self._seen:
                continue
            try:
                shell = child.name()
                if shell in SHELLS:
                    self._seen.add(key)
                    self._send(entry, shell_analysis(entry["process"]["name"], shell, " ".join(child.cmdline())))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

    def _check_files(self, process: psutil.Process, pid: int, entry: dict) -> None:
        for item in process.open_files():
            key = (pid, "file", item.path)
            found = classify_path(item.path, entry["process"]["name"])
            if found and key not in self._seen:
                self._seen.add(key)
                self._send(entry, file_analysis(entry["process"]["name"], item.path, *found))

    def inspect(self, pid: int, entry: dict) -> None:
        try:
            process = psutil.Process(pid)
            self._check_children(process, pid, entry)
            self._check_files(process, pid, entry)
        except psutil.NoSuchProcess:
            pass
        except psutil.AccessDenied:
            self._denied.add(pid)

    def poll(self) -> None:
        self._denied.clear()
        active = activity.recently_active(config.AGENT_ACTIVE_WINDOW_S)
        for pid, entry in active.items():
            self.inspect(pid, entry)
        self._seen = {key for key in self._seen if key[0] in active}
        self.report(reason=f"{len(self._denied)} processes could not be inspected" if self._denied else None)
