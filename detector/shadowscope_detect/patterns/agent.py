"""Master §8.4 as data: dangerous tools, command and path rules, tool kinds, framework markers."""
from __future__ import annotations

import re

from . import Rule

DANGEROUS_TOOL = re.compile(
    r"shell|bash|terminal|exec|run_command|execute|python_repl|code_interpreter|subprocess|powershell|cmd"
    r"|read_file|file_read|write_file|fs_|delete",
    re.IGNORECASE,
)
SHELL_PROCESS_NAMES = frozenset(("bash", "sh", "zsh", "fish", "cmd.exe", "powershell.exe", "pwsh"))

# Bare "true" after an approval key: the only sign of a human in the loop a payload can carry.
HUMAN_CONFIRMATION = re.compile(
    r"""\b(?:human_?)?(?:approved|confirmed|confirmation|approval)\b["']?\s*[:=]\s*["']?(?:true|yes|granted)\b""",
    re.IGNORECASE,
)


def _rule(id: str, severity: str, title: str, pattern: str, flags: int = re.IGNORECASE) -> Rule:
    return Rule(id=id, type="agent_action", regex=re.compile(pattern, flags), severity=severity, title=title,
                detector="heuristic", confidence=0.9)


COMMAND_RULES: tuple[Rule, ...] = (
    _rule("destructive_command", "critical", "Agent ran a destructive command",
          r"\brm\s+-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\b|\bmkfs\b|\bdd\s+if=|:\(\)\s*\{|\bdel\s+/s\s+/q\b"
          r"|\bRemove-Item\b.*-Recurse\b.*-Force\b|\bformat\s+[a-z]:"),
    _rule("remote_code_exec", "critical", "Agent piped a remote script to a shell",
          r"\b(?:curl|wget)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b|\biex\s*\(\s*iwr\b|\bInvoke-Expression\b"
          r"|\bpython3?\s+-c\b.*\bexec\b"),
    _rule("data_exfil_command", "high", "Agent uploaded a local file",
          r"\bcurl\b.*(?:-d|--data(?:-binary|-raw)?|-F|--form)\s*(?:\w+=)?@|\bcurl\b.*(?:--upload-file|-T)\s"
          r"|\bscp\s|\bnc\b.*\s-e\b|\bbase64\b.*\|\s*curl\b"),
    _rule("privilege_escalation", "high", "Agent attempted privilege escalation",
          r"\bsudo\b|\bchmod\s+777\b|\bchown\s+root\b"),
    _rule("persistence", "high", "Agent attempted persistence",
          r"\bcrontab\b|\blaunchctl\b|\bschtasks\b|\breg\s+add\b|\bsystemctl\s+enable\b"),
    # `env` only as a command: not `.env`, `$env`, `os.env`, or a variable being assigned.
    _rule("recon", "medium", "Agent ran reconnaissance commands",
          r"\bwhoami\b|\bprintenv\b|(?<![\w./$-])env\b(?!\s*[=.\[(])|\bifconfig\b|\bipconfig\b|\bnet\s+user\b"),
)

# Most severe first: the first match decides the title and severity.
PATH_RULES: tuple[Rule, ...] = (
    _rule("sensitive_file_read", "critical", "Agent read a private SSH key",
          r"(?<![\w-])id_(?:rsa|ed25519|ecdsa|dsa)\b(?!\.pub)", 0),
    _rule("sensitive_file_read", "critical", "Agent read system password hashes",
          r"/etc/shadow\b|\\config\\SAM\b", 0),
    _rule("sensitive_file_read", "high", "Agent read a credentials file",
          r"\.aws/credentials\b|\.kube/config\b|\.git-credentials\b|\.npmrc\b|\.docker/config\.json\b", 0),
    _rule("sensitive_file_read", "high", "Agent read a sensitive file",
          r"~/\.ssh/(?!\S*\.pub\b)|/\.ssh/(?!\S*\.pub\b)|/etc/passwd\b|\bLogin Data\b|\bCookies\b"
          r"|(?<![\w-])\.env(?!\.(?:example|sample|template)\b)(?:\.\w+)?(?![\w-])", 0),
)

UNVERIFIED_TOOL_CALL = Rule(id="unverified_tool_call", type="agent_action", regex=None, severity="medium",
                            title="Unverified dangerous tool call", detector="heuristic", confidence=0.8)
AUTONOMOUS_LOOP = Rule(id="autonomous_loop", type="agent_action", regex=None, severity="medium",
                       title="Autonomous agent loop detected", detector="anomaly", confidence=0.85)
LOOP_MIN_ROUND_TRIPS = 3

# First match wins, so the narrow names come before `exec`, which `execute_code` also contains.
TOOL_KINDS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (kind, re.compile(pattern, re.IGNORECASE)) for kind, pattern in (
        ("file_write", r"write_file|file_write|fs_write|save_file|create_file|edit_file|delete"),
        ("file_read", r"read_file|file_read|fs_read|list_dir|open_file"),
        ("code_exec", r"python_repl|code_interpreter|execute_code|run_code|run_python"),
        ("shell_exec", r"shell|bash|terminal|run_command|execute|exec|subprocess|powershell|cmd"),
        ("http_request", r"http|fetch|curl|request|browser|web|url"),
    )
)
PERMISSION_TOOLS: dict[str, re.Pattern[str]] = {
    name: re.compile(pattern, re.IGNORECASE) for name, pattern in {
        "shell": r"shell|bash|terminal|run_command|powershell|cmd|subprocess",
        "filesystem_read": r"read_file|file_read|fs_read|list_dir",
        "filesystem_write": r"write_file|file_write|fs_write|delete",
        "network": r"http|fetch|curl|request|browser|web",
        "internal_api": r"internal|admin",
        "code_exec": r"python_repl|code_interpreter|exec",
    }.items()
}

# First match wins. CrewAI and AutoGPT prompts borrow ReAct's words, so they come before LangChain.
FRAMEWORK_MARKERS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (framework, re.compile(pattern, re.IGNORECASE | re.MULTILINE)) for framework, pattern in (
        ("crewai", r"\bcrewai\b|your personal goal is"),
        ("autogpt", r"\bauto-?gpt\b|\"command\"\s*:\s*\{\s*\"name\""),
        ("claude_code", r"\bclaude code\b"),
        ("aider", r"\baider\b"),
        ("open_interpreter", r"\bopen interpreter\b"),
        ("langchain", r"\blangchain\b|\blanggraph\b|^\s*Action Input:|^\s*Thought:"),
    )
)

REACT_STEP = re.compile(
    r"^[ \t]*Action:[ \t]*(?P<tool>[^\n]*?)[ \t]*\n+[ \t]*Action Input:[ \t]*(?P<input>.*?)"
    r"(?=\n[ \t]*(?:Observation|Thought|Action|Final Answer)[ \t]*:|\Z)",
    re.MULTILINE | re.DOTALL,
)
REACT_OBSERVATION = re.compile(
    r"^[ \t]*Observation:[ \t]*(?P<result>.*?)(?=\n[ \t]*(?:Thought|Action|Final Answer)[ \t]*:|\Z)",
    re.MULTILINE | re.DOTALL,
)
REACT_TOOL_NAME = re.compile(r"[\w.-]+")
REACT_TOOL_LIST = re.compile(r"\bone of \[([^\]\n]*)\]")
