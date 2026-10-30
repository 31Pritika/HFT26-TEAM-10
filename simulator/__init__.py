"""Attack simulator: real localhost traffic plus Observations for Part A. HTTP only, see spec 02 §B6."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

# Part A runs this in the backend's venv, where the detector may not be installed, or may sit behind a .pth file that
# macOS has flagged hidden.
if importlib.util.find_spec("shadowscope_detect") is None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "detector"))
