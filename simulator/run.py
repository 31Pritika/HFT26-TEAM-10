"""CLI: `python -m simulator.run <scenario_id> [--intensity 1-3] [--dry-run]`, or `--list [--json]`.

Part A calls this as a subprocess for /api/scenarios and /api/simulate, so `--list --json` prints nothing but JSON.
"""
from __future__ import annotations

import argparse
import json
import sys

from .client import Context
from .scenarios import BY_ID, SCENARIOS


def run_scenario(scenario_id: str, *, intensity: int = 1, dry_run: bool = False, run_id: str | None = None) -> int:
    ctx = Context(scenario_id, intensity=intensity, dry_run=dry_run, **({"run_id": run_id} if run_id else {}))
    try:
        BY_ID[scenario_id].run(ctx)
    except Exception as error:  # one bad scenario must not stop a live demo sequence
        ctx.say(f"failed: {type(error).__name__}: {error}")
        return 1
    finally:
        ctx.close()
    return 0


def _print_list(as_json: bool) -> None:
    if as_json:
        print(json.dumps([scenario.as_dict() for scenario in SCENARIOS], ensure_ascii=False))
        return
    for scenario in SCENARIOS:
        print(f"{scenario.id:20} {scenario.severity:9} {scenario.name}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m simulator.run", description="Run a ShadowScope attack scenario.")
    parser.add_argument("scenario_id", nargs="?", help="scenario to run")
    parser.add_argument("--intensity", type=int, choices=(1, 2, 3), default=1)
    parser.add_argument("--dry-run", action="store_true", help="print observations and send nothing")
    parser.add_argument("--run-id", help="tag observations with this id instead of a new one")
    parser.add_argument("--list", action="store_true", help="list scenarios")
    parser.add_argument("--json", action="store_true", help="with --list, print JSON")
    args = parser.parse_args(argv)

    if args.list:
        _print_list(args.json)
        return 0
    if args.scenario_id not in BY_ID:
        print(f"unknown scenario: {args.scenario_id}. Use --list.", file=sys.stderr)
        return 2
    return run_scenario(args.scenario_id, intensity=args.intensity, dry_run=args.dry_run, run_id=args.run_id)


if __name__ == "__main__":
    sys.exit(main())
