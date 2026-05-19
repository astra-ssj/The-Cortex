# api/errors.py — Standard JSON error envelope and exception handlers.

from __future__ import annotations

from typing import Any

import structlog
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import InterfaceError, OperationalError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = structlog.get_logger()


def error_body(code: str, message: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message}}


def json_error(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=error_body(code, message))


_STATUS_CODES: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    422: "VALIDATION_ERROR",
    429: "TOO_MANY_REQUESTS",
    501: "NOT_IMPLEMENTED",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
}


def _http_error_code(status: int) -> str:
    return _STATUS_CODES.get(status, "HTTP_ERROR")


def _detail_to_message(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        parts: list[str] = []
        for item in detail:
            if isinstance(item, dict):
                loc = item.get("loc", ())
                msg = item.get("msg", "")
                loc_s = ".".join(str(x) for x in loc) if loc else ""
                piece = f"{loc_s}: {msg}".strip(": ") if loc_s else str(msg)
                parts.append(piece)
            else:
                parts.append(str(item))
        return "; ".join(parts) if parts else "Request failed"
    if isinstance(detail, dict):
        return str(detail.get("message") or detail.get("detail") or detail)
    return str(detail)


async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Maps Starlette/FastAPI HTTPException (including FastAPI subclass) to the standard envelope."""
    msg = _detail_to_message(exc.detail)
    code = _http_error_code(exc.status_code)
    return json_error(code, msg, exc.status_code)


async def request_validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    parts: list[str] = []
    for e in exc.errors()[:16]:
        loc = ".".join(str(x) for x in e.get("loc", ()))
        msg = e.get("msg", "")
        piece = f"{loc}: {msg}".strip(": ") if loc else str(msg)
        parts.append(piece)
    message = "; ".join(parts) if parts else "Validation failed"
    return json_error("VALIDATION_ERROR", message, 422)


async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.warning("sqlalchemy_request_failed", path=request.url.path, error=str(exc))
    if isinstance(exc, (OperationalError, InterfaceError)):
        return json_error(
            "SERVICE_UNAVAILABLE",
            "Database is temporarily unavailable",
            503,
        )
    return json_error(
        "DATABASE_ERROR",
        "A database error occurred",
        500,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled_exception", path=request.url.path)
    return json_error(
        "INTERNAL_ERROR",
        "An unexpected error occurred",
        500,
    )
