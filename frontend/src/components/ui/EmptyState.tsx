import type { BadgeVariant } from "./Badge";
import { Badge } from "./Badge";
import { Button } from "./Button";

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

function badgeVariantFromColor(badgeColor: string): BadgeVariant {
  switch (badgeColor) {
    case "var(--amber)":
      return "warning";
    case "var(--green)":
      return "success";
    case "var(--blue)":
      return "info";
    case "var(--red)":
      return "danger";
    case "var(--cyan)":
      return "info";
    default:
      return "neutral";
  }
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
  const bv = badgeVariantFromColor(badgeColor);

  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-[var(--space-5)] px-[var(--space-8)] py-[var(--space-8)] text-center">
      {badge ? (
        <Badge variant={bv} size="xs" className="font-mono tracking-[0.12em]">
          {badge}
        </Badge>
      ) : null}

      <div className="text-[48px] opacity-70 grayscale-[0.2]">{icon}</div>

      <div className="max-w-[360px] font-sans text-lg font-bold text-cortex-text">
        {title}
      </div>

      <div className="max-w-[440px] text-[13px] leading-relaxed text-cortex-text-sec">
        {description}
      </div>

      {(cta ?? ctaSecondary) !== undefined ? (
        <div className="mt-[var(--space-3)] flex flex-wrap items-center justify-center gap-3">
          {cta ? (
            <Button
              variant="primary"
              size="md"
              disabled={onCta === undefined}
              onClick={onCta}
              type="button"
            >
              {cta}
            </Button>
          ) : null}
          {ctaSecondary ? (
            <Button
              variant="secondary"
              size="md"
              disabled={onCtaSecondary === undefined}
              onClick={onCtaSecondary}
              type="button"
            >
              {ctaSecondary}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DashboardEmpty({
  onRunAssessment,
  onViewFrameworks,
  orgName = "Your Organisation",
}: {
  onRunAssessment?: () => void;
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

export function ReviewQueueEmpty({
  onRunAssessment,
}: {
  onRunAssessment?: () => void;
}) {
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

export function FrameworksEmpty({
  onSelectFrameworks,
}: {
  onSelectFrameworks?: () => void;
}) {
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
