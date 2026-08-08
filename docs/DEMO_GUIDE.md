# CORTEX Demo Guide

## 5-Minute Demo Flow

### Prerequisites

- Docker running
- `POSTGRES_PASSWORD=cortex-dev docker compose up -d`
- `cd frontend && npm run dev`
- Open http://localhost:3000 in incognito

### Flow 1 — New Customer Registration (3 min)

1. http://localhost:3000 → "Create free account →"
2. Fill: Company name, DE jurisdiction, industry, name, email, password
3. Submit → /onboarding
4. Step 1: Multi-Entity, add 2 entities (DE + UK)
5. Step 2: GDPR + NIS2 + EU AI Act pre-ticked
6. Step 3: Click "Run First Assessment"
   → Full-screen animated stream (8 seconds)
   → Stream lines with Art. citations
   → Score cards building on right
7. Dashboard loads with their org name

**Talking point:** "From zero to compliance intelligence in under 3 minutes."

### Flow 2 — Demo Toggle (30 seconds)

1. Click DEMO/LIVE toggle in navbar
2. Toggle ON → AstraLabs Group loads (58%)
3. Toggle OFF → New org loads (0% / not assessed)

**Talking point:** "Every customer gets their own isolated data. This is what a mature 6-entity deployment looks like."

### Flow 3 — Intelligence (2 min)

1. Click Intelligence in nav
2. Audit Simulator tab:
   - Select BSI + NIS2 + AstraLabs DE
   - Click Run Audit Simulation
   - Show: 5 questions with Art. citations
   - Show: €2.4M likely fine
3. Live Signals tab:
   - Watch signals fire every 8 seconds
   - Show score dropping on CRITICAL signals
   - Show NIS2 threshold monitor building

**Talking point:** "This is what BSI actually asks. This is your exposure. This is your posture changing in real time."

### Flow 4 — AI Systems (1 min)

1. Click AI Systems in nav
2. Show deadline banner: "94 days remaining"
3. Show HR Screening: HIGH RISK, Annex III(4)(a)
4. Click Classification → show ISO 42001 reasoning
5. Click Obligations → show Aug 2026 checklist

**Talking point:** "EU AI Act obligations apply in 94 days. Three of your systems need conformity assessment. Here's exactly what."

### Flow 5 — Audit Report (1 min)

1. Click Audit Report in nav
2. Click Generate Report
3. Show: 58% overall, NIS2 44% CRITICAL
4. Show: 10 findings with owners
5. Show: €2.4M NIS2 + €3.2M GDPR + €8.4M AI Act
6. Show: BOARD CONFIDENTIAL header

**Talking point:** "One click. Board-ready. This replaces 3 weeks of consultant work."

## Key Messages

| Question | Answer |
|----------|--------|
| How is this different? | EU-first, multi-entity, AI-native, €65M+ exposure tracked |
| Who uses this? | Group CISOs with 2-20 entities across EU jurisdictions |
| What does it cost? | £25-50K/year vs £150K+ legacy |
| When can we start? | Demo running today. 3-min setup. |
