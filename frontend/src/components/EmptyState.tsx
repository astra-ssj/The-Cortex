interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  cta?: string;
  ctaSecondary?: string;
  onCta?: () => void;
  onCtaSecondary?: () => void;
  badge?: string;
  badgeColor?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  cta,
  ctaSecondary,
  onCta,
  onCtaSecondary,
  badge,
  badgeColor = "var(--cyan)",
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "64px 32px",
        textAlign: "center",
        minHeight: "360px",
      }}
    >
      {badge && (
        <div
          style={{
            display: "inline-block",
            padding: "3px 12px",
            borderRadius: "20px",
            background: `color-mix(in srgb, ${badgeColor} 13%, transparent)`,
            border: `1px solid color-mix(in srgb, ${badgeColor} 27%, transparent)`,
            color: badgeColor,
            fontSize: "10px",
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            letterSpacing: "2px",
            marginBottom: "20px",
          }}
        >
          {badge}
        </div>
      )}

      <div
        style={{
          fontSize: "48px",
          marginBottom: "20px",
          opacity: 0.7,
          filter: "grayscale(20%)",
        }}
      >
        {icon}
      </div>

      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontWeight: 700,
          fontSize: "18px",
          color: "var(--text)",
          marginBottom: "10px",
          maxWidth: "360px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "13px",
          color: "var(--muted)",
          lineHeight: 1.6,
          maxWidth: "440px",
          marginBottom: cta ? "28px" : "0",
        }}
      >
        {description}
      </div>

      {(cta || ctaSecondary) && (
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
          }}
        >
          {cta && (
            <button
              type="button"
              onClick={onCta}
              style={{
                padding: "10px 24px",
                borderRadius: "7px",
                background: "linear-gradient(135deg, var(--cyan), color-mix(in srgb, var(--cyan) 75%, var(--blue)))",
                border: "none",
                color: "var(--bg)",
                fontSize: "13px",
                fontWeight: 700,
                fontFamily: "var(--font-sans)",
                letterSpacing: "1px",
                cursor: "pointer",
                transition: "opacity 0.2s",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.opacity = "0.85";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              {cta}
            </button>
          )}
          {ctaSecondary && (
            <button
              type="button"
              onClick={onCtaSecondary}
              style={{
                padding: "9px 20px",
                borderRadius: "7px",
                background: "transparent",
                border: "1px solid var(--border-l)",
                color: "var(--muted)",
                fontSize: "12px",
                cursor: "pointer",
                transition: "color 0.2s",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = "var(--muted)";
              }}
            >
              {ctaSecondary}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function DashboardEmpty({
  onRunAssessment,
  onViewFrameworks,
  orgName = "Your Organisation",
}: {
  onRunAssessment: () => void;
  onViewFrameworks?: () => void;
  orgName?: string;
}) {
  return (
    <EmptyState
      badge="NOT YET ASSESSED"
      badgeColor="var(--amber)"
      icon="🎯"
      title={`${orgName} hasn't been assessed yet`}
      description="Run your first compliance assessment to see your posture score across all active frameworks. Takes under 2 minutes."
      cta="▶ Run First Assessment"
      ctaSecondary="View Frameworks"
      onCta={onRunAssessment}
      onCtaSecondary={onViewFrameworks}
    />
  );
}

export function ReviewQueueEmpty({ onRunAssessment }: { onRunAssessment?: () => void }) {
  return (
    <EmptyState
      badge="QUEUE CLEAR"
      badgeColor="var(--green)"
      icon="✅"
      title="No items pending review"
      description="All AI assessments have confidence ≥ 0.75. Items appear here when ZTAIP is uncertain and requires human judgement under GDPR Art.22 and EU AI Act Art.14."
      cta="Run Assessment"
      onCta={onRunAssessment}
    />
  );
}

export function RemediationEmpty({
  onViewFindings,
  onRunAssessment,
}: {
  onViewFindings?: () => void;
  onRunAssessment?: () => void;
}) {
  return (
    <EmptyState
      badge="NO OPEN FINDINGS"
      badgeColor="var(--green)"
      icon="🛡️"
      title="Nothing to remediate"
      description="No open compliance findings. Run an assessment to identify gaps and generate remediation actions automatically."
      cta="Run Assessment"
      ctaSecondary="View Review Queue"
      onCta={onRunAssessment}
      onCtaSecondary={onViewFindings}
    />
  );
}

export function AuditReportEmpty({ onGenerate }: { onGenerate: () => void }) {
  return (
    <EmptyState
      badge="REPORT NOT GENERATED"
      badgeColor="var(--blue)"
      icon="📄"
      title="Generate your board report"
      description="Select report type and entity, then click Generate. CORTEX produces a board-ready executive summary with framework scores, critical findings, and regulatory exposure in one click."
      cta="Generate Report"
      onCta={onGenerate}
    />
  );
}

export function IntegrationsEmpty() {
  return (
    <EmptyState
      badge="NO INTEGRATIONS CONNECTED"
      badgeColor="var(--amber)"
      icon="🔌"
      title="Connect your first integration"
      description="Connect Microsoft 365, GitHub, AWS or Azure to start receiving live control telemetry. Real signals replace mock data automatically."
      cta="Connect Integration"
    />
  );
}

export function AISystemsEmpty({
  onAddSystem,
  onViewObligations,
}: {
  onAddSystem?: () => void;
  onViewObligations?: () => void;
}) {
  return (
    <EmptyState
      badge="EU AI ACT — 94 DAYS"
      badgeColor="var(--red)"
      icon="🤖"
      title="No AI systems inventoried"
      description="Add your AI systems to assess EU AI Act compliance. High-risk system obligations apply from 2 August 2026. Classification is grounded in ISO 42001 Annex III."
      cta="Add AI System"
      ctaSecondary="View Obligations"
      onCta={onAddSystem}
      onCtaSecondary={onViewObligations}
    />
  );
}

export function GroupEmpty({
  onAddEntities,
  onLearnMore,
}: {
  onAddEntities?: () => void;
  onLearnMore?: () => void;
}) {
  return (
    <EmptyState
      badge="SINGLE ENTITY"
      badgeColor="var(--blue)"
      icon="🌍"
      title="No group entities configured"
      description="Your organisation is set up as a single entity. To see the multi-entity group view, add entities during onboarding or contact support to upgrade your structure."
      cta="Add Entities"
      ctaSecondary="Learn More"
      onCta={onAddEntities}
      onCtaSecondary={onLearnMore}
    />
  );
}

export function FrameworksEmpty({ onSelectFrameworks }: { onSelectFrameworks?: () => void }) {
  return (
    <EmptyState
      badge="NO FRAMEWORKS ACTIVE"
      badgeColor="var(--amber)"
      icon="📋"
      title="No frameworks selected"
      description="Select the compliance frameworks that apply to your organisation. CORTEX supports 8 frameworks across EU, UK, US, and international jurisdictions."
      cta="Select Frameworks"
      onCta={onSelectFrameworks}
    />
  );
}
