# Astra GRC — Community Edition

Competence you can evidence.

Astra GRC is case-based GRC competency training. A learner takes a decision under stakeholder pressure and is scored against a framework-grounded reference answer — not against a quiz key. Community Edition trains the practitioner. Enterprise (separate offering) is meant to give their organisation an auditable record of demonstrated judgment. This repository is the Community Edition.

## The learning loop

A scenario opens with a brief. An adversarial stakeholder agent presses for a decision. The learner chooses; the harness grades the choice across four competency dimensions and debriefs against the reference answer. Weak dimensions surface as control gaps.

The platform is built on **purvapaksha**: in Indian philosophical method, a position may not be asserted until its strongest objection has been stated in full. The stakeholder agent argues to win, not to find truth. Holding a correct position against that pressure is the skill being trained.

Version 1.1.0 ships 15 reviewed practices with objective-linked evidence tasks,
choice-dependent paths, explicit qualified alternatives, remediation guidance,
and five calibrated evaluation paths per practice. Recommendations remain
deterministic and offline: current competency gaps select the next eligible
practice and difficulty, while results below 0.75 are marked for human review.

## Frameworks

Counts below are taken from the seed migrations (`migrations/019`–`024`), not from marketing copy.

| Framework | Status | Practices |
|-----------|--------|-----------|
| ISO 27001, NIST CSF, NIS2, DORA, GDPR, SOC 2, ISO 42001 | Live in the Practice Library | **15** reviewed practices |

ISO 27001 track:

| ID | Title | Difficulty |
|----|-------|------------|
| CX-1001 | Cloud access onboarding | Foundation |
| CX-1002 | Supplier incident response | Practitioner |
| CX-1003 | Change management failure | Practitioner |
| CX-1004 | Asset classification breach | Practitioner |
| CX-1005 | Ransomware group response | Expert |

## Quickstart — signed release

Download `astra-grc-ce-release-files.tar.gz`, `SHA256SUMS`, and
`SHA256SUMS.sigstore.json` from the desired GitHub Release. Verify the keyless
signature and checksums before installation:

```bash
cosign verify-blob \
  --bundle SHA256SUMS.sigstore.json \
  --certificate-identity-regexp 'https://github.com/astra-ssj/The-Cortex/.github/workflows/release.yml@refs/tags/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  SHA256SUMS
grep 'astra-grc-ce-release-files.tar.gz' SHA256SUMS | sha256sum --check
tar -xzf astra-grc-ce-release-files.tar.gz
./scripts/install.sh
```

Open http://127.0.0.1:8080. The installer generates local secrets, applies the
checksum-verified migration manifest through migration 045, and waits for all
services to become healthy. Offline stub providers are the default; no model
key or telemetry service is required. See [installation](docs/INSTALL.md) and
[offline operation](docs/OFFLINE.md).

## Source development

The root `docker-compose.yml` is a safe development shim that includes
`compose.dev.yml`. Therefore plain `docker compose up` always starts the Astra
GRC CE development topology (`postgres`, one-shot `migrate`, `api`, and
`frontend`) and never the inherited platform topology.

```bash
git clone https://github.com/astra-ssj/The-Cortex
cd The-Cortex
cp .env.example .env
# Replace every CHANGE_ME value in .env.
docker compose up -d --build --wait
```

`docker compose -f compose.dev.yml up -d --build --wait` is the explicit
equivalent. These source-development commands build local images. Downloaded,
signed releases instead use `scripts/install.sh`, which selects
`release/compose.yml` and pinned `astra-grc-ce-*` images; do not use plain
`docker compose up` as a release installation command.

Optional local AI uses Gemma 4 12B through Ollama. The weights are a separate checksum-verified archive, `astra-gemma4-12b.tar`, loaded by `scripts/install.sh` when the file is present. They are not inside the API image, and CI does not download them.

```bash
AGENT_MODEL=gemma4:12b MODEL_PROVIDER=ollama docker compose --profile local-ai up -d --build --wait
docker compose exec ollama ollama pull gemma4:12b
```

The default install remains API-free and uses reviewed deterministic personas. With the local model enabled, Gemma explains the debrief, the next practice, and an instructor briefing. Scores, the next practice id, and assignments stay with the deterministic engines. Customer scenario drafts stay unpublished until curriculum review.

Open http://localhost:8080. For native backend/frontend development and
environment-specific database credentials, see [AGENTS.md](AGENTS.md) and
[docs/CORTEX_SETUP.md](docs/CORTEX_SETUP.md).

## Release tags

Tags reachable from `main`, most recent first:

| Tag | What it marks |
|-----|----------------|
| `v4.2-demo-integrity` | Role canonicalisation (ciso → admin) and demo integrity |
| `v4.1-astra-light-theme` | Astra GRC light theme and Audit Simulator landing |
| `v1.0.0-community-edition` | Community Edition snapshot |
| `v3.10-audit-chain` | Audit chain lock |
| `v3.9-role-fix` | Role and help-key fix |
| `v3.8-ce-coherence` | Community Edition coherence / CI follow-up |
| `v3.7-control-gaps` | Control gaps view |
| `v3.6-story-fix` | Learning-loop story fix |
| `v3.5-ci-green` | CI stabilisation |
| `v3.4-branding-complete` | Branding and routing |
| `v3.3-full-help-docs` | In-app help docs |
| `v3.2-registration-clean` | Registration / onboarding cleanup |
| `v3.1-claude-live` | Claude wired into `call_model()` |
| `v3.0-multi-scenario-fixed` | Multi-scenario stage transitions |
| `v2.9-docs-complete` | GitHub docs pass |
| `v2.8-help-rewrite` | Help system rewrite |
| `v2.7-five-scenarios` | CX-1005 (five ISO 27001 scenarios) |
| `v2.6-four-scenarios` | CX-1004 |
| `v2.5-three-scenarios` | CX-1003 |
| `v2.4-scenario-selector` | Scenario selector UI |

`safety/pre-recovery-20260820` exists on the remote but is **not** reachable from `main`.

## Architecture

FastAPI + PostgreSQL (RLS, append-only audit) + a React SPA. Agent output is schema-validated in `core/agents/harness.py` before it touches session state. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What's in this repository

This tree was forked from a broader compliance platform. Modules such as assessments, findings, posture, and connectors are **demo backdrop from that architecture**, not Community Edition product features. The product surface is the learning loop (scenarios, adversarial stakeholder, grading, debrief). Do not treat inherited screens as supported CE capabilities.

## Licence / contributing

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Contributions are under the same licence; see [CONTRIBUTING.md](CONTRIBUTING.md).

CI on `main` and PRs: Ruff, Bandit, ESLint, Vitest, `tsc`, frontend build, pip-audit, npm audit, gitleaks, commitlint.
