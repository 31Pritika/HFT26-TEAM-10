from __future__ import annotations

from fastapi import APIRouter

from .. import db, pipeline
from ..models import Policy, PolicyUpdate

router = APIRouter()


@router.get("/policies", response_model=Policy)
def get_policies() -> dict:
    return db.get_policy()


@router.put("/policies", response_model=Policy)
def update_policies(body: PolicyUpdate) -> dict:
    changes = {key: value for key, value in body.model_dump(exclude_unset=True).items() if value is not None}
    policy = Policy.model_validate({**db.get_policy(), **changes}).model_dump()
    db.set_policy(policy)
    pipeline.refresh_inventory(policy)
    return policy
