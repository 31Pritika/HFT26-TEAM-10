#!/usr/bin/env python3
"""Sends observations at a fixed rate and measures throughput and WebSocket latency. Fake data, localhost only.

Run against a server on a throwaway database:
  SHADOWSCOPE_DB=/tmp/load.db SHADOWSCOPE_COLLECTORS=0 uvicorn app.main:app --port 8787
  python scripts/load_test.py --rate 200 --seconds 30
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import time

import httpx
import websockets

API = "http://127.0.0.1:8787/api"
STREAM = "ws://127.0.0.1:8787/api/ws/stream"
PROMPT = "Summarize the release notes for the billing service. " * 30
LEAK = "Why does this fail? AWS_ACCESS_KEY_ID=AKIAFAKEFAKEFAKE1234 contact fake.person@example.com\n" + PROMPT


def observation(index: int) -> dict:
    return {
        "source": "simulator", "process": {"name": f"load-{index % 20}"},
        "dest": {"host": "api.openai.com", "port": 443, "path": f"/v1/chat/completions/{index}", "protocol": "https"},
        "method": "POST", "body_text": LEAK if index % 20 == 0 else PROMPT,
    }


def percentile(values: list[float], share: float) -> float:
    return sorted(values)[min(int(len(values) * share), len(values) - 1)] if values else float("nan")


async def main(rate: int, seconds: int) -> int:
    sent_at: dict[int, float] = {}
    latencies: list[float] = []
    response_times: list[float] = []
    failures = 0

    async def listen(socket) -> None:
        async for message in socket:
            item = json.loads(message)
            if item["type"] == "event":
                path = item["data"]["dest"]["path"] or ""
                index = path.rsplit("/", 1)[-1]
                if index.isdigit() and int(index) in sent_at:
                    latencies.append(time.perf_counter() - sent_at[int(index)])

    async def send(client: httpx.AsyncClient, index: int) -> None:
        nonlocal failures
        started = time.perf_counter()
        sent_at[index] = started
        try:
            response = await client.post(f"{API}/observations", json=observation(index))
            failures += response.status_code != 200
            response_times.append(time.perf_counter() - started)
        except httpx.HTTPError:
            failures += 1

    async with websockets.connect(STREAM, max_queue=None) as socket:
        listener = asyncio.create_task(listen(socket))
        limits = httpx.Limits(max_connections=64, max_keepalive_connections=64)
        async with httpx.AsyncClient(timeout=30, limits=limits) as client:
            tasks, total, begin = [], rate * seconds, time.perf_counter()
            for index in range(total):
                delay = begin + index / rate - time.perf_counter()
                if delay > 0:
                    await asyncio.sleep(delay)
                tasks.append(asyncio.create_task(send(client, index)))
            pace_end = time.perf_counter()
            await asyncio.gather(*tasks)
            finished = time.perf_counter()
        await asyncio.sleep(1.5)
        listener.cancel()

    backlog = finished - pace_end
    print(f"sent {total} in {pace_end - begin:.1f} s ({total / (pace_end - begin):.0f}/s), drained {backlog:.2f} s later, failures {failures}")
    print(f"http ms: p50 {percentile(response_times, .5) * 1000:.0f}  p95 {percentile(response_times, .95) * 1000:.0f}  max {max(response_times) * 1000:.0f}")
    print(f"ws ms:   p50 {percentile(latencies, .5) * 1000:.0f}  p95 {percentile(latencies, .95) * 1000:.0f}  max {max(latencies, default=0) * 1000:.0f}  received {len(latencies)}/{total}")
    print(f"stdev ws ms {statistics.pstdev(latencies) * 1000:.0f}" if latencies else "no ws events")
    return 1 if failures or backlog > 1 or len(latencies) < total or percentile(latencies, .95) > 0.3 else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rate", type=int, default=200)
    parser.add_argument("--seconds", type=int, default=30)
    options = parser.parse_args()
    raise SystemExit(asyncio.run(main(options.rate, options.seconds)))
