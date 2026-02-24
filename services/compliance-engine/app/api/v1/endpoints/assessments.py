# assessments — Minimal assessments stub (compliance-engine).

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()


@router.get("/run", summary="Run assessment (SSE)")
async def run_assessment():
    """Stub: return empty stream or redirect to root API."""
    async def stream():
        yield f"data: {json.dumps({'event': 'done', 'message': 'stub'})}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")
