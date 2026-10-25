# Install Astra GRC Community Edition

## Requirements

- Docker Engine 24+ with Compose v2.20+ (required by the source-development include shim)
- 4 GB RAM and 10 GB free disk
- About 8 GB more disk, and enough RAM to run a 12B model, if you enable local Gemma 4
- Linux or macOS (Windows through WSL2)

## Connected install

Download and extract a release bundle, then run:

```bash
./scripts/install.sh
./scripts/status.sh
```

The installer creates `.env` with mode `0600`, generates local secrets, pulls
the pinned images, runs migrations once, and waits for healthy services. Open
`http://127.0.0.1:8080`. Only the frontend port binds to the host; PostgreSQL
and the API remain on the private Compose network.

Review `.env` before exposing Astra GRC CE through a reverse proxy. Release
images are version-pinned; use digests when your deployment policy requires them.

## Local source build

```bash
cp .env.example .env
# Replace every CHANGE_ME value.
docker compose -f compose.dev.yml config
docker compose -f compose.dev.yml up -d --build --wait
```

The default provider is the deterministic local stub. No external model key is
required.

To add offline Gemma 4, put the checksummed `astra-gemma4-12b.tar` archive in
`models/gemma4/` before `./scripts/install.sh`, or follow
[OFFLINE.md](OFFLINE.md). The practice still completes if the model is absent.

## Uninstall

`./scripts/uninstall.sh` removes containers but preserves the database volume
and `.env`. `./scripts/uninstall.sh --purge-data --yes` takes a final backup
before removing the volume.
