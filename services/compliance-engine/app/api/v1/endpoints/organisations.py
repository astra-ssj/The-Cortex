# organisations — delegate posture to root api.organisations (single DB-backed implementation).

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_db
from api.organisations import get_organisation_posture
from core.security import get_current_user

router = APIRouter()


@router.get("/{org_id}/posture")
async def get_posture(
    org_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await get_organisation_posture(org_id, session, current_user)
