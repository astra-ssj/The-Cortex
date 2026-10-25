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

Versioned, deterministic personas live under `content/offline_personas/v1`.
With `MODEL_PROVIDER=stub`, the learning harness uses those personas for
stakeholder turns. Scores, risk outcomes, and the next practice stay in the
deterministic grader and ranker.

## Optional local Gemma 4

Gemma 4 12B is the optional offline model. The weights are not in the API
image. Place `astra-gemma4-12b.tar` and `astra-gemma4-12b.tar.sha256` in
`models/gemma4/`, then run `./scripts/install.sh`. The installer verifies the
digest, sets `MODEL_PROVIDER=ollama` and `AGENT_MODEL=gemma4:12b`, and loads
the archive into the Ollama volume. A connected development machine can
instead run:

```bash
AGENT_MODEL=gemma4:12b MODEL_PROVIDER=ollama docker compose --profile local-ai up -d --build --wait
docker compose exec ollama ollama pull gemma4:12b
```

When that provider is selected, Gemma may speak as the stakeholder, draft an
unpublished customer scenario, and explain a debrief, a next-practice reason,
or an instructor briefing. It cannot change a score, choose a different
practice, or create an assignment. Invalid JSON, a cited fact that was not
supplied, or confidence below 0.75 keeps the reviewed sentence. The screen
labels a live reply **Local Gemma 4**.

## Network containment

The release binds only `127.0.0.1:8080`. For stricter isolation, enforce an
outbound-deny firewall policy for the Docker network and use an internal image
registry or preloaded images. Astra GRC CE does not require telemetry for operation.
