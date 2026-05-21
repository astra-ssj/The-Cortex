# LLM providers (multi-vendor)

CORTEX routes all structured LLM calls through `core/llm` — never call vendor APIs directly from feature code. Wrap feature calls in a module-level `CircuitBreaker` (see `ontology_mapper.py`).

## Supported providers

| Provider ID | Env | Default model |
|-------------|-----|----------------|
| `anthropic` | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` (default `claude-sonnet-4-20250514`) |
| `openai` | `OPENAI_API_KEY` | `OPENAI_MODEL` (default `gpt-4o-mini`) |
| `stub` | (always available) | deterministic JSON for CI / offline |

## Provider chain (fallback)

Set ordered fallback with:

```bash
export CORTEX_LLM_PROVIDERS=anthropic,openai,stub
```

Legacy single value still works:

```bash
export CORTEX_LLM_PROVIDER=anthropic
```

The router tries each **configured** provider in order; `stub` is appended automatically if not listed and nothing else is configured.

## Anthropic (recommended)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ANTHROPIC_MODEL=claude-sonnet-4-20250514
export CORTEX_LLM_PROVIDERS=anthropic,stub
```

Uses the [Messages API](https://docs.anthropic.com/en/api/messages) via `httpx` (no Anthropic SDK required).

## OpenAI (optional second vendor)

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini
export CORTEX_LLM_PROVIDERS=anthropic,openai,stub
```

## Docker Compose

The `api` service passes through LLM env vars from your shell or `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-... POSTGRES_PASSWORD=cortex-dev docker compose up -d --build api
```

Defaults: `CORTEX_LLM_PROVIDERS=anthropic,openai,stub` (stub used when keys are unset).

## Operations

- **Status:** `GET /api/v1/system/llm-providers` — chain order and which keys are set (no secrets).
- **Smoke:** `bash scripts/smoke_ingest_llm.sh`
- **Timeouts:** `CORTEX_LLM_TIMEOUT_SECONDS` (default `90`).
- **Ingest prompt size:** `CORTEX_LLM_MAX_INGEST_CHARS` (default `24000`).

## Adding a provider

1. Implement `LLMProvider` in `core/llm/providers/your_vendor.py`.
2. Register in `core/llm/registry.py`.
3. Document env vars here and in `SECURITY.md`.

## Assessment LLM (Track A)

Per-control assessment uses the same provider chain via `services/assessment_llm.py` and the `assessment_llm` CircuitBreaker.

```bash
CORTEX_ASSESSMENT_LLM_ENABLED=1
CORTEX_ASSESSMENT_MAX_CONTROLS=0   # 0 = unlimited; docker-compose default 5 for demos
```

Smoke: `bash scripts/smoke_assessment_llm.sh` — see [TRACK_A.md](./TRACK_A.md).
