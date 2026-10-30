# Part B · Detection, Intelligence & Simulator

**Owner:** Aaraadhyaa · **Branch:** `aaraadhyaa/detection-intel`
**Owns:** `detector/`, `simulator/`, `extension/`, `docs/detector.md`, `docs/simulator.md`,
`docs/progress/aaraadhyaa.md`

Read `docs/specs/00_MASTER_SPEC.md`, `docs/specs/02_SPEC_B_detection_intel_aaraadhyaa.md` and
`docs/progress/aaraadhyaa.md` first. The master spec wins any disagreement.

The public API in `shadowscope_detect/__init__.py` is frozen (spec 01 §A9): keep the signatures, replace
the stub bodies.

## Golden rules (master §3.1)
1. Never edit files outside your ownership list. Need a change elsewhere? Write it in your progress
   log under `## Requests to other parts` and continue with a local workaround.
2. Never block on another part. Code against the contracts in §5 and the mock data in `contracts/mock/`.
3. Commit small and often (every working sub-feature), conventional commits:
   `feat(core): ...`, `fix(detector): ...`, `feat(dashboard): ...`, `feat(experience): ...`.
4. Push to your own branch at the end of every phase (and ideally every ~45 min).
5. Never commit real secrets. `.env` is git-ignored. Test fixtures use **obviously fake** keys that
   still match patterns (e.g. `AKIAFAKEFAKEFAKE1234`). Never send fake-secret payloads to real
   external AI providers — only to localhost.
6. Free & open-source only. No paid APIs, no premium libraries.
7. Must work on Chrome + Edge, desktop + mobile (375px → 1920px).

## Run
```bash
pip install -e "detector[dev]"
pytest detector
```
