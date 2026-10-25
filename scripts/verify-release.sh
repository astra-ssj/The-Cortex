#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for script in scripts/*.sh; do
  bash -n "$script"
done

if grep -R -E -i '\b(UPDATE|DELETE)[[:space:]]+audit_log\b' scripts release compose.dev.yml Dockerfile frontend/Dockerfile frontend/nginx.conf; then
  echo "Release assets must never mutate append-only audit_log rows." >&2
  exit 1
fi

export POSTGRES_PASSWORD=release-verification-password
export JWT_SECRET=release-verification-jwt-secret-at-least-32-characters
export COMPLIANCE_ENGINE_STUB_PASSWORD=release-verification-stub-password
export COMPLIANCE_ENGINE_STUB_ACCESS_TOKEN=release-verification-stub-token

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose config --quiet
  docker compose -f compose.dev.yml config --quiet
  docker compose -f release/compose.yml config --quiet
  if [[ "${1:-}" == "--build" ]]; then
    docker build --check .
    docker build --check frontend
    docker compose -f compose.dev.yml build
  fi
else
  echo "Docker unavailable; skipped Compose and image validation." >&2
fi

python_bin="${PYTHON:-python3}"
if [[ -x "$ROOT/.venv/bin/python" ]]; then
  python_bin="$ROOT/.venv/bin/python"
fi
"$python_bin" scripts/verify_release_assets.py
if "$python_bin" -c "import pytest" >/dev/null 2>&1; then
  "$python_bin" -m pytest -q tests/test_offline_personas.py
else
  echo "pytest unavailable; offline fixture tests remain covered by the main CI test job."
fi
echo "Release verification passed."
