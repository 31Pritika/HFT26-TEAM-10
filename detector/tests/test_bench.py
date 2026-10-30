"""The benchmark corpus has to be realistic: mixed, reproducible, and holding real findings."""
import importlib.util
import pathlib

spec = importlib.util.spec_from_file_location("bench", pathlib.Path(__file__).parents[1] / "bench.py")
bench = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bench)


def test_corpus_is_exactly_the_requested_size_and_reproducible():
    assert len(bench.build_corpus(100_000)) == 100_000
    assert bench.build_corpus(100_000) == bench.build_corpus(100_000)


def test_corpus_holds_findings():
    assert bench.scan_text(bench.build_corpus(500_000))["findings"]
