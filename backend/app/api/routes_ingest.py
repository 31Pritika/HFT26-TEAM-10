from __future__ import annotations

from fastapi import APIRouter, File, UploadFile
from fastapi.concurrency import run_in_threadpool

from .. import config
from ..ingest import router as ingest_router
from ..ingest.types import IngestError
from ..models import IngestResult
from .errors import ApiError

router = APIRouter()


@router.post("/ingest", response_model=IngestResult)
async def ingest(file: UploadFile = File(...)) -> dict:
    data = await file.read(config.MAX_UPLOAD_BYTES + 1)
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise ApiError(413, f"Uploads are limited to {config.MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    try:
        return await run_in_threadpool(ingest_router.ingest, file.filename or "upload.log", data)
    except IngestError as error:
        raise ApiError(400, str(error), "invalid_file") from error
