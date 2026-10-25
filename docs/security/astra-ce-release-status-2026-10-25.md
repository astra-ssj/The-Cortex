# Astra GRC CE release security status

**Date:** 25 October 2026
**Release target:** 1.0.0

This status narrows the earlier CORTEX assessment to the Astra CE runtime. It
does not erase inherited findings; modules that remain in source pending
repository extraction are explicitly unmounted from `api.main:app` and absent
from Astra navigation.

## Release-blocking findings addressed

- Operational assessment, ingestion, findings, compliance-posture, generic
  review, audit-stream, and system-provider APIs are not mounted.
- Learning session reads, decisions, and debriefs require learner ownership;
  instructor reads use separate permissioned endpoints.
- Audit RLS fails closed without a transaction-bound organisation.
- The published `admin/admin` identity is deactivated by migration 039.
- Production frontend requests use same-origin `/api` paths.
- Offline deterministic personas are the release default; synthetic operational
  assessment fallbacks are outside the Astra runtime.
- Curriculum, diagnostic evidence, coaching notes, agent turns, and audit events
  are append-only where their evidence semantics require it.

## Distribution controls

- The public entrypoint is the frontend proxy; PostgreSQL and API are internal.
- API and frontend images run without root privileges and with
  `no-new-privileges`.
- Fresh install, migration-head, upgrade, offline startup, backup/restore, SBOM,
  checksums, provenance, and signature verification are release gates.
- External model providers are opt-in and are documented in the privacy notice.

## Residual constraints

- Training feedback is not certification or organisational control-effectiveness
  evidence.
- Historical Cortex source remains temporarily for extraction compatibility. It
  must not be re-mounted in an Astra release.
- A release candidate still requires the complete CI, dependency, container,
  browser, migration, and restore gates to pass on the tagged commit.
