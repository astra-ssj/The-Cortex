# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY api ./api
COPY compliance ./compliance
COPY core ./core
COPY db ./db
COPY ontology ./ontology
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir .

FROM python:3.12-slim AS runtime

ARG ASTRA_VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Astra GRC Community Edition API" \
      org.opencontainers.image.version="${ASTRA_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/astra-ssj/The-Cortex"

ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

# The image is also the one-shot migration image, so it carries only the psql client.
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 astra \
    && useradd --system --uid 10001 --gid astra --home-dir /app astra

COPY --from=builder /opt/venv /opt/venv
COPY --chown=astra:astra api ./api
COPY --chown=astra:astra compliance ./compliance
COPY --chown=astra:astra core ./core
COPY --chown=astra:astra db ./db
COPY --chown=astra:astra ontology ./ontology
COPY --chown=astra:astra content ./content
COPY --chown=astra:astra migrations ./migrations
COPY --chown=astra:astra scripts/apply_cortex_schema.sh ./scripts/apply_cortex_schema.sh
COPY --chown=astra:astra init.sql README.md pyproject.toml VERSION ./

USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:8000/health >/dev/null || exit 1

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
