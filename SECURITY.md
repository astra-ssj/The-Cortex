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
| Authentication       | JWT HS256, 8h expiry         |
| Passwords            | bcrypt 12 rounds             |
| Rate limiting        | 10/min login, 5/min register |
| Security headers     | X-Frame-Options, XSS, CSP    |
| CORS                 | Allowlist only               |
| SQL injection        | Parameterised queries only   |
| Evidence integrity   | SHA-256 hash chain           |
| Tenant isolation     | `org_id` scoping on all queries |
| Supply chain (CI)    | `pip-audit` and `npm audit` (high severity threshold for npm) on push/PR to `main` |

## Known Development Limitations

- **JWT_SECRET default** — not production-safe. Always set `JWT_SECRET` environment variable.
- **CORS** — set `FRONTEND_URL` env var to your production domain.
- **HTTPS** — add TLS termination in production.

## EU AI Act Compliance Note

CORTEX governs its own AI under EU AI Act Art.14. Every automated compliance decision with confidence below **0.75** routes through the Human Review Queue. The Evidence Vault (SHA-256 hash chain) provides the audit trail required under NIS2 Art.20.
