from __future__ import annotations

from typing import Literal

from fastapi import APIRouter

from ..engine.overview import build_graph, build_overview
from ..models import GraphData, Overview

router = APIRouter()
Window = Literal["1h", "6h", "24h", "7d"]


@router.get("/overview", response_model=Overview)
def overview(window: Window = "24h") -> dict:
    return build_overview(window)


@router.get("/graph", response_model=GraphData)
def graph(window: Window = "24h") -> dict:
    return build_graph(window)
