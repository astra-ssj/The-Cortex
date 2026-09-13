#!/usr/bin/env bash
# Per-boot startup for the Astra GRC (CORTEX) Cloud Agent environment.
#
# Runs on every environment start. Brings up PostgreSQL (installed by install.sh
# and baked into the environment build baseline). Dependency installation and
# schema application live in install.sh, not here. Must tolerate restarts.
set -euo pipefail

echo "==> Starting PostgreSQL 16 cluster"
# No systemd in this container: start the cluster explicitly. Idempotent — if it
# is already online, pg_ctlcluster reports so and we continue.
sudo pg_ctlcluster 16 main start || true

echo "==> Waiting for PostgreSQL to accept connections"
for _ in $(seq 1 30); do
  if pg_isready -h localhost -p 5432 -q; then
    echo "==> PostgreSQL is ready."
    exit 0
  fi
  sleep 1
done

echo "!! PostgreSQL did not become ready in time" >&2
exit 1
