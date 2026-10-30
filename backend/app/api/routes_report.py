from __future__ import annotations

import csv
import io
import json
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import Response

from .. import db
from ..engine.compliance import build_report
from ..models import ComplianceReport
from ..utils import to_iso, window_start
from .routes_overview import Window

router = APIRouter()
CSV_COLUMNS = ("id", "ts", "severity", "type", "subtype", "status", "confidence", "title", "description", "provider_id", "process_name",
               "event_id", "match_redacted", "redacted_snippet", "compliance", "remediation")
PAGE_SIZE = 500


def _csv_cell(value: object) -> str:
    """Spreadsheets run cells starting with these characters as formulas, and this text comes from captured traffic."""
    text = "" if value is None else str(value)
    return f"'{text}" if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def _findings_csv(window: str) -> str:
    since = to_iso(window_start(window))
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_COLUMNS)
    cursor = None
    while True:
        items, cursor = db.list_findings(PAGE_SIZE, cursor)
        for finding in items:
            if finding["ts"] < since:
                return buffer.getvalue()
            row = {**finding, **finding["evidence"], "compliance": " ".join(finding["compliance"]), "remediation": "; ".join(finding["remediation"])}
            writer.writerow([_csv_cell(row[column]) for column in CSV_COLUMNS])
        if cursor is None:
            return buffer.getvalue()


@router.get("/report", response_model=ComplianceReport)
def report(window: Window = "7d") -> dict:
    return build_report(window)


@router.get("/report/export")
def report_export(format: Literal["json", "csv"] = "json", window: Window = "7d") -> Response:
    content = _findings_csv(window) if format == "csv" else json.dumps(build_report(window), indent=2, ensure_ascii=False)
    media_type = "text/csv" if format == "csv" else "application/json"
    headers = {"Content-Disposition": f'attachment; filename="shadowscope-report.{format}"'}
    return Response(content, media_type=media_type, headers=headers)
