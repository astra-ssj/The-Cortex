# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.7.x   | ✅ Yes    |
| below 0.7 | ❌ No     |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Email: [support@astralabs-ai.net](mailto:support@astralabs-ai.net)

Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested remediation (if known)

We respond within 48 hours and patch critical issues within 7 days.

## Security Architecture

| Control              | Implementation               |
|----------------------|------------------------------|
| Authentication       | JWT HS256, 60-min access tokens (`ACCESS_TOKEN_EXPIRE_MINUTES`) + rotating refresh tokens; app refuses to boot in production without `JWT_SECRET` |
| Passwords            | bcrypt 12 rounds; failed-login lockout (persisted); constant-time verify on unknown accounts |
| Rate limiting        | 10/min login, 5/min register |
| Security headers     | X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Content-Security-Policy (API + SPA) |
| CORS                 | Allowlist only (localhost origins dropped in production; `FRONTEND_URL`-driven) |
| SQL injection        | Parameterised queries only   |
| Evidence integrity   | SHA-256 hash chain (client-side; server-anchored chain on the roadmap) |
| Tenant isolation     | Application-layer `org_id` scoping (`resolve_scoped_org_id`) **plus** optional Postgres row-level security (migration 016) — every authenticated request sets `app.current_org`; enforce by running the app as the non-superuser `cortex_app` role (see "Row-level security" below) |
| LLM calls            | `core/llm` multi-provider router (Anthropic, OpenAI, stub) behind CircuitBreaker (assessment + ingest); untrusted document text delimited in prompts; LLM-emitted control IDs validated against the registry; human review on low confidence OR high-severity verdicts; no document body in audit payloads |
| Supply chain (CI)    | `pip-audit` and `npm audit` (high severity threshold for npm) on push/PR to `main` |

## LLM configuration

| Variable | Purpose |
|----------|---------|
| `CORTEX_LLM_PROVIDERS` | Comma-separated chain, e.g. `anthropic,openai,stub` (default) |
| `ANTHROPIC_API_KEY` | Anthropic Messages API |
| `ANTHROPIC_MODEL` | Model id (default `claude-sonnet-4-20250514`) |
| `OPENAI_API_KEY` | Optional OpenAI fallback |
| `OPENAI_MODEL` | OpenAI model (default `gpt-4o-mini`) |

See [docs/LLM_PROVIDERS.md](docs/LLM_PROVIDERS.md).

## Verification reports

Before release, run the checklist in [docs/RELEASE_QA.md](docs/RELEASE_QA.md). Latest automated run summaries:

| Report | Purpose |
|--------|---------|
| [QA-REPORT.md](QA-REPORT.md) | QA, pytest, HTTP smokes |
| [SAST-REPORT.md](SAST-REPORT.md) | Ruff, Bandit, ESLint, dependency audits |
| [SECURITY_REPORT.md](SECURITY_REPORT.md) | Security posture history + run log |

**Last run (2026-05-21):** Frontend build/tests pass; Ruff/Bandit pass; `smoke_happy_path` + Track B ingest pass; `pip-audit` flags `idna` upgrade; 2 pytest failures on Compose DB; Track A assessment smoke missing `run_done`.

## Row-level security

Migration `016_row_level_security.sql` adds Postgres RLS policies to every tenant table and
creates a non-superuser role `cortex_app`. RLS is bypassed by superusers, so it is a **no-op**
until the app connects as `cortex_app`:

```sql
ALTER ROLE cortex_app LOGIN PASSWORD '<strong-password>';
```

Then point `DATABASE_URL` at `cortex_app` and redeploy. Each authenticated request sets
`app.current_org` (transaction-local), after which a session can read only its own org rows
(plus the shared demo org) and write only its own. System connections that do not set the
GUC (migrations, the Shasta worker, audit writes) are unaffected. The Shasta worker, which
writes findings outside a request, should set `app.current_org` for the job's org before
enforcing RLS on its connection (tracked follow-up).

## Known Development Limitations

- **JWT_SECRET default** — not production-safe; the app refuses to boot in production without it.
- **CORS** — set `FRONTEND_URL` env var to your production domain.
- **HTTPS** — add TLS termination in production.
- **RLS enforcement** — requires running as `cortex_app` (see above); default superuser bypasses it.

## EU AI Act Compliance Note

CORTEX governs its own AI under EU AI Act Art.14. Every automated compliance decision with confidence below **0.75** routes through the Human Review Queue. The Evidence Vault (SHA-256 hash chain) provides the audit trail required under NIS2 Art.20.
