#!/usr/bin/env bash
# Start CORTEX API from repo root (venv active). Usage: bash scripts/run-api.sh

set -e
cd "$(dirname "$0")/.."
export PYTHONPATH="${PYTHONPATH:-.}"
PY="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)"
if [[ -z "$PY" ]]; then
  echo "run-api.sh: need python3 or python on PATH" >&2
  exit 1
fi
exec "$PY" -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
