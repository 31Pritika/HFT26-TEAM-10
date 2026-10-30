"""Points the engine at a throwaway database before anything imports it."""
import os
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="shadowscope-test-")
os.environ["SHADOWSCOPE_DB"] = str(Path(_TMP) / "test.db")
os.environ["SHADOWSCOPE_SEED"] = "0"
os.environ["SHADOWSCOPE_COLLECTORS"] = "0"
