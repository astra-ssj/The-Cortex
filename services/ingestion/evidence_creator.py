# services/ingestion/evidence_creator.py — re-exports core.ingestion (compat).

from __future__ import annotations

from core.ingestion.evidence_creator import content_hash, create_evidence_from_mapping

__all__ = ["content_hash", "create_evidence_from_mapping"]
