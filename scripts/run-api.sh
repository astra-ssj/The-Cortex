#!/usr/bin/env bash
# Start CORTEX API with compliance-engine on path. Run from repo root with venv active.
# Usage: ./scripts/run-api.sh   or   bash scripts/run-api.sh

set -e
cd "$(dirname "$0")/.."
export PYTHONPATH=.:services/compliance-engine
exec python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
