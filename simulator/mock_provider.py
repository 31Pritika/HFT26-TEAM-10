"""Fake AI provider on 127.0.0.1:8788, speaking the OpenAI, Anthropic and Ollama wire formats.

Stateless on purpose: the step of a tool-calling agent comes from the tool calls already in its history. `reply_for` is
plain Python with no server, so dry runs show the same replies. FastAPI is only imported to serve them.
"""
from __future__ import annotations

import json
import zlib

from .fakes import ROGUE_PLAN

HOST = "127.0.0.1"
PORT = 8788
_CREATED = 1790000000   # a fixed timestamp keeps replies, and so the sample files, reproducible
_REPLIES = (
    "Happy to help. The configuration looks mostly fine, but check that the variable names match what the app reads.",
    "Here is a cleaned-up version of what you shared, with the duplicate rows removed and the columns normalised.",
    "I reviewed the module. The structure is reasonable. I would split the pricing logic out and add unit tests.",
    "Noted. I summarised the key points and listed three follow-up actions for the team.",
)


def _text_reply(body: dict) -> str:
    return _REPLIES[zlib.crc32(json.dumps(body, sort_keys=True, default=str).encode()) % len(_REPLIES)]


def _next_step(messages: list) -> tuple[int, str, dict] | None:
    made = 0
    for message in messages:
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        blocks = content if isinstance(content, list) else []
        made += len(message.get("tool_calls") or [])
        made += sum(isinstance(block, dict) and block.get("type") == "tool_use" for block in blocks)
    return (made, *ROGUE_PLAN[made]) if made < len(ROGUE_PLAN) else None


def _openai_reply(body: dict) -> dict:
    step = _next_step(body.get("messages") or []) if body.get("tools") else None
    message: dict = {"role": "assistant", "content": _text_reply(body) if step is None else None}
    if step:
        index, name, arguments = step
        message["tool_calls"] = [{"id": f"call_{index}", "type": "function",
                                  "function": {"name": name, "arguments": json.dumps(arguments)}}]
    return {"id": "chatcmpl-mock", "object": "chat.completion", "created": _CREATED,
            "model": body.get("model", "gpt-4o"),
            "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls" if step else "stop"}],
            "usage": {"prompt_tokens": 42, "completion_tokens": 21, "total_tokens": 63}}


def _anthropic_reply(body: dict) -> dict:
    step = _next_step(body.get("messages") or []) if body.get("tools") else None
    content = [{"type": "text", "text": _text_reply(body)}] if step is None else [
        {"type": "tool_use", "id": f"toolu_{step[0]}", "name": step[1], "input": step[2]}]
    return {"id": "msg_mock", "type": "message", "role": "assistant", "model": body.get("model", "claude-sonnet-5-5"),
            "content": content, "stop_reason": "tool_use" if step else "end_turn",
            "usage": {"input_tokens": 42, "output_tokens": 21}}


def _ollama_chat_reply(body: dict) -> dict:
    step = _next_step(body.get("messages") or []) if body.get("tools") else None
    message: dict = {"role": "assistant", "content": "" if step else _text_reply(body)}
    if step:
        message["tool_calls"] = [{"function": {"name": step[1], "arguments": step[2]}}]
    return {"model": body.get("model", "llama3.2:3b"), "message": message, "done": True}


def _ollama_generate_reply(body: dict) -> dict:
    return {"model": body.get("model", "llama3.2:3b"), "response": _text_reply(body), "done": True}


ROUTES = {"/v1/chat/completions": _openai_reply, "/v1/messages": _anthropic_reply, "/api/chat": _ollama_chat_reply,
          "/api/generate": _ollama_generate_reply}


def reply_for(path: str, body: dict) -> dict:
    return ROUTES[path](body)


def build_app():
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    app = FastAPI(title="ShadowScope Mock Provider")

    async def handle(request) -> JSONResponse:
        try:
            body = await request.json()
        except ValueError:
            body = None
        if not isinstance(body, dict):
            return JSONResponse({"error": {"message": "Body must be a JSON object"}}, status_code=400)
        return JSONResponse(reply_for(request.url.path, body))

    for path in ROUTES:
        app.add_route(path, handle, methods=["POST"])
    app.add_api_route("/health", lambda: {"status": "ok"}, methods=["GET"])
    return app


def main() -> None:
    import uvicorn
    uvicorn.run(build_app(), host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
