# Astra GRC UI demo — social / investor recording guide

~60–90 second story: **frame an audit → decide under pressure → debrief against controls**.

## Before you record

1. Start stack: `docker compose up -d` (API + Postgres; schema applied via init / `apply_cortex_schema.sh`).
2. Frontend: `cd frontend && npm run dev` → http://localhost:3000
3. Login: **admin@astralabs.com** / **admin** (seeded demo admin; `admin` / `admin` is the same account).
4. You land on **Audit Simulator** (`/audit-simulator`) — paper-white UI.

## Demo file (bundled)

Use the repo fixture (reads well on camera):

`tests/fixtures/sample_breach_procedure.txt`

Copy to Desktop if you prefer dragging from Finder.

## Shot list (recommended order)

| # | Screen | Action | Line (optional voiceover) |
|---|--------|--------|---------------------------|
| 1 | Audit Simulator | Pick ISO 27001:2022 + New Audit → Run Assessment | “This is Astra GRC — adversarial simulation, not another spreadsheet.” |
| 2 | Remediation → **finding-001** | Open “72-hour breach notification procedure not tested” | “Every gap is a finding with owner and control context.” |
| 3 | Finding detail → **Attach evidence** | Upload `sample_breach_procedure.txt` | “Watch the document map to the ontology in real time.” |
| 4 | Same page | Point at success + evidence list + **View on compliance graph** | “Evidence is persisted — not a demo toast.” |
| 5 | **Compliance Graph** | Filter **Evidence**, select new node (green) | “One upload can prove multiple frameworks — test once, comply many.” |
| 6 | Audit report (optional) | Executive summary | “When the auditor asks, we export the pack.” |

## Recording tips

- **Resolution:** 1920×1080, 30fps; crop to 16:9 for LinkedIn/X.
- **Browser:** Zoom 110%, hide bookmarks bar. Astra GRC ships a **light** paper-white shell.
- **Mouse:** Slow moves; pause 2s on graph after upload.
- **Audio:** Short sentences; avoid reading control IDs aloud — say “breach notification” not “GDPR-BN-02”.
- **B-roll:** SSE progress bar during upload (shows “Mapping to ontology via …”).

## Post copy (templates)

**LinkedIn**

> We shipped the first closed loop in CORTEX: upload a policy → LLM maps it to your control ontology → evidence lands on the compliance graph. No integration required. Built on ZTAIP (circuit breakers, audit fabric, human review under 0.75 confidence).  
> #compliance #GRC #NIS2 #GDPR #AI

**X**

> Upload → map → graph. Manual evidence in CORTEX today. Integrations next.  
> [video]

## Troubleshooting on camera

| Issue | Fix |
|-------|-----|
| Upload 401 | Re-login; token expired |
| “Graph tables unavailable” | Run Postgres + migration 013 |
| Empty graph after upload | Refresh; confirm org `demo-org-001` |
| Stub mapping only | Expected without API keys; hint control still links from finding |

## What to say we’re *not* claiming yet

- Server-side PDF export (browser print today)
- Live Microsoft 365 sync (mock connector next)
- Scheduled assessments / email alerts

Keeps the demo credible.
