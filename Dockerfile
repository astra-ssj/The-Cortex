# CORTEX API — Dockerfile for compliance API (uvicorn).
# Build: docker build -t cortex-api .
# Run: docker run -p 8000:8000 -e POSTGRES_PASSWORD=... -e DATABASE_URL=... cortex-api

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Editable install needs package trees + readme (pyproject metadata). Runtime copies db/migrations after.
COPY pyproject.toml README.md ./
COPY api/ ./api/
COPY core/ ./core/
COPY compliance/ ./compliance/
COPY ontology/ ./ontology/
RUN pip install --no-cache-dir -e "." "uvicorn[standard]>=0.27"

COPY db/ ./db/
COPY content/ ./content/
COPY workers/ ./workers/
COPY init.sql ./
COPY migrations/ ./

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
