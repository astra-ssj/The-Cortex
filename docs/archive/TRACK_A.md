# Track A — Real LLM assessments (complete)

Track A wires **per-control compliance assessment** through the same multi-provider LLM gateway as ingest (`core/llm`), behind the **`assessment_llm` CircuitBreaker**, with human review when confidence &lt; 0.75.

> **Naming:** In early planning, “Track A” referred to ingest LLM; that shipped as [TRACK_B.md](./TRACK_B.md). This document is **assessment LLM**.

## Delivered

| Component | Location |
|-----------|----------|
| Assessment schema + prompts | `core/llm/assessment_schema.py`, `assessment_prompt.py` |
| Assessment service | `core/assessment_llm.py` |
| Stream integration | `core/assessment_engine.py` |
| Human review enqueue | `core/human_review.py` → `human_review_pending` |
| Ops metadata | `GET /api/v1/system/llm-providers` (`assessment_llm_enabled`, `assessment_max_controls_per_run`) |
| UI | `assessmentLlmLive` flag, TopBar **LLM: Anthropic**, stream shows confidence + provider |
| Compose defaults | `CORTEX_ASSESSMENT_MAX_CONTROLS=5` (demo cap; set `0` for unlimited) |

## Flow

1. User runs assessment (Dashboard → **Run Assessment**).
2. SSE stream: `control_context` → LLM assesses each control → `control_result` (with `confidence`, `llm_provider`).
3. Low confidence (&lt; 0.75) → row in **Review Queue**.
4. On LLM failure → demo finding fallback (logged to audit).

## Configuration

```bash
# .env
CORTEX_ASSESSMENT_LLM_ENABLED=1          # 0 = demo findings only
CORTEX_ASSESSMENT_MAX_CONTROLS=0         # 0 = unlimited; 5 = default in docker-compose
CORTEX_LLM_PROVIDERS=anthropic,stub
ANTHROPIC_API_KEY=sk-ant-...
```

Rebuild API after changes: `docker compose up -d --build api`

## Verify

```bash
pytest tests/test_assessment_llm.py tests/test_assessment_engine.py -q
bash scripts/smoke_assessment_llm.sh
```

## Related

- [LLM_PROVIDERS.md](./LLM_PROVIDERS.md) — provider chain
- [RBAC.md](./RBAC.md) — `run_assessment` permission
