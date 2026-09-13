#!/usr/bin/env bash
# Cloud Agent environment install for Astra GRC (CORTEX).
#
# Idempotent, non-interactive baseline setup. Runs from the repository root after
# checkout. Safe to run repeatedly and against cached/partially-prepared state.
# See AGENTS.md for the credential matrix and the manual equivalents.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_USER="cortex"          # migration role (owns schema)
PG_PASSWORD="cortex-dev"  # dev-only password used by both roles on this VM
PG_DB="cortex"

echo "==> Installing system packages (PostgreSQL 16, Python venv, build tools)"
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  postgresql-16 postgresql-client-16 \
  python3.12-venv python3-dev build-essential libpq-dev

echo "==> Ensuring PostgreSQL cluster is running (needed to apply schema)"
# The apt package does not auto-start in this container (no systemd/runlevel).
sudo pg_ctlcluster 16 main start || true
for _ in $(seq 1 30); do pg_isready -h localhost -p 5432 -q && break; sleep 1; done

echo "==> Provisioning database roles and database (idempotent)"
# Migration role: owns the schema, must be able to create the cortex_app role
# that migration 016 provisions for RLS/audit grants.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASSWORD}' CREATEDB;"
fi
sudo -u postgres psql -c "ALTER ROLE ${PG_USER} WITH CREATEROLE;"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};"
fi

echo "==> Creating Python virtualenv and installing backend deps"
# Install the editable package with dev extras against the committed constraints
# lock, mirroring CI (see .github/workflows/ci.yml) for reproducible resolves.
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -e ".[dev]" -c requirements.lock.txt

echo "==> Applying CORTEX schema + seed migrations"
# The apply script replays every migration from init.sql onward and is only
# safe on a fresh database: migration 016 enables FORCE ROW LEVEL SECURITY, so
# replaying init.sql's seed INSERT against an already-migrated DB is blocked by
# RLS. Apply only when the schema is absent (fresh build), and always keep the
# non-superuser cortex_app password in sync with DATABASE_URL.
if sudo -u postgres psql -d "${PG_DB}" -tAc \
    "SELECT to_regclass('public.scenarios')" | grep -q scenarios; then
  echo "    Schema already present — skipping migration replay."
else
  PGHOST=localhost PGUSER="${PG_USER}" PGPASSWORD="${PG_PASSWORD}" PGDATABASE="${PG_DB}" \
    bash scripts/apply_cortex_schema.sh
fi
echo "==> Syncing cortex_app password"
sudo -u postgres psql -d "${PG_DB}" -c "ALTER ROLE cortex_app WITH PASSWORD '${PG_PASSWORD}';"

echo "==> Installing frontend dependencies"
( cd frontend && npm ci )

echo "==> Install complete."
