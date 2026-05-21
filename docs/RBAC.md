# Server-side RBAC

Permissions are enforced in **`core/rbac.py`** on mutating API routes. The UI mirrors the same matrix in `frontend/src/lib/roles.ts` but must not be trusted alone.

## Canonical roles

| Role | Typical JWT / DB values |
|------|-------------------------|
| `admin` | `ADMIN`, `admin` |
| `analyst` | `CISO`, `DPO`, `analyst`, `security_lead` |
| `viewer` | `viewer`, `auditor`, unknown (fail closed) |

## Permissions

| Permission | admin | analyst | viewer |
|------------|:-----:|:-------:|:------:|
| `run_assessment` | ✓ | ✓ | |
| `approve_review` | ✓ | ✓ | |
| `override_review` | ✓ | | |
| `edit_findings` | ✓ | ✓ | |
| `ingest_document` | ✓ | ✓ | |
| `manage_integrations` | ✓ | | |
| `manage_api_keys` | ✓ | | |
| `generate_report` | ✓ | ✓ | ✓ |

## Protected routes (examples)

- `PATCH /api/v1/findings/{id}` → `edit_findings`
- `POST /api/v1/assessments/controls/{id}/approve` → `approve_review`
- `POST /api/v1/assessments/controls/{id}/override` → `override_review`
- `GET/POST /api/v1/assessments/run` (stream) → `run_assessment`
- `POST /api/v1/ingest/document` → `ingest_document` (requires Bearer JWT)
- `POST /api/v1/shasta/scans` → `manage_integrations`

## Tests

```bash
pytest tests/test_rbac.py -q
```
