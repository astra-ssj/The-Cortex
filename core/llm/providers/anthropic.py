# core/llm/providers/anthropic.py — Anthropic Messages API (httpx, no extra SDK).

from __future__ import annotations

import json
import re
from typing import Any

import httpx
import structlog
from pydantic import BaseModel

from core.llm.config import anthropic_config, llm_timeout_seconds
from core.llm.types import StructuredCompletionRequest, StructuredCompletionResult

logger = structlog.get_logger()

_ANTHROPIC_API = "https://api.anthropic.com/v1/messages"
_API_VERSION = "2023-06-01"


def _extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", stripped)
    if fence:
        stripped = fence.group(1).strip()
    return json.loads(stripped)


class AnthropicLLMProvider:
    provider_id = "anthropic"

    def __init__(self) -> None:
        self._api_key, self._model = anthropic_config()

    def is_configured(self) -> bool:
        return bool(self._api_key and self._api_key.strip())

    async def complete_structured(
        self,
        request: StructuredCompletionRequest,
        response_model: type[BaseModel],
    ) -> StructuredCompletionResult:
        if not self.is_configured():
            raise RuntimeError("Anthropic provider is not configured (set ANTHROPIC_API_KEY)")

        schema = response_model.model_json_schema()
        system = (
            f"{request.system}\n\n"
            "Respond with a single JSON object only (no markdown fences) matching this JSON Schema:\n"
            f"{json.dumps(schema, indent=2)}"
        )
        body = {
            "model": self._model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "system": system,
            "messages": [{"role": "user", "content": request.user}],
        }
        headers = {
            "x-api-key": self._api_key or "",
            "anthropic-version": _API_VERSION,
            "content-type": "application/json",
        }
        timeout = httpx.Timeout(llm_timeout_seconds())
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(_ANTHROPIC_API, headers=headers, json=body)
        if res.status_code >= 400:
            logger.warning(
                "anthropic_api_error",
                status=res.status_code,
                body_preview=res.text[:500],
            )
            res.raise_for_status()

        data = res.json()
        blocks = data.get("content") or []
        text_parts = [b.get("text", "") for b in blocks if b.get("type") == "text"]
        raw_text = "\n".join(text_parts).strip()
        usage = data.get("usage") or {}
        parsed = _extract_json_object(raw_text)
        validated = response_model.model_validate(parsed)
        return StructuredCompletionResult(
            provider_id=self.provider_id,
            model=str(data.get("model") or self._model),
            raw_text=validated.model_dump_json(),
            usage={
                "input_tokens": int(usage.get("input_tokens") or 0),
                "output_tokens": int(usage.get("output_tokens") or 0),
            },
        )

    def status(self) -> dict[str, Any]:
        return {
            "provider": self.provider_id,
            "configured": self.is_configured(),
            "model": self._model if self.is_configured() else None,
        }
