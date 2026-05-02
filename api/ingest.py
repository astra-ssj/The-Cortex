# api/ingest.py — Re-export only; canonical routes live in app.api.v1.ingest (mounted via v1_router in api.main).

from __future__ import annotations

from app.api.v1.ingest import router

__all__ = ["router"]
