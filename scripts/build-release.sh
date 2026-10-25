#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

version="${1:-}"
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || {
  echo "Usage: $0 vMAJOR.MINOR.PATCH" >&2
  exit 2
}
expected_version="v$(tr -d '[:space:]' <"$ROOT/VERSION")"
[[ "$version" == "$expected_version" ]] || {
  echo "Release version $version does not match VERSION ($expected_version)." >&2
  exit 2
}
command -v docker >/dev/null 2>&1 || {
  echo "Docker is required." >&2
  exit 127
}

"$ROOT/scripts/verify-release.sh" --build

revision="$(git rev-parse HEAD)"
metadata_version="${version#v}"
output="$ROOT/release/dist/$version"
[[ ! -e "$output" ]] || {
  echo "Refusing to overwrite existing release directory: $output" >&2
  exit 2
}
mkdir -p "$output"

docker build \
  --build-arg "ASTRA_VERSION=$metadata_version" \
  --build-arg "VCS_REF=$revision" \
  --tag "astra-grc-ce-api:$version" .
docker build \
  --build-arg "ASTRA_VERSION=$metadata_version" \
  --build-arg "VCS_REF=$revision" \
  --tag "astra-grc-ce-frontend:$version" frontend

docker pull postgres:16-alpine
docker save "astra-grc-ce-api:$version" "astra-grc-ce-frontend:$version" postgres:16-alpine \
  | gzip -9 >"$output/astra-grc-ce-images.tar.gz"
tar -czf "$output/astra-grc-ce-release-files.tar.gz" \
  VERSION release/compose.yml .env.example \
  scripts/release-common.sh scripts/install.sh scripts/status.sh scripts/upgrade.sh \
  scripts/backup.sh scripts/restore.sh scripts/uninstall.sh \
  docs/OFFLINE.md docs/PRIVACY.md docs/INSTALL.md docs/UPGRADE.md docs/BACKUP_RESTORE.md

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$output" && sha256sum ./*.tar.gz >SHA256SUMS)
else
  (cd "$output" && shasum -a 256 ./*.tar.gz >SHA256SUMS)
fi
echo "Release bundle created in $output"
