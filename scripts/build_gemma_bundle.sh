#!/usr/bin/env bash
# Package a locally present gemma4:12b Ollama store into the offline archive.
# This is a release-operator command. CI does not download the weights.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/release-common.sh
source "$ROOT/scripts/release-common.sh"

require_command docker
require_release_files
compose --profile offline-ai up -d --wait ollama
if ! compose --profile offline-ai exec -T ollama ollama show gemma4:12b >/dev/null; then
  echo "gemma4:12b is not in the local Ollama volume. Load it before packaging." >&2
  exit 2
fi

destination="${1:-$ROOT/dist/astra-gemma4-12b.tar}"
mkdir -p "$(dirname "$destination")"
compose --profile offline-ai exec -T ollama sh -c '
  tar -cf - -C /root/.ollama models
' >"$destination"
python3 - "$destination" <<'PY'
import hashlib
import pathlib
import sys

archive = pathlib.Path(sys.argv[1])
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
sidecar = pathlib.Path(str(archive) + ".sha256")
sidecar.write_text(digest + "\n", encoding="utf-8")
print(digest)
PY
echo "Wrote $destination"
