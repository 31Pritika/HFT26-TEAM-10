"""`shadowscope-scan <path|glob|-> ... [--json] [--fail-on high]`: shift-left scanning for files and pre-commit."""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from pathlib import Path
from typing import Iterator

from .scanner import scan_text

EXIT_CLEAN, EXIT_FINDINGS, EXIT_USAGE = 0, 1, 2
SEVERITIES = ("critical", "high", "medium", "low", "info")   # most severe first
MAX_FILE_BYTES = 5 * 1024 * 1024
_SKIP_DIRS = frozenset((".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".pytest_cache"))
_SNIFF_BYTES = 8192
_COLOURS = {"critical": "\033[1;31m", "high": "\033[31m", "medium": "\033[33m", "low": "\033[32m", "info": "\033[34m"}
_RESET = "\033[0m"
_MATCH_CHARS = 48


def _rank(severity: str) -> int:
    return len(SEVERITIES) - SEVERITIES.index(severity)


def _walk(root: str) -> Iterator[str]:
    for directory, subdirs, files in os.walk(root):
        subdirs[:] = sorted(name for name in subdirs if name not in _SKIP_DIRS)
        yield from (os.path.join(directory, name) for name in sorted(files))


def _expand(path: str) -> Iterator[str] | None:
    """Files behind one argument, or None if it matches nothing."""
    if path == "-" or os.path.isfile(path):
        return iter((path,))
    if os.path.isdir(path):
        return _walk(path)
    matches = glob.glob(path, recursive=True) if any(ch in path for ch in "*?[") else []
    if not matches:
        return None
    return (name for match in sorted(matches) for name in (_walk(match) if os.path.isdir(match) else (match,)))


def _read(path: str) -> str | None:
    """The file's text, or None to skip a binary or oversized file."""
    if path == "-":
        return sys.stdin.read()
    target = Path(path)
    if target.stat().st_size > MAX_FILE_BYTES:
        return None
    data = target.read_bytes()
    return None if b"\0" in data[:_SNIFF_BYTES] else data.decode("utf-8", "replace")


def _scan_paths(paths: list[str]) -> tuple[list[dict], int] | None:
    results: list[dict] = []
    scanned = 0
    for argument in paths:
        files = _expand(argument)
        if files is None:
            print(f"shadowscope-scan: no such file: {argument}", file=sys.stderr)
            return None
        for path in files:
            try:
                text = _read(path)
            except OSError as error:
                print(f"shadowscope-scan: skipping {path}: {error.strerror}", file=sys.stderr)
                continue
            if text is not None:
                scanned += 1
                results += [{"path": "<stdin>" if path == "-" else path, **f} for f in scan_text(text)["findings"]]
    return results, scanned


def _print_table(findings: list[dict], scanned: int, colour: bool) -> None:
    location = [f"{f['path']}:{f['evidence']['line'] or '-'}" for f in findings]
    width = max((len(item) for item in location), default=0)
    for finding, where in sorted(zip(findings, location), key=lambda row: -_rank(row[0]["severity"])):
        severity = finding["severity"]
        label = f"{severity:<8}"
        label = f"{_COLOURS[severity]}{label}{_RESET}" if colour else label
        match = finding["evidence"]["match_redacted"].replace("\n", " ")[:_MATCH_CHARS]
        print(f"{label}  {finding['subtype']:<26}  {where:<{width}}  {match}")
    print(f"{len(findings)} finding{'' if len(findings) == 1 else 's'} in {scanned} "
          f"file{'' if scanned == 1 else 's'}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="shadowscope-scan", description="Scan files for secrets, PII and source code.")
    parser.add_argument("paths", nargs="+", help="files, directories or globs; - reads stdin")
    parser.add_argument("--json", action="store_true", help="print findings as JSON")
    parser.add_argument("--fail-on", choices=SEVERITIES, default="high",
                        help="exit 1 at this severity or above (default: high)")
    args = parser.parse_args(argv)

    scanned = _scan_paths(args.paths)
    if scanned is None:
        return EXIT_USAGE
    findings, files = scanned
    if args.json:
        print(json.dumps({"files_scanned": files, "findings": findings}, ensure_ascii=False, indent=2))
    else:
        _print_table(findings, files, sys.stdout.isatty() and "NO_COLOR" not in os.environ)
    failed = any(_rank(f["severity"]) >= _rank(args.fail_on) for f in findings)
    return EXIT_FINDINGS if failed else EXIT_CLEAN


if __name__ == "__main__":
    sys.exit(main())
