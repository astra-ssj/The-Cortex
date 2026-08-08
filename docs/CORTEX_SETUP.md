# CORTEX — Cursor setup & first session

One-time Cursor configuration and how to use Composer for every multi-file change.

---

## Checklist before your first CORTEX session

| Item | Status | Where |
|------|--------|--------|
| Privacy Mode | ✅ ON | Cursor Settings |
| `.cursorrules` | ✅ | Repo root |
| `.cursorignore` | ✅ | Repo root |
| Default model | ✅ claude-sonnet-4-6 | Cursor Settings → Models |
| Composer context | ⬜ **Codebase** | Cursor Settings → Features → Composer |
| Auto Run Mode | ⬜ **OFF** | Cursor Settings → Features → Agent |
| Repo on GitHub & indexed | ⬜ | Push repo, let Cursor index |

**Composer:** Enable **“Always show composer”** and set **Composer context → Codebase** (not just current file).

**Agent:** Set **Auto Run Mode → OFF**. Every terminal command is then proposed first; you approve or reject. Human-in-the-loop, as in ZTAIP.

---

## Composer workflow (multi-file changes)

Composer is for every multi-file feature or refactor.

1. **Open Composer**  
   `Cmd+Shift+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux).

2. **Write a concrete spec and tag pattern files with `@filename`**  
   Example:

   ```
   Add the GDPR framework to the compliance engine.
   Follow the exact pattern in @nist_csf.py.
   Register it in @registry.py.
   Add the framework ID to the FrameworkId enum in @compliance.py.
   Write 3 pytest tests covering: framework loads successfully,
   all controls have at least one requirement, all requirements
   have at least one evidence_type.
   ```

   The `@filename` references are critical — always tag the pattern files you want Cursor to follow.

3. **Review the diff**  
   Cursor will propose changes across the relevant files. Review, then approve or ask for edits.

---

## First Composer prompt after setup

Once the repo is indexed, open Composer and run:

```
@codebase I need to add the GDPR framework next.
Show me the current state of the framework registry
and confirm you understand the pattern before I give
you the build instruction.
```

Then give the full build instruction (as in the example above) when you’re ready.

---

## Clone and open the repo (new machine)

In Cursor’s terminal (`Ctrl+\`` or **View → Terminal**):

```bash
git clone https://github.com/AstraLabs-AI/The-Cortex
cd The-Cortex
```

Then **File → Open Folder** and select the `The-Cortex` folder (or open it from the command line so Cursor opens that folder).

---

## Let Cursor index the repo

Once the folder is open, Cursor starts indexing automatically. You’ll see a progress indicator in the bottom bar. **Wait for indexing to finish** before using your first Agent session — that’s what makes `@codebase` work accurately.

---

## What the GitHub connection is for

- Cloning and pushing via the **Source Control** panel
- **@codebase** indexing across the full repo
- Agent being able to read any file when you use **@filename**

---

## Daily workflow once connected

```
Start session
    ↓
Cmd+I → Composer → Agent mode
    ↓
Build something with Cursor
    ↓
Review the diff
    ↓
Cursor’s terminal:
  git add .
  git commit -m "feat: add GDPR framework"
  git push
    ↓
GitHub CI pipeline runs automatically
```

You can also use Cursor’s **Source Control** panel (`Ctrl+Shift+G`) to stage, commit, and push — same as VS Code’s git panel.

---

## One thing to configure after connecting

**Branch protection on GitHub** so neither you nor Cursor can push directly to `main`:

1. **GitHub** → **The-Cortex** repo → **Settings** → **Branches**
2. **Add branch protection rule**
3. **Branch name pattern:** `main`
4. **Require a pull request before merging** → ON
5. **Require status checks to pass** → ON (your CI pipeline)

Then work on feature branches and merge via PRs.

---

## Local API (uvicorn)

From the repo root (editable install or ``PYTHONPATH=.``):

```bash
export PYTHONPATH=.
uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
# or: bash scripts/run-api.sh
```

Connectors, ingest, and Shasta adapters live under **`core/connectors/`** and **`core/ingestion/`** — no nested compliance-engine path is required.

**Shasta `POST /api/v1/shasta/scans`** enqueues a run and returns immediately with `status: "running"`; poll **`GET /api/v1/shasta/scans?org_id=...`** (or **`GET /api/v1/shasta/scans/{scan_run_id}`**) until the row is `completed` or `failed` (see `error_message` when failed).

Local / CI Postgres bootstrap via **`scripts/apply_cortex_schema.sh`** includes **`migrations/009_shasta_cloud.sql`** (same order as `docker-compose` init scripts), so Shasta tables exist without a separate manual step when you use that script.

**One-shot local check (Docker + schema + Shasta pytest):** `bash scripts/verify_shasta_stack.sh` — ephemeral Postgres on **:5433**, applies schema, probes **`shasta_*`** tables, runs **`tests/test_api_shasta_cloud.py`** (same assumptions as CI **`backend-tests`**).

### Manual Shasta job lifecycle (pytest does not cover BackgroundTasks → DB end-to-end)

Use when validating **running → completed/failed** against a real uvicorn (not TestClient):

1. Apply **`migrations/009_shasta_cloud.sql`** to your Postgres; **`export PYTHONPATH="."`**.
2. **`pip install -e ".[shasta-scan,aws,azure]"`** (or omit cloud extras if only testing mock).
3. Connect AWS/Azure via **`POST /api/v1/connectors/aws/connect`** (or Azure) so stored credentials exist — **or** set **`CORTEX_SHASTA_MOCK=1`** for a synthetic finding row without cloud access (**never** in production).
4. Obtain a JWT (**login** or **`create_access_token`** in dev); **`POST /api/v1/shasta/scans`** with `{"cloud":"aws","org_id":"demo-org-001"}`.
5. Poll **`GET /api/v1/shasta/scans?org_id=...`** or **`GET /api/v1/shasta/scans/{id}?org_id=...`** until **`status`** is **`completed`** or **`failed`**; check **`error_message`** on failure.
6. Open **Cloud scans** in the UI or call **`GET /api/v1/shasta/findings`** for org-wide rows; use per-run **Findings** in the table for a single **`scan_run_id`**.

**HTTP smoke (mock scan, subprocess API):** `CORTEX_SHASTA_MOCK=1 bash scripts/smoke_shasta_http.sh` — starts uvicorn on port **8899**, posts a scan, polls until **`completed`**. Requires **`DATABASE_URL`** and schema **009**.

### Optional Redis queue (multi-replica API / survive API restarts)

When **`REDIS_URL`** (or **`SHASTA_REDIS_URL`**) is set and **`pip install -e ".[redis-queue]"`** is installed, **`POST /api/v1/shasta/scans`** **LPUSH**es a job and returns **`delivery: "redis"`**. Run a consumer:

```bash
export PYTHONPATH=.
export REDIS_URL=redis://localhost:6379/0
python workers/shasta_worker.py
```

**Docker Compose:** `docker compose --profile queue up -d` starts **redis** + **shasta-worker**; set **`REDIS_URL=redis://redis:6379/0`** on the **api** service so enqueue matches the worker.

### Assessment SSE (Run Assessment)

The UI uses **`@microsoft/fetch-event-source`** with **`Authorization: Bearer`** — the stream URL **does not** embed the JWT in the query string. Backend **`get_current_user_optional`** accepts **header first**, then query **`token`** for legacy clients.

## Shasta cloud scan contract (operators)

- **Canonical:** `GET /api/v1/shasta/contract` — machine-readable install/subprocess contract.
- **Legacy alias:** `GET /api/v1/connectors/shasta/contract` — same payload as the canonical URL (prefer `/api/v1/shasta/contract`).

## Docker API image (`Dockerfile`)

The API Dockerfile copies **`api/`, `core/`, `compliance/`, `ontology/`** and **`docs/CORTEX_SETUP.md`** (pyproject `readme`) before **`pip install -e ".[shasta-scan,aws,azure]"`** so the editable install succeeds. It installs **`git`** (Shasta is a git dependency), plus **`build-essential`**, **`pkg-config`**, **`libcairo2-dev`** so **`pycairo`** can build (transitive via Shasta’s PDF stack). Runtime layers then add **`db/`**, **`services/`**, and the single **`migrations/`** lane.
