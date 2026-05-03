import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

export type AuditTypeId = "routine" | "post_incident" | "targeted";

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

type AuditQuestion = {
  text: string;
  article: string;
  risk: RiskLevel;
  why: string;
};

type ExposureRow = {
  framework: string;
  maxFine: string;
  likelyFine: string;
  basis: string;
};

type PriorityAction = {
  action: string;
  article: string;
  effortDays: number;
  ownerRole: string;
};

type ScenarioResult = {
  regulatorLabel: string;
  jurisdictionBadge: string;
  enforcementPersonality: string;
  enforcementDecisionCount: number;
  questions: AuditQuestion[];
  evidenceWeaknesses: string[];
  exposureRows: ExposureRow[];
  postureNote: string;
  priorityActions: PriorityAction[];
};

const REGULATORS = [
  { id: "bsi", label: "BSI (Bundesamt für Sicherheit) — Germany" },
  { id: "cnil", label: "CNIL (Commission Nationale) — France" },
  { id: "ico", label: "ICO (Information Commissioner) — UK" },
  { id: "garante", label: "Garante — Italy" },
  { id: "aepd", label: "AEPD (Agencia Española) — Spain" },
  { id: "bfdi", label: "BfDI (Bundesbeauftragter) — Germany/GDPR" },
  { id: "eu_ai_office", label: "EU AI Office — EU AI Act" },
  { id: "enisa", label: "ENISA — NIS2 Technical Authority" },
] as const;

const FRAMEWORKS = [
  { id: "nis2", label: "NIS2 Directive" },
  { id: "gdpr", label: "GDPR 2016/679" },
  { id: "eu_ai_act", label: "EU AI Act 2024" },
  { id: "iso27001", label: "ISO/IEC 27001:2022" },
] as const;

const ENTITIES = [
  { id: "de", label: "AstraLabs DE (Essential Entity)" },
  { id: "es", label: "AstraLabs ES (Essential Entity)" },
  { id: "uk", label: "AstraLabs UK (Important Entity)" },
  { id: "group", label: "AstraLabs Group (All Entities)" },
] as const;

function scenarioKey(regulator: string, framework: string, entity: string): string {
  return `${regulator}:${framework}:${entity}`;
}

/** Minimum four curated combinations plus sensible defaults for other selections */
const SCENARIOS: Record<string, ScenarioResult> = {
  [scenarioKey("bsi", "nis2", "de")]: {
    regulatorLabel: "BSI — Bundesamt für Sicherheit in der Informationstechnik",
    jurisdictionBadge: "Germany · NIS2 NCA",
    enforcementPersonality:
      "BSI is Germany's national cybersecurity authority and NIS2 NCA. Known for technical rigour, mandatory incident reporting, and zero tolerance for missing CSIRT registration. Issued 12 formal orders in 2024.",
    enforcementDecisionCount: 184,
    questions: [
      {
        text: "Can you demonstrate your 24-hour early warning procedure for significant incidents?",
        article: "NIS2 Art.23(4)(a)",
        risk: "HIGH",
        why: "No tested procedure found in assessment results",
      },
      {
        text: "Show your NIS2 registration with BSI Meldestelle. What is your registration number?",
        article: "NIS2 Art.27",
        risk: "HIGH",
        why: "Registration not confirmed in entity profile",
      },
      {
        text: "Provide your supply chain security assessment for ICT service providers.",
        article: "NIS2 Art.21(2)(d)",
        risk: "HIGH",
        why: "No supply chain assessment on record",
      },
      {
        text: "Who is your designated NIS2 point of contact at BSI?",
        article: "NIS2 Art.27(3)",
        risk: "MEDIUM",
        why: "Contact not registered",
      },
      {
        text: "What is your board's documented approval of cybersecurity risk-management measures?",
        article: "NIS2 Art.20(1)",
        risk: "HIGH",
        why: "No management approval records in evidence vault",
      },
    ],
    evidenceWeaknesses: [
      "No tested breach notification procedure — GDPR Art.33(1) compliance cannot be demonstrated",
      "Penetration test 18 months overdue — ISO 27001 A.8.8 evidence stale",
      "Incident playbooks not exercised with executive sponsors — NIS2 Art.21(2)(c) accountability gap",
      "Vendor SOC reports missing for two Tier-1 processors — supply chain evidence incomplete",
    ],
    exposureRows: [
      {
        framework: "NIS2",
        maxFine: "€10M",
        likelyFine: "€2.4M",
        basis: "Art.34(4), AstraLabs DE score 54%",
      },
      {
        framework: "GDPR",
        maxFine: "€20M",
        likelyFine: "€3.1M",
        basis: "Art.83(4), blended posture 54%",
      },
    ],
    postureNote: "AstraLabs DE posture score 54%",
    priorityActions: [
      {
        action: "Execute tabletop + technical runbook test for 24h early warning and document outcomes.",
        article: "NIS2 Art.23(4)(a)",
        effortDays: 10,
        ownerRole: "CISO",
      },
      {
        action: "Complete BSI Meldestelle registration and archive acknowledgement in evidence vault.",
        article: "NIS2 Art.27",
        effortDays: 14,
        ownerRole: "Legal / DPO",
      },
      {
        action: "Commission refreshed penetration test and map findings to ISO 27001 Annex A.",
        article: "ISO 27001 A.8.8",
        effortDays: 21,
        ownerRole: "Security Engineering",
      },
    ],
  },
  [scenarioKey("bfdi", "gdpr", "de")]: {
    regulatorLabel: "BfDI — Federal Commissioner for Data Protection and Freedom of Information",
    jurisdictionBadge: "Germany · GDPR",
    enforcementPersonality:
      "BfDI (Federal Commissioner for Data Protection) focuses on public sector, telco, and cross-border data flows. Post-Schrems II transfer mechanisms are a recurring enforcement theme.",
    enforcementDecisionCount: 212,
    questions: [
      {
        text: "Provide your Transfer Impact Assessment for personal data sent to US processors.",
        article: "GDPR Art.46, Schrems II",
        risk: "HIGH",
        why: "Processor inventory lists US sub-processors without refreshed TIAs",
      },
      {
        text: "Show your tested 72-hour breach notification procedure.",
        article: "GDPR Art.33(1)",
        risk: "HIGH",
        why: "Procedure documented but last drill >18 months ago",
      },
      {
        text: "List all processors under Art.28 DPAs. Are any outside the EEA?",
        article: "GDPR Art.28(3)",
        risk: "MEDIUM",
        why: "Incomplete processor register vs billing records",
      },
      {
        text: "What is your DPIA register? Which processing activities have been assessed in the last 12 months?",
        article: "GDPR Art.35",
        risk: "MEDIUM",
        why: "Profiling use cases lack DPIA references",
      },
      {
        text: "How do you respond to data subject access requests within 30 days?",
        article: "GDPR Art.15",
        risk: "LOW",
        why: "SLA metrics not published internally",
      },
    ],
    evidenceWeaknesses: [
      "No tested breach notification procedure — GDPR Art.33(1) compliance cannot be demonstrated",
      "Schrems II supplementary measures packet stale for key SaaS vendor — transfer risk undocumented",
      "RoPA version control gaps — cannot prove annual review per Art.30",
      "Employee privacy notices not updated after hybrid-work policy change",
    ],
    exposureRows: [
      {
        framework: "GDPR",
        maxFine: "€20M",
        likelyFine: "€3.2M",
        basis: "Art.83(4), GDPR score 58%",
      },
      {
        framework: "NIS2",
        maxFine: "€10M",
        likelyFine: "€2.0M",
        basis: "Art.34(4), correlated cyber posture",
      },
    ],
    postureNote: "BfDI-relevant GDPR posture score 58%",
    priorityActions: [
      {
        action: "Refresh TIAs and SCCs for all US-bound flows; legal sign-off in audit trail.",
        article: "GDPR Art.46",
        effortDays: 14,
        ownerRole: "DPO",
      },
      {
        action: "Run red-team breach simulation and produce regulator-ready Art.33 timeline.",
        article: "GDPR Art.33(1)",
        effortDays: 7,
        ownerRole: "CISO",
      },
      {
        action: "Reconcile processor inventory with finance and publish authoritative Art.28 matrix.",
        article: "GDPR Art.28",
        effortDays: 10,
        ownerRole: "Privacy Ops",
      },
    ],
  },
  [scenarioKey("eu_ai_office", "eu_ai_act", "group")]: {
    regulatorLabel: "EU AI Office",
    jurisdictionBadge: "European Union · AI Act",
    enforcementPersonality:
      "The EU AI Office, established under the AI Act, is the primary enforcement authority for GPAI models and cross-border high-risk AI systems. August 2026 deadline for high-risk obligations. Currently in guidance-intensive pre-enforcement phase.",
    enforcementDecisionCount: 47,
    questions: [
      {
        text: "Provide your AI system inventory. Which systems are classified as high-risk under Annex III?",
        article: "EU AI Act Art.49",
        risk: "HIGH",
        why: "Inventory coverage gaps for shadow SaaS AI features",
      },
      {
        text: "Show Annex IV technical documentation for each high-risk AI system.",
        article: "EU AI Act Art.11",
        risk: "HIGH",
        why: "No Annex IV packs linked to production IDs",
      },
      {
        text: "Demonstrate your human oversight mechanism for automated decisions.",
        article: "EU AI Act Art.14",
        risk: "HIGH",
        why: "Workflow approvals not mapped to human review checkpoints",
      },
      {
        text: "What automatic logging is in place for high-risk AI system events?",
        article: "EU AI Act Art.12",
        risk: "HIGH",
        why: "Telemetry retention policy below regulatory expectation",
      },
      {
        text: "Has a Fundamental Rights Impact Assessment been conducted for high-risk deployer use cases?",
        article: "EU AI Act Art.27",
        risk: "MEDIUM",
        why: "FRIA drafts missing for two candidate deployments",
      },
    ],
    evidenceWeaknesses: [
      "No AI bill of materials spanning subsidiaries — EU AI Act traceability incomplete",
      "Model cards absent for internally fine-tuned assistants — Annex IV gap",
      "No unified logging schema for AI inference events — monitoring blind spots",
    ],
    exposureRows: [
      {
        framework: "EU AI Act",
        maxFine: "€35M",
        likelyFine: "€8.4M",
        basis: "Art.99(3), AI score 41%",
      },
      {
        framework: "GDPR",
        maxFine: "€20M",
        likelyFine: "€4.6M",
        basis: "Art.83(4), overlapping personal data in AI pipelines",
      },
    ],
    postureNote: "Group AI governance score 41%",
    priorityActions: [
      {
        action: "Stand up federated AI inventory with Annex III classification rationale per system.",
        article: "EU AI Act Art.49",
        effortDays: 20,
        ownerRole: "Chief Data Officer",
      },
      {
        action: "Produce Annex IV documentation template and populate for top 5 high-risk systems.",
        article: "EU AI Act Art.11",
        effortDays: 30,
        ownerRole: "ML Platform Lead",
      },
      {
        action: "Implement immutable audit logs with 24-month retention for high-risk AI workloads.",
        article: "EU AI Act Art.12",
        effortDays: 25,
        ownerRole: "Security Engineering",
      },
    ],
  },
  [scenarioKey("ico", "gdpr", "uk")]: {
    regulatorLabel: "ICO — Information Commissioner's Office",
    jurisdictionBadge: "United Kingdom · UK GDPR",
    enforcementPersonality:
      "ICO is the UK data protection authority post-Brexit, enforcing UK GDPR and the Data Protection Act 2018. Known for pragmatic enforcement, sector-specific guidance, and a strong focus on accountability documentation.",
    enforcementDecisionCount: 163,
    questions: [
      {
        text: "Show your Article 30 Records of Processing Activities (ROPA). When was it last reviewed?",
        article: "UK GDPR Art.30",
        risk: "HIGH",
        why: "Last formal ROPA review stamp older than policy threshold",
      },
      {
        text: "What is your lawful basis for each major processing activity?",
        article: "UK GDPR Art.6",
        risk: "MEDIUM",
        why: "Marketing journeys missing lawful basis matrix",
      },
      {
        text: "Provide evidence of staff data protection training completion.",
        article: "UK GDPR Art.39",
        risk: "LOW",
        why: "Completion metrics not aggregated centrally",
      },
      {
        text: "Show your data breach log and last notified incident.",
        article: "UK GDPR Art.33",
        risk: "HIGH",
        why: "Post-mortems not consistently filed",
      },
    ],
    evidenceWeaknesses: [
      "No tested breach notification procedure aligned to ICO guidance — UK GDPR Art.33 weak spot",
      "Privacy policies inconsistent across brands — accountability documentation fragmented",
      "International transfers rely on legacy clauses pending refresh — transfer risk evidence thin",
    ],
    exposureRows: [
      {
        framework: "UK GDPR",
        maxFine: "£17.5M",
        likelyFine: "£2.1M",
        basis: "DPA 2018 s.157, score 48%",
      },
      {
        framework: "NIS2 (EU baseline)",
        maxFine: "€10M",
        likelyFine: "€2.2M",
        basis: "Art.34(4), correlated posture",
      },
    ],
    postureNote: "AstraLabs UK posture score 48%",
    priorityActions: [
      {
        action: "Complete ROPA refresh with business-owner attestations and ICO-aligned retention schedules.",
        article: "UK GDPR Art.30",
        effortDays: 12,
        ownerRole: "DPO",
      },
      {
        action: "Codify lawful basis per journey and publish internal DPIA triggers.",
        article: "UK GDPR Art.6 & Art.35",
        effortDays: 10,
        ownerRole: "Privacy Lead",
      },
      {
        action: "Normalize breach log, run ICO-style tabletop, file lessons learned.",
        article: "UK GDPR Art.33",
        effortDays: 8,
        ownerRole: "Incident Response Lead",
      },
    ],
  },
};

function genericScenario(regulatorId: string, frameworkId: string, entityId: string): ScenarioResult {
  const reg = REGULATORS.find((r) => r.id === regulatorId)?.label ?? regulatorId;
  const fw = FRAMEWORKS.find((f) => f.id === frameworkId)?.label ?? frameworkId;
  const ent = ENTITIES.find((e) => e.id === entityId)?.label ?? entityId;
  const score = entityId === "group" ? 52 : entityId === "uk" ? 48 : 55;
  const likelyNis2 = "€2.1M";
  const likelyGdpr = "€2.8M";

  return {
    regulatorLabel: (reg.split("—")[0] ?? reg).trim(),
    jurisdictionBadge: "Demo scenario · mock posture",
    enforcementPersonality: `${reg} operates under ${fw}. This projection blends published guidance with typical supervisory priorities for ${ent}. Replace with Epic 3 enrichment for jurisdiction-specific enforcement corpora.`,
    enforcementDecisionCount: 96,
    questions: [
      {
        text: `Demonstrate how ${fw} controls are operationalised day-to-day for ${ent}.`,
        article: `${fw.split(" ")[0]} — accountability`,
        risk: "HIGH",
        why: "Operational evidence sparse vs policy library",
      },
      {
        text: "Provide senior management attestation of residual risk acceptance.",
        article: "Governance — board accountability",
        risk: "MEDIUM",
        why: "Approval trail incomplete for last risk acceptance cycle",
      },
      {
        text: "Show monitoring metrics proving control effectiveness over the past quarter.",
        article: "Continuous assurance",
        risk: "MEDIUM",
        why: "Telemetry exports not mapped to control IDs",
      },
      {
        text: "Outline third-party assurance coverage and sampling methodology.",
        article: "Supply chain assurance",
        risk: "LOW",
        why: "Assurance calendar misaligned with procurement renewals",
      },
    ],
    evidenceWeaknesses: [
      "No tested breach notification procedure — cross-framework continuity gap",
      "Penetration test evidence stale relative to policy cadence — ISO 27001 A.8.8 exposure",
      "Incident drills missing executive participation — crisis governance gap",
    ],
    exposureRows: [
      { framework: "NIS2", maxFine: "€10M", likelyFine: likelyNis2, basis: `Art.34(4), score ${score}%` },
      { framework: "GDPR", maxFine: "€20M", likelyFine: likelyGdpr, basis: `Art.83(4), score ${score}%` },
    ],
    postureNote: `Blended posture score ${score}%`,
    priorityActions: [
      {
        action: "Publish control-to-evidence matrix with owners and refresh SLA.",
        article: "Audit readiness",
        effortDays: 9,
        ownerRole: "GRC Lead",
      },
      {
        action: "Automate evidence pulls from primary IdP and cloud logging.",
        article: "Tech assurance",
        effortDays: 14,
        ownerRole: "Security Engineering",
      },
      {
        action: "Schedule regulator-style mock interview with documentation pack.",
        article: "Simulation hygiene",
        effortDays: 5,
        ownerRole: "Legal",
      },
    ],
  };
}

function riskColor(risk: RiskLevel): string {
  switch (risk) {
    case "HIGH":
      return "var(--red)";
    case "MEDIUM":
      return "var(--amber)";
    default:
      return "var(--green)";
  }
}

export function AuditSimulator() {
  const [regulator, setRegulator] = useState<string>("bsi");
  const [framework, setFramework] = useState<string>("nis2");
  const [entity, setEntity] = useState<string>("de");
  const [auditType, setAuditType] = useState<AuditTypeId>("routine");
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const result = useMemo(() => {
    const key = scenarioKey(regulator, framework, entity);
    return SCENARIOS[key] ?? genericScenario(regulator, framework, entity);
  }, [regulator, framework, entity]);

  const runSimulation = () => {
    setRan(false);
    setShowResults(false);
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setRan(true);
      setShowResults(true);
    }, 1500);
  };

  const exportReport = useCallback(() => {
    const auditLabel =
      auditType === "routine"
        ? "Routine Inspection"
        : auditType === "post_incident"
          ? "Post-Incident Review"
          : "Targeted Investigation";

    const lines = [
      "CORTEX — Counterfactual Audit Simulation Report",
      "==============================================",
      "",
      `Regulator: ${result.regulatorLabel}`,
      `Jurisdiction: ${result.jurisdictionBadge}`,
      `Framework: ${FRAMEWORKS.find((f) => f.id === framework)?.label}`,
      `Entity: ${ENTITIES.find((e) => e.id === entity)?.label}`,
      `Audit type: ${auditLabel}`,
      "",
      "Regulator profile",
      "-----------------",
      result.enforcementPersonality,
      "",
      `Likely audit questions (based on ${result.enforcementDecisionCount} enforcement decisions)`,
      "-------------------------------------------------------------------",
      ...result.questions.map(
        (q, i) =>
          `${i + 1}. ${q.text}\n   Article: ${q.article} | Risk: ${q.risk}\n   Why: ${q.why}`,
      ),
      "",
      "Weak evidence items",
      "-------------------",
      ...result.evidenceWeaknesses.map((w) => `⚠ ${w}`),
      "",
      "Estimated exposure",
      "-------------------",
      ...result.exposureRows.map(
        (r) => `${r.framework} | Max ${r.maxFine} | Likely ${r.likelyFine} | ${r.basis}`,
      ),
      "",
      "Priority actions",
      "----------------",
      ...result.priorityActions.map(
        (a, i) =>
          `${i + 1}. ${a.action}\n   ${a.article} · ${a.effortDays}d · ${a.ownerRole}`,
      ),
      "",
      result.postureNote,
      "",
      "--- End of report ---",
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cortex-audit-simulation-${regulator}-${framework}-${entity}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [auditType, entity, framework, regulator, result]);

  const panelStyle: CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 12,
    padding: 20,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--dim)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 8,
    display: "block",
  };

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "stretch", flexWrap: "wrap" }}>
      <section style={{ flex: "1 1 340px", maxWidth: "100%", ...panelStyle }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700 }}>Configure Simulation</h2>
        <p style={{ margin: "0 0 20px", fontSize: 12, color: "var(--dim)", lineHeight: 1.5 }}>
          Select regulator, framework, and entity to simulate an audit
        </p>

        <label htmlFor="intel-regulator" style={labelStyle}>
          Regulator
        </label>
        <select
          id="intel-regulator"
          value={regulator}
          onChange={(e) => setRegulator(e.target.value)}
          style={{
            width: "100%",
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 13,
          }}
        >
          {REGULATORS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>

        <label htmlFor="intel-framework" style={labelStyle}>
          Framework
        </label>
        <select
          id="intel-framework"
          value={framework}
          onChange={(e) => setFramework(e.target.value)}
          style={{
            width: "100%",
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 13,
          }}
        >
          {FRAMEWORKS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>

        <label htmlFor="intel-entity" style={labelStyle}>
          Entity
        </label>
        <select
          id="intel-entity"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          style={{
            width: "100%",
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 13,
          }}
        >
          {ENTITIES.map((en) => (
            <option key={en.id} value={en.id}>
              {en.label}
            </option>
          ))}
        </select>

        <span style={labelStyle}>Audit Type</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {(
            [
              { id: "routine" as const, label: "Routine Inspection" },
              { id: "post_incident" as const, label: "Post-Incident Review" },
              { id: "targeted" as const, label: "Targeted Investigation" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
              <input
                type="radio"
                name="audit-type"
                checked={auditType === opt.id}
                onChange={() => setAuditType(opt.id)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={runSimulation}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px 18px",
            borderRadius: 10,
            border: "none",
            cursor: loading ? "wait" : "pointer",
            fontWeight: 700,
            fontSize: 14,
            color: "var(--bg)",
            background: loading
              ? "color-mix(in srgb, var(--cyan) 30%, black)"
              : "linear-gradient(135deg, var(--cyan), color-mix(in srgb, var(--cyan) 80%, black))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            opacity: loading ? 0.85 : 1,
          }}
        >
          {loading ? (
            <>
              <span
                style={{
                  width: 18,
                  height: 18,
                  border: "2px solid color-mix(in srgb, var(--bg) 25%, transparent)",
                  borderTopColor: "var(--bg)",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Simulating...
            </>
          ) : (
            <>▶ Run Audit Simulation</>
          )}
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </section>

      <section style={{ flex: "1.5 1 480px", minWidth: 280, ...panelStyle }}>
        {!ran ? (
          <div
            style={{
              minHeight: 420,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 24,
              color: "var(--dim)",
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 16 }} aria-hidden>
              🔍
            </div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-secondary)", maxWidth: 360 }}>
              Configure and run a simulation to see what a regulator would find
            </p>
            <p style={{ margin: "12px 0 0", fontSize: 12, maxWidth: 380, lineHeight: 1.6 }}>
              Grounded in published enforcement decisions and regulatory guidance
            </p>
          </div>
        ) : (
          showResults && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <AnimatedSection delayMs={0}>
                <div
                  style={{
                    borderLeft: "4px solid var(--cyan)",
                    paddingLeft: 16,
                    background: "var(--bg)",
                    borderRadius: 8,
                    padding: 16,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{result.regulatorLabel}</h3>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: "color-mix(in srgb, var(--blue) 20%, transparent)",
                        color: "var(--cyan)",
                      }}
                    >
                      {result.jurisdictionBadge}
                    </span>
                  </div>
                  <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.65, color: "var(--text-secondary)" }}>
                    <strong style={{ color: "var(--text)" }}>Enforcement personality — </strong>
                    {result.enforcementPersonality}
                  </p>
                </div>
              </AnimatedSection>

              <div>
                <AnimatedSection delayMs={200}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 15 }}>Likely Audit Questions</h3>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "4px 10px",
                        borderRadius: 6,
                        background: "var(--border)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Based on {result.enforcementDecisionCount} enforcement decisions
                    </span>
                  </div>
                </AnimatedSection>
                <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                  {result.questions.map((q, idx) => (
                    <AnimatedQuestion key={`${q.article}-${idx}`} delayMs={200 + idx * 100}>
                      <li style={{ listStylePosition: "outside" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 6 }}>
                          {q.text}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                          <span
                            style={{
                              fontSize: 11,
                              padding: "3px 8px",
                              borderRadius: 6,
                              background: "color-mix(in srgb, var(--cyan) 15%, transparent)",
                              color: "var(--cyan)",
                            }}
                          >
                            {q.article}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: riskColor(q.risk) }}>
                            {q.risk}
                          </span>
                        </div>
                        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--dim)", lineHeight: 1.5 }}>
                          {q.why}
                        </p>
                      </li>
                    </AnimatedQuestion>
                  ))}
                </ol>
              </div>

              <AnimatedSection delayMs={600}>
                <div>
                  <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Weak Evidence Items</h3>
                  <div
                    style={{
                      borderLeft: "4px solid var(--red)",
                      padding: 16,
                      borderRadius: 8,
                      background: "var(--bg)",
                    }}
                  >
                    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                      {result.evidenceWeaknesses.map((w) => (
                        <li key={w} style={{ fontSize: 13, color: "var(--red)", lineHeight: 1.55 }}>
                          ⚠ {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </AnimatedSection>

              <AnimatedSection delayMs={800}>
                <div>
                  <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Estimated Exposure</h3>
                  <div
                    style={{
                      borderLeft: "4px solid var(--amber)",
                      padding: 16,
                      borderRadius: 8,
                      background: "var(--bg)",
                      overflowX: "auto",
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ color: "var(--dim)", textAlign: "left" }}>
                          <th style={{ padding: "8px 10px 8px 0" }}>Framework</th>
                          <th style={{ padding: "8px 10px" }}>Max Fine</th>
                          <th style={{ padding: "8px 10px" }}>Likely Fine</th>
                          <th style={{ padding: "8px 10px" }}>Basis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.exposureRows.map((row) => (
                          <tr key={row.framework} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "10px 10px 10px 0", fontWeight: 600 }}>{row.framework}</td>
                            <td style={{ padding: "10px" }}>{row.maxFine}</td>
                            <td style={{ padding: "10px", color: "var(--amber)" }}>{row.likelyFine}</td>
                            <td style={{ padding: "10px", color: "var(--text-secondary)", fontSize: 12 }}>{row.basis}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </AnimatedSection>

              <AnimatedSection delayMs={1000}>
                <div>
                  <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Priority Actions Before Audit</h3>
                  <div
                    style={{
                      borderLeft: "4px solid var(--green)",
                      padding: 16,
                      borderRadius: 8,
                      background: "var(--bg)",
                    }}
                  >
                    <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                      {result.priorityActions.map((a) => (
                        <li key={a.action} style={{ fontSize: 13, lineHeight: 1.55, color: "var(--green)" }}>
                          <strong style={{ color: "var(--text)" }}>{a.action}</strong>
                          <div style={{ marginTop: 6, fontSize: 12, color: "var(--green)" }}>
                            {a.article} · {a.effortDays} days · {a.ownerRole}
                          </div>
                        </li>
                      ))}
                    </ol>
                    <button
                      type="button"
                      onClick={exportReport}
                      style={{
                        marginTop: 18,
                        padding: "10px 16px",
                        borderRadius: 8,
                        border: "1px solid color-mix(in srgb, var(--green) 40%, transparent)",
                        background: "color-mix(in srgb, var(--green) 15%, transparent)",
                        color: "var(--green)",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Export Simulation Report
                    </button>
                  </div>
                </div>
              </AnimatedSection>
            </div>
          )
        )}
      </section>
    </div>
  );
}

function AnimatedSection({ delayMs, children }: { delayMs: number; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  if (!visible) {
    return (
      <div style={{ opacity: 0, transform: "translateY(12px)" }} aria-hidden>
        {children}
      </div>
    );
  }

  return <div className="intelligence-fade-in-up">{children}</div>;
}

function AnimatedQuestion({ delayMs, children }: { delayMs: number; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  if (!visible) {
    return (
      <div style={{ opacity: 0, transform: "translateY(12px)" }} aria-hidden>
        {children}
      </div>
    );
  }

  return <div className="intelligence-fade-in-up">{children}</div>;
}
