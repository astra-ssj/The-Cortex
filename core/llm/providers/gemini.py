# core/llm/providers/gemini.py — Google Gemini provider (gemini-4-argon with thinking_level & context caching).

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Optional

import httpx
import structlog
from pydantic import BaseModel

from core.llm.config import gemini_config, llm_timeout_seconds
from core.llm.types import StructuredCompletionRequest, StructuredCompletionResult

logger = structlog.get_logger()

_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


def _extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", stripped)
    if fence:
        stripped = fence.group(1).strip()
    return json.loads(stripped)


class GeminiLLMProvider:
    """
    First-class Gemini 4 Argon provider with:
    - Structured JSON schema enforcement via responseSchema and responseMimeType
    - Configurable thinking_level ('low', 'medium', 'high')
    - Context caching for heavy regulatory compliance skills
    """

    provider_id = "gemini"

    def __init__(self) -> None:
        key, model, thinking_level = gemini_config()
        self._api_key = key
        self._model = model or "gemini-4-argon"
        self._thinking_level = thinking_level or "high"
        # In-memory registry of cached content handles (skill_id / content_hash -> cache metadata)
        self._context_cache: dict[str, dict[str, Any]] = {}

    def is_configured(self) -> bool:
        key, _, _ = gemini_config()
        effective_key = key or self._api_key
        return bool(effective_key and effective_key.strip())

    def get_or_create_context_cache(self, cache_key: str, content: str) -> str:
        """
        Register a cached context for large compliance skill references.
        Returns a cache handle used in complete_structured requests.
        """
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
        handle = f"cachedContents/{cache_key}-{digest}"
        self._context_cache[cache_key] = {
            "name": handle,
            "digest": digest,
            "char_count": len(content),
        }
        logger.info("gemini_context_cache_registered", cache_key=cache_key, handle=handle)
        return handle

    async def complete_structured(
        self,
        request: StructuredCompletionRequest,
        response_model: type[BaseModel],
    ) -> StructuredCompletionResult:
        if not self.is_configured():
            raise RuntimeError("Gemini provider is not configured (set GEMINI_API_KEY)")

        schema = response_model.model_json_schema()
        thinking_level = request.metadata.get("thinking_level", self._thinking_level)
        if thinking_level not in ("low", "medium", "high"):
            thinking_level = "high"

        generation_config: dict[str, Any] = {
            "responseMimeType": "application/json",
            "responseSchema": schema,
            "temperature": request.temperature,
            "maxOutputTokens": request.max_tokens,
            "thinkingConfig": {
                "thinkingLevel": thinking_level,
            },
        }

        body: dict[str, Any] = {
            "contents": [
                {"role": "user", "parts": [{"text": request.user}]}
            ],
            "generationConfig": generation_config,
        }

        if request.system:
            body["systemInstruction"] = {
                "parts": [{"text": request.system}]
            }

        # Context caching integration: if cached_content_handle or skill_id provided
        cached_handle = request.metadata.get("cached_content_handle")
        skill_id = request.metadata.get("skill_id")
        if not cached_handle and skill_id and skill_id in self._context_cache:
            cached_handle = self._context_cache[skill_id]["name"]

        if cached_handle:
            body["cachedContent"] = cached_handle

        url = f"{_GEMINI_API_BASE}/models/{self._model}:generateContent"
        headers = {
            "x-goog-api-key": self._api_key or "",
            "Content-Type": "application/json",
        }

        timeout = httpx.Timeout(llm_timeout_seconds())
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(url, headers=headers, json=body)

        if res.status_code >= 400:
            logger.warning(
                "gemini_api_error",
                status=res.status_code,
                body_preview=res.text[:500],
            )
            res.raise_for_status()

        data = res.json()
        candidates = data.get("candidates") or []
        if not candidates:
            raise RuntimeError(f"Gemini returned no candidates: {data}")

        parts = candidates[0].get("content", {}).get("parts", [])
        raw_text = "".join(p.get("text", "") for p in parts).strip()
        parsed = _extract_json_object(raw_text)
        validated = response_model.model_validate(parsed)

        usage_meta = data.get("usageMetadata") or {}
        return StructuredCompletionResult(
            provider_id=self.provider_id,
            model=str(data.get("modelVersion") or self._model),
            raw_text=validated.model_dump_json(),
            usage={
                "input_tokens": int(usage_meta.get("promptTokenCount") or 0),
                "output_tokens": int(usage_meta.get("candidatesTokenCount") or 0),
                "cached_tokens": int(usage_meta.get("cachedContentTokenCount") or 0),
            },
        )

    def status(self) -> dict[str, Any]:
        return {
            "provider": self.provider_id,
            "configured": self.is_configured(),
            "model": self._model if self.is_configured() else None,
            "thinking_level": self._thinking_level,
            "cached_contexts_count": len(self._context_cache),
        }
