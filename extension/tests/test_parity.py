"""scanner.js must agree with the Python scanner on everything: same findings, same masks, same fingerprints.

Part D ports the same rules, so this is also the reference for what "same" means. Skipped if Node is not installed.
"""
import json
import pathlib
import random
import shutil
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "detector" / "tests")]

from fixtures import samples  # noqa: E402
from shadowscope_detect import scan_text  # noqa: E402
from simulator import fakes  # noqa: E402

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
FIELDS = ("type", "subtype", "severity", "confidence", "title", "description", "detector", "compliance", "remediation")
CANARY = "CANARY-SS-7F3A9"


def corpus():
    cases = []
    for subtype, rows in samples.POSITIVE.items():
        cases += [(f"pos:{subtype}:{i}", s.text, None) for i, s in enumerate(rows)]
    for subtype, rows in samples.NEGATIVE.items():
        cases += [(f"neg:{subtype}:{i}", text, None) for i, text in enumerate(rows)]
    for directory in ("clean", "code"):
        cases += [(f"{directory}:{p.name}", p.read_text(), None)
                  for p in sorted((ROOT / "detector" / "tests" / "fixtures" / directory).iterdir())]
    cases += [("env", fakes.env_file(), None), ("csv", fakes.customers_csv(fakes.fake_customers(20)), None),
              ("module", fakes.proprietary_module(), None), ("canary", f"use {CANARY} twice {CANARY}", {"canary_tokens": [CANARY]}),
              ("threshold", f"blob {samples.ENTROPY_ALNUM} end", {"entropy_threshold": 6.0}), ("empty", "", None),
              ("merged", "password=Zq7Xk9-4111 1111 1111 1111 end", None)]
    for i, (text, policy) in enumerate((json.dumps({"messages": [{"role": "user", "content": t}]}), None)
                                       for t in (s.text for rows in samples.POSITIVE.values() for s in rows)):
        cases.append((f"json:{i}", text, policy))
    rng = random.Random(7)
    pool = [s.text for rows in samples.POSITIVE.values() for s in rows]
    for i in range(50):
        cases.append((f"mix:{i}", rng.choice([" ", "\n", ", "]).join(rng.sample(pool, k=rng.randint(2, 20))), None))
    return cases


@pytest.fixture(scope="module")
def results():
    cases = corpus()
    payload = json.dumps([{"id": i, "text": t, "policy": p} for i, t, p in cases])
    out = subprocess.run(["node", str(ROOT / "extension" / "tests" / "run_scanner.cjs")], input=payload, text=True,
                         capture_output=True, check=True).stdout
    return {row["id"]: row for row in json.loads(out)}


CASES = corpus()


@pytest.mark.parametrize("case_id,text,policy", CASES, ids=[c[0] for c in CASES])
def test_scanner_js_matches_python(results, case_id, text, policy):
    python, js = scan_text(text, policy=policy), results[case_id]
    assert js["redacted_text"] == python["redacted_text"]
    assert js["risk_score"] == python["risk_score"]
    assert [f["subtype"] for f in js["findings"]] == [f["subtype"] for f in python["findings"]]
    for ours, theirs in zip(js["findings"], python["findings"]):
        assert {k: ours[k] for k in FIELDS} == {k: theirs[k] for k in FIELDS}
        assert ours["evidence"] == theirs["evidence"]
    python["stats"].pop("duration_ms")
    assert js["stats"] == python["stats"]
