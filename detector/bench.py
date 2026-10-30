"""Throughput benchmark: `python detector/bench.py [megabytes]`. Target from spec B1: at least 5 MB/s on a mixed corpus."""
from __future__ import annotations

import json
import random
import sys
import time

from shadowscope_detect import scan_text

MEGABYTE = 1_000_000
DEFAULT_MB = 5
TARGET_MB_PER_S = 5.0
_PROSE = ("The quick brown fox jumps over the lazy dog while the deployment pipeline waits for review. Order 1042 shipped "
          "on 2026-03-15 at 10:30:45 for 1299.50 INR to warehouse 7, and the team agreed to revisit it next quarter.\n")
_CODE = ('def handle(request):\n    user_id = request.args.get("id", 42)\n    return jsonify({"status": "ok", "count": 12345})\n'
         "const value = items.map((x) => x * 2); // TODO refactor\n")
_LOG = "2026-03-15T10:30:45.123Z INFO req=550e8400-e29b-41d4-a716-446655440000 ip=8.8.8.8 latency=123ms path=/api/v1/users/9\n"
_LEAKS = ("AWS_ACCESS_KEY_ID=" "AKIA" "FAKEFAKEFAKE1234\n", "contact priya.fake@example.com or +91 98765 43210\n",
          "password = 'FAKE-hunter2-pass'\n", "Aadhaar 2345 6789 0124, PAN FAKPE1234X\n", "card 4111 1111 1111 1111\n")


def build_corpus(size: int, seed: int = 7) -> str:
    rng = random.Random(seed)
    parts: list[str] = []
    length = 0
    while length < size:
        block = rng.choice((_PROSE, _PROSE, _CODE, _LOG)) * rng.randint(5, 40)
        if rng.random() < 0.05:
            block += rng.choice(_LEAKS)
        if rng.random() < 0.1:
            block = json.dumps({"messages": [{"role": "user", "content": block}]}) + "\n"
        parts.append(block)
        length += len(block)
    return "".join(parts)[:size]


def main() -> int:
    megabytes = float(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_MB
    corpus = build_corpus(int(megabytes * MEGABYTE))
    started = time.perf_counter()
    result = scan_text(corpus)
    elapsed = time.perf_counter() - started
    rate = len(corpus) / MEGABYTE / elapsed
    print(f"{len(corpus) / MEGABYTE:.1f} MB in {elapsed * 1000:.0f} ms = {rate:.1f} MB/s, {len(result['findings'])} findings "
          f"(target {TARGET_MB_PER_S:.0f} MB/s: {'met' if rate >= TARGET_MB_PER_S else 'MISSED'})")
    return 0 if rate >= TARGET_MB_PER_S else 1


if __name__ == "__main__":
    sys.exit(main())
