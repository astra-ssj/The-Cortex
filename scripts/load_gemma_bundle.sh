#!/usr/bin/env bash
# Load a checksum-verified Gemma 4 archive into the local Ollama volume.
# The archive is a tar of the Ollama model directory, rooted so that
# `models/` extracts at /root/.ollama/models. It is not pulled from the network.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/release-common.sh
source "$ROOT/scripts/release-common.sh"

archive="${ASTRA_GEMMA_ARCHIVE:-$ROOT/models/gemma4/astra-gemma4-12b.tar}"
if [[ ! -f "$archive" ]]; then
  echo "No Gemma bundle at $archive. Astra keeps the reviewed persona path."
  exit 0
fi

python3 "$ROOT/scripts/verify_gemma_bundle.py" "$archive"
require_command docker
require_release_files

compose --profile offline-ai up -d --wait ollama
container="$(compose --profile offline-ai ps -q ollama)"
if [[ -z "$container" ]]; then
  echo "Ollama service is not running." >&2
  exit 1
fi

docker cp "$archive" "$container:/tmp/astra-gemma4-12b.tar"
docker cp "$ROOT/models/gemma4/APACHE-2.0-NOTICE.txt" "$container:/tmp/APACHE-2.0-NOTICE.txt"
compose --profile offline-ai exec -T ollama sh -c '
  mkdir -p /root/.ollama
  tar -xf /tmp/astra-gemma4-12b.tar -C /root/.ollama
  cp /tmp/APACHE-2.0-NOTICE.txt /root/.ollama/APACHE-2.0-NOTICE.txt
  rm -f /tmp/astra-gemma4-12b.tar
'
echo "Loaded the verified Gemma 4 bundle into the local Ollama volume."
