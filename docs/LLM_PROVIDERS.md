# LLM providers (multi-vendor)

Astra GRC routes all structured LLM calls through `core/llm` — never call vendor APIs directly from feature code. Wrap feature calls in a module-level `CircuitBreaker` (see `ontology_mapper.py`).

## Supported providers

| Provider ID | Env | Default model |
|-------------|-----|----------------|
| `anthropic` | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` (default `claude-sonnet-4-20250514`) |
| `openai` | `OPENAI_API_KEY` | `OPENAI_MODEL` (default `gpt-4o-mini`) |
| `gemini` | `GEMINI_API_KEY` | `GEMINI_MODEL` (default `gemini-4-argon`) |
| `stub` | (always available) | deterministic JSON for CI / offline |

## Provider chain (fallback)

Set ordered fallback with:

```bash
export CORTEX_LLM_PROVIDERS=gemini,anthropic,openai,stub
```

Legacy single value still works:

```bash
export CORTEX_LLM_PROVIDER=gemini
```

The router tries each **configured** provider in order; `stub` is appended automatically if not listed and nothing else is configured.

## Google Gemini 4 Argon (recommended for high-complexity tasks)

```bash
export GEMINI_API_KEY=AIzaSy...
export GEMINI_MODEL=gemini-4-argon
export GEMINI_THINKING_LEVEL=high   # low | medium | high
export CORTEX_LLM_PROVIDERS=gemini,anthropic,stub
```

Features:
- Configurable **`thinking_level`** (`low`, `medium`, `high`) for deep reasoning on multi-hop regulatory standards.
- Structured JSON schema enforcement with strict Pydantic output.
- Explicit context caching for `content/skills/` reference guidelines and standards to minimize latency and token consumption.
- Dynamic task routing: automatically selected for high-complexity cross-framework gap assessments, grading (`thinking_level="high"`), and indirect prompt-injection-resistant document ingestion (`thinking_level="medium"`).

## Anthropic (multi-vendor)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ANTHROPIC_MODEL=claude-sonnet-4-20250514
export CORTEX_LLM_PROVIDERS=anthropic,stub
```

Uses the [Messages API](https://docs.anthropic.com/en/api/messages) via `httpx` (no Anthropic SDK required).

## OpenAI (optional multi-vendor)

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini
export CORTEX_LLM_PROVIDERS=anthropic,openai,stub
```

## Learning loop and local Gemma 4

Stakeholder turns and training narration use `core/agents/model.py`, which is
separate from the compliance router above. Release and CI keep
`MODEL_PROVIDER=stub`.

```bash
export MODEL_PROVIDER=ollama
export AGENT_MODEL=gemma4:12b
export OLLAMA_BASE_URL=http://127.0.0.1:11434
export OLLAMA_CONTEXT_LENGTH=4096
```

Gemma 4 12B may explain a debrief, the next-practice sentence, and an
instructor briefing. The grader still owns the score. The ranker still owns
the practice id. Customer scenario drafts stay unpublished. See
[OFFLINE.md](OFFLINE.md).

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

Per-control assessment uses the same provider chain via `core/assessment_llm.py` and the `assessment_llm` CircuitBreaker.

```bash
CORTEX_ASSESSMENT_LLM_ENABLED=1
CORTEX_ASSESSMENT_MAX_CONTROLS=0   # 0 = unlimited; docker-compose default 5 for demos
```

Smoke: `bash scripts/smoke_assessment_llm.sh` — see [archive/TRACK_A.md](./archive/TRACK_A.md).
