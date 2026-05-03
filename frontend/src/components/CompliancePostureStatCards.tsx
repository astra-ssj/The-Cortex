import type { ReactNode } from "react";
import type { CompliancePosture } from "../types/compliance";
import { AnimatedNumber, AnimatedScoreRing } from "./AnimatedScore";
import { Button, Card } from "./ui";

export interface CompliancePostureStatCardsProps {
  posture: CompliancePosture;
  onRunFirstAssessment: () => void;
}

export function CompliancePostureStatCards({ posture, onRunFirstAssessment }: CompliancePostureStatCardsProps) {
  const cards: { title: string; body: ReactNode; bodyClass?: string }[] = [
    {
      title: "Overall posture",
      bodyClass: "mt-2 flex items-center gap-3",
      body:
        typeof posture.overallScore === "number" && posture.overallScore > 0 ? (
          <AnimatedScoreRing value={posture.overallScore} size={64} strokeWidth={5} duration={1400} delay={100} />
        ) : (
          <div>
            <p className="font-bold" style={{ color: "var(--text-secondary)", fontSize: "20px", margin: 0 }}>
              Not Yet Assessed
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 !px-0 !text-[12px]"
              onClick={onRunFirstAssessment}
            >
              Run your first assessment →
            </Button>
          </div>
        ),
    },
    {
      title: "Audit readiness",
      bodyClass: "mt-2 flex items-center gap-3",
      body:
        typeof posture.auditReadiness === "number" ? (
          <AnimatedScoreRing
            value={posture.auditReadiness}
            size={64}
            strokeWidth={5}
            duration={1400}
            delay={200}
            color="var(--amber)"
          />
        ) : (
          <p className="font-bold" style={{ color: "var(--text-secondary)", fontSize: "24px" }}>—</p>
        ),
    },
    {
      title: "Critical gaps",
      bodyClass: "mt-2 font-bold",
      body:
        typeof posture.criticalGapsCount === "number" ? (
          <AnimatedNumber
            value={posture.criticalGapsCount}
            duration={800}
            delay={300}
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Syne', sans-serif",
              color: "var(--red)",
            }}
          />
        ) : (
          "—"
        ),
    },
    {
      title: "Compliant frameworks",
      bodyClass: "mt-2 font-bold",
      body: (
        <>
          <AnimatedNumber
            value={posture.frameworks.filter((f) => f.status === "COMPLIANT").length}
            duration={800}
            delay={400}
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "'Syne', sans-serif",
              color: "var(--text)",
            }}
          />
          /{posture.frameworks.length}
        </>
      ),
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Posture summary">
      {cards.map((card) => (
        <Card key={card.title} className="overflow-visible">
          <Card.Body className="px-5 py-5 sm:px-6">
            <h3 className="cortex-text-caption font-semibold uppercase tracking-wide" style={{ color: "var(--text-quiet)" }}>
              {card.title}
            </h3>
            <div
              className={card.bodyClass}
              style={
                card.title === "Critical gaps" || card.title === "Compliant frameworks"
                  ? { color: "var(--text)", fontSize: "24px" }
                  : undefined
              }
            >
              {card.body}
            </div>
          </Card.Body>
        </Card>
      ))}
    </section>
  );
}
