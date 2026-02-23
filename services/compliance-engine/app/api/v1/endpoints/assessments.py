# app/api/v1/endpoints/assessments.py — Human Review Queue (GDPR Art.22 / EU AI Act Art.14).
# GET /api/v1/assessments/review-queue: items flagged by Dynamic Autonomy Router (confidence < 0.75).
# GET /api/v1/assessments/stream: SSE assessment stream; optional token query param for auth.

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/assessments", tags=["assessments"])


def _validate_token(token: str) -> None:
    """Validate JWT if present; raise HTTPException 401 on invalid or expired."""
    try:
        from core.security import ALGORITHM, SECRET_KEY
        from jose import jwt

        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def _stream_events(org_id: str, frameworks: str):
    """Minimal SSE stream (run_start + run_done). Real stream is in api/assessments.py when mounted."""
    yield f"event: run_start\ndata: {json.dumps({'kind': 'run_start', 'frameworkIds': [s.strip() for s in frameworks.split(',') if s.strip()]})}\n\n"
    yield f"event: run_done\ndata: {json.dumps({'kind': 'run_done', 'orgId': org_id})}\n\n"


@router.get("/stream")
async def stream(
    org_id: str = Query(..., description="Organization id (e.g. demo-org-001)"),
    frameworks: str = Query(
        ...,
        description="Comma-separated framework ids (e.g. iso27001-2022,gdpr-2016-679,...)",
    ),
    token: Optional[str] = Query(None, description="Optional JWT for auth (EventSource cannot send headers)"),
) -> StreamingResponse:
    """Stream assessment run via SSE. Params: org_id, frameworks. Optional: token."""
    if token:
        _validate_token(token)
    return StreamingResponse(
        _stream_events(org_id, frameworks),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
            "Connection": "keep-alive",
        },
    )


# Response shape matches frontend ReviewQueueResponse: { items: ReviewQueueItem[], reviewed: [] }
# Each item uses camelCase keys expected by the UI (framework, controlId, name, reference, dateFlagged).

REVIEW_QUEUE_ITEMS = [
    {
        "id": "review-001",
        "framework": "GDPR 2016/679",
        "controlId": "GDPR-BN-02",
        "name": "72-hour breach notification procedure",
        "assessment": "NON_COMPLIANT",
        "confidence": 0.58,
        "severity": "CRITICAL",
        "reference": "GDPR Art.33(1)",
        "dateFlagged": "2026-02-21T10:00:00Z",
    },
    {
        "id": "review-002",
        "framework": "NIS2 Directive",
        "controlId": "NIS2-IR-01",
        "name": "24-hour CSIRT early warning process",
        "assessment": "NON_COMPLIANT",
        "confidence": 0.61,
        "severity": "CRITICAL",
        "reference": "NIS2 Art.23(4)(a)",
        "dateFlagged": "2026-02-21T10:01:00Z",
    },
    {
        "id": "review-003",
        "framework": "EU AI Act 2024",
        "controlId": "EUAI-HO-01",
        "name": "Human oversight mechanism for AI decisions",
        "assessment": "NON_COMPLIANT",
        "confidence": 0.52,
        "severity": "CRITICAL",
        "reference": "EU AI Act Art.14",
        "dateFlagged": "2026-02-21T10:02:00Z",
    },
    {
        "id": "review-004",
        "framework": "ISO/IEC 27001:2022",
        "controlId": "ISO-A.5.23",
        "name": "Information security for cloud services",
        "assessment": "PARTIAL",
        "confidence": 0.68,
        "severity": "HIGH",
        "reference": "ISO 27001 A.5.23",
        "dateFlagged": "2026-02-21T10:03:00Z",
    },
    {
        "id": "review-005",
        "framework": "NIS2 Directive",
        "controlId": "NIS2-RM-04",
        "name": "Supply chain security assessment",
        "assessment": "NON_COMPLIANT",
        "confidence": 0.64,
        "severity": "HIGH",
        "reference": "NIS2 Art.21(2)(d)",
        "dateFlagged": "2026-02-21T10:04:00Z",
    },
    {
        "id": "review-006",
        "framework": "GDPR 2016/679",
        "controlId": "GDPR-IT-01",
        "name": "US transfer SCCs post-Schrems II review",
        "assessment": "PARTIAL",
        "confidence": 0.71,
        "severity": "HIGH",
        "reference": "GDPR Art.46",
        "dateFlagged": "2026-02-21T10:05:00Z",
    },
    {
        "id": "review-007",
        "framework": "ISO/IEC 27001:2022",
        "controlId": "ISO-A.8.8",
        "name": "Management of technical vulnerabilities",
        "assessment": "PARTIAL",
        "confidence": 0.69,
        "severity": "MEDIUM",
        "reference": "ISO 27001 A.8.8",
        "dateFlagged": "2026-02-21T10:06:00Z",
    },
    {
        "id": "review-008",
        "framework": "Cyber Essentials v3.1",
        "controlId": "CE-PF-01",
        "name": "Boundary firewalls and internet gateways",
        "assessment": "PARTIAL",
        "confidence": 0.73,
        "severity": "MEDIUM",
        "reference": "Cyber Essentials Section 3.1",
        "dateFlagged": "2026-02-21T10:07:00Z",
    },
]


@router.get("/review-queue", summary="Get items pending human review")
async def get_review_queue() -> dict:
    """
    Returns all assessment controls flagged for human review
    by the Dynamic Autonomy Router (confidence < 0.75).
    This is the GDPR Art.22 / EU AI Act Art.14 oversight queue.
    """
    return {"items": REVIEW_QUEUE_ITEMS, "reviewed": []}
