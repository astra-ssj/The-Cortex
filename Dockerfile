# CORTEX API — Dockerfile for compliance API (uvicorn).
# Build: docker build -t cortex-api .
# Run: docker run -p 8000:8000 -e POSTGRES_PASSWORD=... -e DATABASE_URL=... cortex-api

FROM python:3.12-slim

WORKDIR /app

# Install project and runtime deps (no dev).
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e . "uvicorn[standard]>=0.27"

COPY api/ ./api/
COPY core/ ./core/
COPY compliance/ ./compliance/
COPY db/ ./db/
COPY services/ ./services/
COPY init.sql ./
COPY migrations/ ./

# Compliance engine app lives under services/compliance-engine; api/main adds it to path.
ENV PYTHONPATH=/app:/app/services/compliance-engine
EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
