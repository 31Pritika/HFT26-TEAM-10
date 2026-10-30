"""Mock provider: all four routes, each wire format, the stateless tool plan."""
import json

import pytest
from fastapi.testclient import TestClient

from shadowscope_detect import analyze_agent_payload
from simulator import fakes, mock_provider
from simulator.mock_provider import ROUTES, build_app, reply_for

TOOLS = [{"type": "function", "function": {"name": "shell"}}]
client = TestClient(build_app())


@pytest.mark.parametrize("path", sorted(ROUTES))
def test_every_route_answers(path):
    response = client.post(path, json={"messages": [{"role": "user", "content": "hi"}], "prompt": "hi"})
    assert response.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("body", ["not json", "[1, 2]"])
def test_bad_bodies_are_rejected_not_crashed(body):
    assert client.post("/v1/chat/completions", content=body).status_code == 400


def test_binds_to_loopback_only():
    assert mock_provider.HOST == "127.0.0.1" and mock_provider.PORT == 8788


def test_openai_text_reply():
    message = reply_for("/v1/chat/completions", {"messages": [{"role": "user", "content": "hi"}]})["choices"][0]["message"]
    assert message["content"] and "tool_calls" not in message


def test_anthropic_text_reply():
    assert reply_for("/v1/messages", {"messages": []})["content"][0]["type"] == "text"


def test_ollama_replies():
    assert reply_for("/api/chat", {"messages": []})["message"]["content"]
    assert reply_for("/api/generate", {"prompt": "x"})["response"]


def test_replies_are_not_echoes_of_the_prompt():
    assert fakes.AWS_ACCESS_KEY not in json.dumps(reply_for("/v1/chat/completions", {"messages": [
        {"role": "user", "content": fakes.env_file()}]}))


def test_openai_tool_call_formats_are_analyzable():
    reply = reply_for("/v1/chat/completions", {"tools": TOOLS, "messages": []})
    assert analyze_agent_payload(reply, direction="response")["actions"][0]["tool_name"] == fakes.ROGUE_PLAN[0][0]


def test_anthropic_tool_call_formats_are_analyzable():
    reply = reply_for("/v1/messages", {"tools": [{"name": "shell"}], "messages": []})
    assert reply["stop_reason"] == "tool_use"
    assert analyze_agent_payload(reply, direction="response")["actions"][0]["tool_name"] == fakes.ROGUE_PLAN[0][0]


def test_ollama_tool_call_formats_are_analyzable():
    reply = reply_for("/api/chat", {"tools": TOOLS, "messages": []})
    assert analyze_agent_payload(reply, direction="response")["actions"][0]["tool_name"] == fakes.ROGUE_PLAN[0][0]


def test_the_plan_advances_with_history_and_then_stops():
    messages, names = [], []
    while True:
        message = reply_for("/v1/chat/completions", {"tools": TOOLS, "messages": messages})["choices"][0]["message"]
        if "tool_calls" not in message:
            break
        names.append(message["tool_calls"][0]["function"]["name"])
        messages += [message, {"role": "tool", "content": "ok"}]
    assert names == [name for name, _ in fakes.ROGUE_PLAN]
    assert message["content"]


def test_anthropic_plan_counts_tool_use_blocks():
    first = reply_for("/v1/messages", {"tools": [{"name": "x"}], "messages": []})
    second = reply_for("/v1/messages", {"tools": [{"name": "x"}], "messages": [{"role": "assistant", "content": first["content"]}]})
    assert second["content"][0]["name"] == fakes.ROGUE_PLAN[1][0]


def test_requests_without_tools_never_get_tool_calls():
    assert "tool_calls" not in reply_for("/api/chat", {"messages": []})["message"]
