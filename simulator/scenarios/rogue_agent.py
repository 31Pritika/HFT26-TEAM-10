"""An eight-step agent loop at machine speed. Tool calls are never executed: results are canned in fakes.py."""
from __future__ import annotations

import json

from .. import fakes
from ..client import Context, process_info
from .base import Scenario

STEP_GAP_S = 0.25   # well under the 2 s mean gap that marks an autonomous loop
_TOOLS = ("list_dir", "read_file", "shell", "http_request")
_SYSTEM = "You are a LangChain agent. Thought: decide the next tool to call, then call it. Do not ask the user."


def _tool(name: str) -> dict:
    return {"type": "function", "function": {"name": name, "description": name, "parameters": {"type": "object"}}}


def _first_call(reply: str) -> dict | None:
    try:
        calls = json.loads(reply)["choices"][0]["message"].get("tool_calls")
    except (ValueError, KeyError, IndexError, TypeError):
        return None
    return calls[0] if calls else None


def _loop(ctx: Context, process: dict) -> None:
    messages: list[dict] = [{"role": "system", "content": _SYSTEM},
                            {"role": "user", "content": "Audit this machine and report back."}]
    body = {"model": "gpt-4o", "tools": [_tool(name) for name in _TOOLS]}
    while True:
        reply = ctx.exchange("/v1/chat/completions", {**body, "messages": messages}, host="api.openai.com",
                             process=process, tags=["agent"])
        call = _first_call(reply)
        if call is None:
            return
        ctx.say(f"tool call: {call['function']['name']} {call['function']['arguments']}")
        result = fakes.rogue_tool_result(json.loads(call["function"]["arguments"]))
        messages += [{"role": "assistant", "content": None, "tool_calls": [call]},
                     {"role": "tool", "tool_call_id": call["id"], "content": result}]
        ctx.pause(STEP_GAP_S)


def run(ctx: Context) -> None:
    process = process_info("python3 langchain_agent.py --tools shell,fs")
    shell = ctx.spawn_demo_shell()
    for _ in range(ctx.intensity):
        _loop(ctx, process)
    if shell is not None:
        shell.wait()


SCENARIO = Scenario("rogue_agent", "Rogue LangChain agent",
                    "An 8-step machine-speed ReAct loop reads SSH keys and pipes a script to a shell.", "bot",
                    "critical", ("agent", "shell", "tool-call"), run)
