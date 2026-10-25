# Offline operation

Astra GRC CE can run after installation without internet access. The release stack
defaults both model routes to `stub`; leave `ANTHROPIC_API_KEY` and
`OPENAI_API_KEY` empty.

## Air-gapped install

On a connected build host:

```bash
./scripts/build-release.sh v1.0.0
```

Copy the resulting `release/dist/v1.0.0` directory through your approved media
process. Verify `SHA256SUMS` before use. On the disconnected host:

```bash
sha256sum --check SHA256SUMS
docker load < astra-grc-ce-images.tar.gz
tar -xzf astra-grc-ce-release-files.tar.gz
```

Set the image values in `.env` to the loaded tags and run
`./scripts/install.sh`. The PostgreSQL image must also be preloaded when the
host cannot pull `postgres:16-alpine`.

## Offline persona status

Versioned, deterministic, scenario-specific fixtures are present under
`content/offline_personas/v1` and are contract-tested. They are intentionally
isolated because the active learning harness currently has concurrent changes.
Runtime harness integration is pending; until that narrow integration lands,
the existing model stub behavior remains active.

## Network containment

The release binds only `127.0.0.1:8080`. For stricter isolation, enforce an
outbound-deny firewall policy for the Docker network and use an internal image
registry or preloaded images. Astra GRC CE does not require telemetry for operation.
