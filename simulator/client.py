"""The simulator's only way onto the network. Every safety rule of spec B6 lives here, so no scenario can skip one.

- A request with a body may only go to this machine (`send`).
- The one thing allowed off this machine is a bodyless, keyless GET to five known hosts (`probe`).
- Proxies are ignored: one could carry fake secrets out of a request addressed to localhost.
- `X-ShadowScope-Self` is never sent: it would make the gateway skip its scan and forward to the real provider.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import httpx

from . import mock_provider

API_BASE = os.getenv("SHADOWSCOPE_API", "http://localhost:8787/api")
OLLAMA_URL = (os.getenv("OLLAMA_URL") or "http://localhost:11434").rstrip("/")
MOCK_URL = f"http://{mock_provider.HOST}:{mock_provider.PORT}"
LOOPBACK_HOSTS = frozenset(("localhost", "127.0.0.1", "::1"))
SWEEP_HOSTS = ("api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com", "api.groq.com",
               "huggingface.co")
SIM_HEADER = {"X-ShadowScope-Sim": "1"}     # lets Part A's loopback sniffer skip what we also report by HTTP
_TIMEOUT_S = 10.0
_MOCK_START_S = 3.0
_DEMO_SHELL_S = 4    # Part A's process watcher polls every 2 s, so a shorter-lived child can be missed


class UnsafeTarget(RuntimeError):
    """A request was about to leave this machine in a way spec B6 forbids."""


def _is_loopback(url: str) -> bool:
    return urlsplit(url).hostname in LOOPBACK_HOSTS


def _port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.3)
        return probe.connect_ex((host, port)) == 0


@dataclass
class Context:
    """One scenario run: its identity, and the network calls it may make."""
    scenario_id: str
    intensity: int = 1
    dry_run: bool = False
    run_id: str = field(default_factory=lambda: f"sim_{uuid.uuid4().hex[:12]}")
    api_base: str = API_BASE
    transport: httpx.BaseTransport | None = None   # tests replace the network here
    _client: httpx.Client | None = None

    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=_TIMEOUT_S, trust_env=False, follow_redirects=False,
                                        transport=self.transport)
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()

    def say(self, message: str) -> None:
        print(f"[{self.scenario_id}] {message}", flush=True)

    def send(self, url: str, body: dict, headers: dict | None = None) -> httpx.Response | None:
        """POST to this machine. Returns None if nothing is listening: a scenario must survive that."""
        if not _is_loopback(url):
            raise UnsafeTarget(f"refusing to send a body to {url}")
        if self.dry_run:
            return None
        merged = {**SIM_HEADER, **(headers or {})}
        if any(name.lower() == "x-shadowscope-self" for name in merged):
            raise UnsafeTarget("refusing to send X-ShadowScope-Self: it disables the gateway's scan")
        try:
            return self.client.post(url, json=body, headers=merged)
        except httpx.HTTPError as error:
            self.say(f"{url} did not answer: {type(error).__name__}")
            return None

    def probe(self, host: str) -> int | None:
        """A real TLS connection with no key and no body, for the shadow SaaS sweep only."""
        if host not in SWEEP_HOSTS:
            raise UnsafeTarget(f"{host} is not a sweep host")
        if self.dry_run:
            return None
        try:
            return self.client.get(f"https://{host}/v1/models").status_code
        except httpx.HTTPError as error:
            self.say(f"{host} did not answer: {type(error).__name__}")
            return None

    def api_get(self, path: str) -> dict | None:
        if self.dry_run:
            return None
        try:
            response = self.client.get(f"{self.api_base}{path}")
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            return None

    def report(self, observation: dict) -> None:
        """Tell Part A what happened. If the backend is down, print it and carry on (spec B6)."""
        meta = {"scenario_id": self.scenario_id, "run_id": self.run_id, **(observation.get("meta") or {})}
        record = {"source": "simulator", **observation, "meta": meta}
        if self.dry_run:
            print(json.dumps(record, ensure_ascii=False), flush=True)
            return
        try:
            self.client.post(f"{self.api_base}/observations", json=record).raise_for_status()
        except httpx.HTTPError as error:
            self.say(f"backend unavailable ({type(error).__name__}), observation not recorded:")
            print(json.dumps(record, ensure_ascii=False), flush=True)

    def ensure_mock(self) -> bool:
        """Start the mock provider unless one is running. Nothing else in the project starts it."""
        if self.dry_run:
            return False
        if self.transport is not None or _port_open(mock_provider.HOST, mock_provider.PORT):
            return True
        try:
            import uvicorn
            server = uvicorn.Server(uvicorn.Config(mock_provider.build_app(), host=mock_provider.HOST,
                                                   port=mock_provider.PORT, log_level="warning"))
        except ImportError:
            self.say("fastapi or uvicorn is missing, so no real traffic: reporting the observation only")
            return False
        threading.Thread(target=server.run, daemon=True).start()
        deadline = time.monotonic() + _MOCK_START_S
        while time.monotonic() < deadline:
            if _port_open(mock_provider.HOST, mock_provider.PORT):
                return True
            time.sleep(0.05)
        self.say("mock provider did not start: reporting the observation only")
        return False

    def ollama_model(self) -> str | None:
        """The first model of a running Ollama, or None to fall back on the mock provider."""
        if self.dry_run or self.transport is not None:
            return None
        try:
            models = self.client.get(f"{OLLAMA_URL}/api/tags", timeout=1.0).json().get("models") or []
        except (httpx.HTTPError, ValueError, AttributeError):
            return None
        return models[0].get("name") if models else None

    def exchange(self, path: str, body: dict, *, host: str, process: dict, base_url: str = MOCK_URL,
                 tags: list[str] | None = None, body_preview: str | None = None) -> str:
        """Send one request to a local provider and report it. Returns the reply text.

        With no live provider (dry run, or mock unavailable) the reply is computed locally, so a run reads the same.
        """
        reply = None
        if base_url != MOCK_URL or self.ensure_mock():
            sent = self.send(f"{base_url}{path}", body, {"Host": host})
            reply = sent.text if sent is not None else None
        text = reply if reply is not None else json.dumps(mock_provider.reply_for(path, body), ensure_ascii=False)
        encoded = json.dumps(body, ensure_ascii=False)
        split = urlsplit(base_url)
        self.report({
            "process": process, "method": "POST",
            "dest": {"host": host, "ip": split.hostname, "port": split.port, "path": path, "protocol": "http"},
            "headers": {"Host": host, **SIM_HEADER},
            "body_text": encoded if body_preview is None else body_preview, "response_text": text,
            "bytes_out": len(encoded.encode()), "bytes_in": len(text.encode()), "meta": {"tags": tags or []},
        })
        return text

    def spawn_demo_shell(self) -> subprocess.Popen | None:
        """A harmless real child shell, for Part A's process watcher to notice."""
        if self.dry_run or self.transport is not None:
            return None
        try:
            return subprocess.Popen(["sh", "-c", f"echo shadowscope-demo; sleep {_DEMO_SHELL_S}"],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError:
            self.say("no sh on this machine, skipping the child shell")
            return None

    def pause(self, seconds: float) -> None:
        if not self.dry_run and self.transport is None:
            time.sleep(seconds)


def process_info(cmdline: str) -> dict:
    return {"name": "python3", "pid": os.getpid(), "cmdline_hint": cmdline}
