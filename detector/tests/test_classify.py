"""classify_process: master §7 signatures, matching the semantics of Part A's fallback."""
import pytest

from shadowscope_detect import classify_process


@pytest.mark.parametrize("name,framework,category", [
    ("Cursor", "cursor", "ai_coding"), ("Cursor Helper", "cursor", "ai_coding"),
    ("Cursor Helper (Renderer)", "cursor", "ai_coding"), ("Windsurf", None, "ai_coding"),
    ("aider", "aider", "ai_coding"), ("goose", "custom", "ai_coding"),
    ("interpreter", "open_interpreter", "ai_coding"), ("ollama", None, "local_llm"),
    ("LM Studio", None, "local_llm"), ("Jan", None, "local_llm"), ("gpt4all", None, "local_llm"),
    ("ChatGPT", None, "ai_saas"), ("Claude", None, "ai_saas"), ("claude", "claude_code", "ai_coding"),
    ("ollama.exe", None, "local_llm"), ("Cursor.exe", "cursor", "ai_coding"),
    ("/usr/local/bin/ollama", None, "local_llm"), ("C:\\Program Files\\Cursor\\Cursor.exe", "cursor", "ai_coding"),
])
def test_known_process_names(name, framework, category):
    result = classify_process(name, None)
    assert result == {"is_ai_tool": True, "framework": framework, "category": category, "confidence": 0.95}


@pytest.mark.parametrize("name,cmdline,framework", [
    ("python3", ["python3", "my_langchain_app.py"], "langchain"), ("python", ["app.py", "--use-langgraph"], "langchain"),
    ("python3.11", ["-m", "autogpt"], "autogpt"), ("node", ["crewai-runner.js"], "crewai"),
    ("python", ["llama_index_demo.py"], "custom"), ("python3", ["openai", "api", "chat"], "custom"),
    ("node", ["anthropic", "--help"], "custom"), ("python3", ["rogue_agent.py"], "custom"),
    ("Python", ["agent.py"], "custom"), ("node.exe", ["my-agent/index.js"], "custom"),
])
def test_runtime_with_ai_cmdline(name, cmdline, framework):
    result = classify_process(name, cmdline)
    assert result["is_ai_tool"] and result["framework"] == framework
    assert result["category"] == "cloud_llm" and result["confidence"] == 0.7


@pytest.mark.parametrize("name,cmdline", [
    ("python3", ["manage.py", "runserver"]), ("python3", None), ("node", ["server.js"]), ("node", []),
    ("python3", ["fetch.py", "--user-agent", "Mozilla"]), ("node", ["ssh-agent-proxy.js"]),
    ("python", ["reagent_inventory.py"]), ("python", ["agents_of_change.py"]),
    ("Safari", None), ("bash", ["langchain"]), ("Code Helper (Plugin)", None), ("", None), ("janitor", None),
])
def test_everything_else_is_not_an_ai_tool(name, cmdline):
    assert classify_process(name, cmdline) == {"is_ai_tool": False, "framework": None, "category": None,
                                               "confidence": 0.0}
