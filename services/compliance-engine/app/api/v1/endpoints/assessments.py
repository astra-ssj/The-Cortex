# assessments — Minimal assessments stub (compliance-engine).
#
# Production SSE assessments (with GRC skill metadata per control) are served by
# api/assessments.py → services.assessment_engine.run_assessment_stream, which
# attaches skill_id / citation_format via app.core.skills_loader.

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
