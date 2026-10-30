"""Real TLS connections to five AI providers: no key, no body, so only the metadata is ever observed."""
from __future__ import annotations

from ..client import SWEEP_HOSTS, Context, process_info
from .base import Scenario


def run(ctx: Context) -> None:
    for _ in range(ctx.intensity):
        for host in SWEEP_HOSTS:
            status = ctx.probe(host)
            ctx.say(f"{host}: {status if status is not None else 'no response'}")
            ctx.report({"process": process_info("python3 shadow_tools.py --sweep"), "method": "GET",
                        "dest": {"host": host, "port": 443, "path": "/v1/models", "protocol": "tls"},
                        "meta": {"tags": ["sweep"]}})


SCENARIO = Scenario("shadow_saas_sweep", "Shadow SaaS sweep",
                    "Metadata-only TLS connects to five AI providers, with no key and no body.", "radar", "high",
                    ("shadow-ai", "network"), run)
