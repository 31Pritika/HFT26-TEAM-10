from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import db, pipeline
from ..models import Policy, PolicyUpdate
from .errors import require_local_engine

router = APIRouter()


@router.get("/policies", response_model=Policy)
def get_policies() -> dict:
    return db.get_policy()


@router.put("/policies", response_model=Policy, dependencies=[Depends(require_local_engine)])
def update_policies(body: PolicyUpdate) -> dict:
    changes = {key: value for key, value in body.model_dump(exclude_unset=True).items() if value is not None}
    before = db.get_policy()
    policy = Policy.model_validate({**before, **changes}).model_dump()
    db.set_policy(policy)
    pipeline.apply_policy_change(before, policy)
    return policy
