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
| Authentication       | JWT HS256, 1h default expiry; rotating refresh tokens |
| Passwords            | bcrypt 12 rounds             |
| Rate limiting        | 10/min login, 5/min register |
| Security headers     | CSP, X-Frame-Options, nosniff; HSTS on production HTTPS |
| CORS                 | Allowlist only               |
| SQL injection        | Parameterised queries only   |
| Evidence integrity   | SHA-256 hash chain           |
| Tenant isolation     | `org_id` scoping on all queries |
| LLM calls            | `core/llm` multi-provider router (Anthropic, OpenAI, stub); CircuitBreaker on ingest; no document body in audit payloads |
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

Before release, run the living checklist in [docs/RELEASE_QA.md](docs/RELEASE_QA.md).

Historical snapshots (not current posture) live under [docs/archive/](docs/archive/):

| Report | Purpose |
|--------|---------|
| [docs/archive/QA-REPORT.md](docs/archive/QA-REPORT.md) | Dated QA / smoke log |
| [docs/archive/SAST-REPORT.md](docs/archive/SAST-REPORT.md) | Dated SAST / dependency audit |
| [docs/archive/SECURITY_REPORT.md](docs/archive/SECURITY_REPORT.md) | Dated security posture note |

## Known Development Limitations

- **JWT_SECRET default** — not production-safe. Always set `JWT_SECRET` environment variable.
- **CORS** — set `FRONTEND_URL` env var to your production domain.
- **HTTPS** — terminate TLS at the production proxy/CDN and set
  `CORTEX_ENVIRONMENT=production` plus `CORTEX_HTTPS_ENABLED=1`.
- **Frontend headers** — the API middleware cannot secure a separately served SPA.
  Configure CSP and HSTS on the HTTPS proxy/CDN serving `frontend/`, validate the
  policy in report-only mode, then enforce it.

## EU AI Act Compliance Note

Astra GRC governs its own AI under EU AI Act Art.14. Every automated compliance decision with confidence below **0.75** routes through the Human Review Queue. The Evidence Vault (SHA-256 hash chain) provides the audit trail required under NIS2 Art.20.
