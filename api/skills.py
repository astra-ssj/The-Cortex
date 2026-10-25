# skills — reviewed Astra practice catalogue.

from __future__ import annotations

from fastapi import APIRouter, Depends

from core.practice_catalog import PracticeCatalogEntry, get_practice_catalog
from core.security import get_current_user

router = APIRouter(tags=["skills"], dependencies=[Depends(get_current_user)])


@router.get(
    "/practices",
    response_model=list[PracticeCatalogEntry],
    summary="List reviewed Astra training practices",
)
def list_practices() -> list[PracticeCatalogEntry]:
    """Expose inert curriculum metadata; raw upstream instructions stay server-side."""
    return get_practice_catalog().list()
