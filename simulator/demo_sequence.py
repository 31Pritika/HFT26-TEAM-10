"""Runs every scenario in demo order with a gap between them: `python -m simulator.demo_sequence`."""
from __future__ import annotations

import argparse
import sys
import time

from .run import run_scenario

# Spec B6 order. local_llm_chat is not in that list; it goes last so that a missing Ollama cannot disturb the story.
ORDER = ("shadow_saas_sweep", "env_file_leak", "customer_pii_dump", "proprietary_code", "rogue_agent", "canary_trip",
         "gateway_block", "exfil_spike", "local_llm_chat")
GAP_S = 4.0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m simulator.demo_sequence")
    parser.add_argument("--gap", type=float, default=GAP_S, help="seconds between scenarios")
    parser.add_argument("--intensity", type=int, choices=(1, 2, 3), default=1)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    failures = 0
    for index, scenario_id in enumerate(ORDER):
        if index and not args.dry_run:
            time.sleep(args.gap)
        print(f"=== {scenario_id}", flush=True)
        failures += run_scenario(scenario_id, intensity=args.intensity, dry_run=args.dry_run)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
