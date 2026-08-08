# Track B — Real LLM ingest (complete)

Track B delivers **multi-provider structured LLM** for **document ingestion**, behind `ingestion_llm` CircuitBreaker, with server-side RBAC and operator visibility.

Assessment LLM is **Track A** — see [TRACK_A.md](./TRACK_A.md).

## Delivered

| Component | Location |
|-----------|----------|
| Provider gateway | `core/llm/` (Anthropic, OpenAI, stub) |
| Ingest mapping | `core/ingestion/ontology_mapper.py` |
| HTTP + SSE | `POST /api/v1/ingest/document` |
| Ops | `GET /api/v1/system/llm-providers` |
| RBAC | `ingest_document` (admin + analyst) |
| Frontend | `uploadEvidence`, `FileUpload`, `evidenceIngestLive` flag, `LlmProviderBadge` |
| Compose env | `docker-compose.yml` → `CORTEX_LLM_*`, `ANTHROPIC_*`, `OPENAI_*` |
| Tests | `tests/test_llm_providers.py`, `tests/test_ingestion.py`, `tests/test_api_system.py` |
| Smoke | `scripts/smoke_ingest_llm.sh` |

## Configuration

```bash
# .env or shell (API container picks these up via docker compose)
export ANTHROPIC_API_KEY=sk-ant-...
export CORTEX_LLM_PROVIDERS=anthropic,openai,stub

docker compose up -d --build api
```

Without API keys, the router falls back to **stub** (deterministic JSON for CI/demo).

See [LLM_PROVIDERS.md](./LLM_PROVIDERS.md) and [RBAC.md](./RBAC.md).

## Verify

```bash
pytest tests/test_llm_providers.py tests/test_ingestion.py tests/test_api_system.py::test_llm_providers_returns_chain tests/test_rbac.py -q
bash scripts/smoke_ingest_llm.sh
```

## Out of scope (future)

- **Persistent evidence vault** — ingest creates in-memory evidence models; Postgres vault is separate work.
