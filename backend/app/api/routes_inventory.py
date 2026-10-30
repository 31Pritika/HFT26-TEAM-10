"""Inventory, agents and providers."""
from __future__ import annotations

from fastapi import APIRouter

from .. import db
from ..engine import agents
from ..fingerprints import matcher
from ..models import AgentList, AgentSession, InventoryList
from .errors import not_found

router = APIRouter()


@router.get("/inventory", response_model=InventoryList)
def inventory() -> dict:
    return {"items": db.list_inventory()}


@router.get("/agents", response_model=AgentList)
def list_agents() -> dict:
    return {"items": agents.list_sessions()}


@router.get("/agents/{agent_id}", response_model=AgentSession)
def get_agent(agent_id: str) -> dict:
    session = agents.get_session(agent_id)
    if session is None:
        raise not_found("Agent", agent_id)
    return session


@router.get("/providers")
def providers() -> dict:
    return {"items": matcher.PROVIDERS}
