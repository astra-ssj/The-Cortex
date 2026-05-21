# core/llm/providers/openai.py — OpenAI Chat Completions (httpx).

from __future__ import annotations

import json
import re
from typing import Any

import httpx
import structlog
from pydantic import BaseModel

from core.llm.config import llm_timeout_seconds, openai_config
from core.llm.types import StructuredCompletionRequest, StructuredCompletionResult

logger = structlog.get_logger()

_OPENAI_API = "https://api.openai.com/v1/chat/completions"


def _extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", stripped)
    if fence:
        stripped = fence.group(1).strip()
    return json.loads(stripped)


class OpenAILLMProvider:
    provider_id = "openai"

    def __init__(self) -> None:
        self._api_key, self._model = openai_config()

    def is_configured(self) -> bool:
        return bool(self._api_key and self._api_key.strip())

    async def complete_structured(
        self,
        request: StructuredCompletionRequest,
        response_model: type[BaseModel],
    ) -> StructuredCompletionResult:
        if not self.is_configured():
            raise RuntimeError("OpenAI provider is not configured (set OPENAI_API_KEY)")

        schema = response_model.model_json_schema()
        system = (
            f"{request.system}\n\n"
            "Respond with a single JSON object only matching this JSON Schema:\n"
            f"{json.dumps(schema, indent=2)}"
        )
        body = {
            "model": self._model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": request.user},
            ],
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        timeout = httpx.Timeout(llm_timeout_seconds())
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(_OPENAI_API, headers=headers, json=body)
        if res.status_code >= 400:
            logger.warning("openai_api_error", status=res.status_code, body_preview=res.text[:500])
            res.raise_for_status()

        data = res.json()
        choices = data.get("choices") or []
        raw_text = ""
        if choices:
            raw_text = str((choices[0].get("message") or {}).get("content") or "")
        usage = data.get("usage") or {}
        parsed = _extract_json_object(raw_text)
        validated = response_model.model_validate(parsed)
        return StructuredCompletionResult(
            provider_id=self.provider_id,
            model=str(data.get("model") or self._model),
            raw_text=validated.model_dump_json(),
            usage={
                "input_tokens": int(usage.get("prompt_tokens") or 0),
                "output_tokens": int(usage.get("completion_tokens") or 0),
            },
        )

    def status(self) -> dict[str, Any]:
        return {
            "provider": self.provider_id,
            "configured": self.is_configured(),
            "model": self._model if self.is_configured() else None,
        }
