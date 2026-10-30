"""shadowscope-scan: paths, globs, skips, output formats and exit codes."""
import io
import json

import pytest

from shadowscope_detect import cli
from fixtures import samples


@pytest.fixture
def tree(tmp_path):
    (tmp_path / "leak.env").write_text(f"KEY={samples.AWS_ACCESS}\n")
    (tmp_path / "notes.md").write_text("Nothing sensitive here.\n")
    (tmp_path / "pii.txt").write_text("contact a.b@example.com\n")
    return tmp_path


def run(capsys, *argv):
    code = cli.main([str(arg) for arg in argv])
    return code, capsys.readouterr()


def test_finding_at_or_above_threshold_exits_1(tree, capsys):
    code, out = run(capsys, tree / "leak.env")
    assert code == 1
    assert "aws_access_key" in out.out and "critical" in out.out


def test_clean_file_exits_0(tree, capsys):
    code, out = run(capsys, tree / "notes.md")
    assert code == 0
    assert "0 findings in 1 file" in out.out


def test_output_never_shows_the_raw_value(tree, capsys):
    for argv in ((tree / "leak.env",), (tree / "leak.env", "--json")):
        code, out = run(capsys, *argv)
        assert samples.AWS_ACCESS not in out.out


@pytest.mark.parametrize("threshold,expected", [("critical", 0), ("high", 0), ("medium", 1), ("low", 1), ("info", 1)])
def test_fail_on_threshold_for_a_medium_finding(tree, capsys, threshold, expected):
    assert run(capsys, tree / "pii.txt", "--fail-on", threshold)[0] == expected


def test_default_threshold_is_high(tree, capsys):
    assert run(capsys, tree / "pii.txt")[0] == 0


def test_invalid_threshold_is_a_usage_error(tree, capsys):
    with pytest.raises(SystemExit) as error:
        run(capsys, tree, "--fail-on", "nope")
    assert error.value.code == 2


def test_missing_path_exits_2(tree, capsys):
    code, out = run(capsys, tree / "missing.txt")
    assert code == 2
    assert "no such file" in out.err


def test_directory_is_walked(tree, capsys):
    code, out = run(capsys, tree)
    assert code == 1
    assert "3 files" in out.out


@pytest.mark.parametrize("skipped", [".git", "node_modules", ".venv", "__pycache__"])
def test_noise_directories_are_skipped(tree, capsys, skipped):
    (tree / skipped).mkdir()
    (tree / skipped / "secret.txt").write_text(f"KEY={samples.OPENAI}\n")
    assert "openai_key" not in run(capsys, tree)[1].out


def test_glob(tree, capsys):
    code, out = run(capsys, tree / "*.env")
    assert code == 1
    assert "1 file" in out.out


def test_recursive_glob(tree, capsys):
    (tree / "sub").mkdir()
    (tree / "sub" / "x.env").write_text(f"KEY={samples.OPENAI}\n")
    assert "openai_key" in run(capsys, tree / "**" / "*.env")[1].out


def test_several_paths_as_pre_commit_passes_them(tree, capsys):
    assert "2 files" in run(capsys, tree / "leak.env", tree / "notes.md")[1].out


def test_stdin(capsys, monkeypatch):
    monkeypatch.setattr("sys.stdin", io.StringIO(f"KEY={samples.AWS_ACCESS}"))
    code, out = run(capsys, "-", "--json")
    assert code == 1
    assert json.loads(out.out)["findings"][0]["path"] == "<stdin>"


def test_binary_files_are_skipped(tree, capsys):
    (tree / "image.bin").write_bytes(b"\x89PNG\0\0" + samples.AWS_ACCESS.encode())
    code, out = run(capsys, tree / "image.bin")
    assert code == 0
    assert "0 files" in out.out


def test_oversized_files_are_skipped(tree, capsys, monkeypatch):
    monkeypatch.setattr(cli, "MAX_FILE_BYTES", 4)
    assert run(capsys, tree / "leak.env")[0] == 0


def test_non_utf8_text_is_still_scanned(tree, capsys):
    (tree / "latin.txt").write_bytes(b"caf\xe9 KEY=" + samples.AWS_ACCESS.encode())
    assert run(capsys, tree / "latin.txt")[0] == 1


def test_json_output_shape(tree, capsys):
    code, out = run(capsys, tree / "leak.env", "--json")
    data = json.loads(out.out)
    assert data["files_scanned"] == 1
    assert data["findings"][0]["path"].endswith("leak.env")
    assert data["findings"][0]["evidence"]["line"] == 1


def test_no_ansi_when_output_is_not_a_terminal(tree, capsys):
    assert "\033[" not in run(capsys, tree / "leak.env")[1].out


class FakeTty(io.StringIO):
    def isatty(self):
        return True


def test_ansi_on_a_terminal(tree, monkeypatch):
    out = FakeTty()
    monkeypatch.setattr("sys.stdout", out)
    monkeypatch.delenv("NO_COLOR", raising=False)
    cli.main([str(tree / "leak.env")])
    assert "\033[1;31m" in out.getvalue()


def test_no_color_is_honoured(tree, monkeypatch):
    out = FakeTty()
    monkeypatch.setattr("sys.stdout", out)
    monkeypatch.setenv("NO_COLOR", "1")
    cli.main([str(tree / "leak.env")])
    assert "\033[" not in out.getvalue()


def test_findings_print_most_severe_first(tmp_path, capsys):
    (tmp_path / "x.txt").write_text(f"a@example.com\n{samples.AWS_ACCESS}\n")
    lines = run(capsys, tmp_path / "x.txt")[1].out.splitlines()
    assert lines[0].startswith("critical") and lines[1].startswith("medium")


def test_code_finding_has_no_line_number(tmp_path, capsys):
    (tmp_path / "x.py").write_text("\n".join(f"import module{i}" for i in range(6)))
    assert "x.py:-" in run(capsys, tmp_path / "x.py", "--fail-on", "critical")[1].out
