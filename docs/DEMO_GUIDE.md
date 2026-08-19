# Astra GRC Demo Guide

## 5-minute demo flow

### Prerequisites

- Docker running
- `POSTGRES_PASSWORD=cortex-dev docker compose up -d postgres`
- Schema applied (`bash scripts/apply_cortex_schema.sh`)
- API on `:8000`, frontend: `cd frontend && npm run dev`
- Open http://localhost:3000 in incognito

### Flow 1 — Sign in (30 seconds)

1. http://localhost:3000 → sign in with `admin@astralabs.com` / `admin`
2. You land on **Audit Simulator** (`/audit-simulator`)
3. Product name: **Astra GRC** Community Edition — paper-white UI, navy chrome

**Talking point:** “This is adversarial simulation, not a slide deck. You pick the frame, then you decide under pressure.”

### Flow 2 — Frame an audit (1 min)

1. Step A — choose **ISO 27001:2022** (GDPR is enabled; SOC 2 shows Coming Soon)
2. Step B — choose an audit type: New Audit, Routine Inspection, Post-Incident Review, or Targeted Investigation
3. Click **Run Assessment** → Learning Loop (`/learning`)

**Talking point:** “The simulator sets the rehearsal. The Learning Loop is where judgment is scored.”

### Flow 3 — Run a scenario (2 min)

1. Start **CX-1001** (Friday Cutover) if you are showing the loop for the first time
2. Read the brief and the agent message
3. Make a decision — competency bars update after the first choice
4. Finish the scenario and open the debrief (reference answer, ISO controls, four dimensions)

**Talking point:** “Wrong answers are not trivia misses. They are the failure modes an auditor would write up.”

### Flow 4 — Progression (1 min)

1. **My Progress** (`/progress`) — competency over sessions
2. **Control Gaps** (`/findings`) — weak dimensions become findings
3. **Evidence Vault** (`/evidence`) — hash-chained decision trail

**Talking point:** “Train produces gaps. Gaps drive remediation. Remediation produces evidence. One product, not four tabs.”

## Key messages

| Question | Answer |
|----------|--------|
| How is this different? | Adversarial simulation graded against framework controls — not recall quizzes |
| Who uses this? | Security leads, GRC practitioners, and teams building audit judgment |
| What ships today? | Five ISO 27001:2022 scenarios, four competency dimensions, community edition |
| When can we start? | Demo running today. Register or use `admin@astralabs.com` / `admin` |
