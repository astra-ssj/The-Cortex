# core/intelligence_engine.py — Reasoning layer over the compliance graph.
#
# WHY: Individual dashboards each tell one true fact. The hard, valuable truths are
# *emergent* — they live in the edges between evidence, controls, owners, frameworks
# and risks. This engine traverses the already-assembled compliance graph (the same
# ComplianceGraphOut that powers GET /graph) and infers conclusions a human would only
# reach by cross-referencing several screens by hand: a single expiring artefact that
# silently degrades five controls across three frameworks, a regulator deadline the
# current trajectory will miss, the one person whose absence would strand a third of
# the control estate.
#
# DESIGN: The engine reasons over the in-memory graph rather than issuing its own SQL.
# This keeps tenant isolation, the "skip dangling edge" rules, and the node/edge
# conventions in exactly one place (core/compliance_graph.py) and makes every
# generator a pure, unit-testable function of (graph) -> list[Insight]. The API layer
# is responsible for building the org-scoped graph and handing it in.

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Iterable

from pydantic import BaseModel, Field

# ── Severity / category vocabularies ─────────────────────────────────────────
Severity = str  # CRITICAL | HIGH | MEDIUM | LOW | WIN
Category = str  # CASCADE_RISK | ACCOUNTABILITY_GAP | SINGLE_POINT_OF_FAILURE
# | EFFICIENCY_WIN | DEADLINE_RISK | EVIDENCE_DECAY | EXPOSURE

_SEVERITY_ORDER: dict[str, int] = {
    "CRITICAL": 0,
    "HIGH": 1,
    "MEDIUM": 2,
    "WIN": 3,
    "LOW": 4,
}

# Frameworks whose regulatory deadlines we reason against (UTC). Sourced from the
# enforcement calendar — kept here (not in the DB) because they are facts about the
# law, not about any one tenant.
_FRAMEWORK_DEADLINES: dict[str, tuple[str, datetime]] = {
    "eu-ai-act-2024": (
        "EU AI Act — high-risk obligations",
        datetime(2026, 8, 2, tzinfo=timezone.utc),
    ),
    "nis2-2022-2555": (
        "NIS2 — national transposition",
        datetime(2024, 10, 17, tzinfo=timezone.utc),
    ),
}

# Frameworks with imminent / high-stakes deadlines escalate accountability gaps.
_DEADLINE_FRAMEWORKS = {"nis2-2022-2555", "eu-ai-act-2024"}

_FRAMEWORK_LABELS: dict[str, str] = {
    "iso27001-2022": "ISO/IEC 27001:2022",
    "gdpr-2016-679": "GDPR",
    "nis2-2022-2555": "NIS2",
    "nist-csf-2.0": "NIST CSF 2.0",
    "csa-ccm-v4": "CSA CCM v4",
    "eu-ai-act-2024": "EU AI Act",
    "cyber-essentials-v3.1": "Cyber Essentials",
}


class Insight(BaseModel):
    """A single inferred conclusion about the org's compliance posture.

    ``related_nodes`` carries graph node ids (e.g. ``evidence:…``, ``control:…``) so the
    UI can deep-link into the graph and animate the chain that produced the inference.
    ``rank_hint`` is an internal magnitude used only for intra-severity ordering and is
    not part of the public API contract.
    """

    id: str
    severity: Severity
    category: Category
    title: str
    detail: str
    related_nodes: list[str] = Field(default_factory=list)
    action: dict[str, str] = Field(default_factory=dict)
    computed_at: str
    rank_hint: float = 0.0


# ── Graph view helpers ───────────────────────────────────────────────────────
# A thin read model over ComplianceGraphOut so generators read declaratively instead
# of re-deriving adjacency in every function.


class _GraphView:
    def __init__(self, graph: Any) -> None:
        self.org_id: str = str(getattr(graph, "org_id", ""))
        self.nodes: list[dict[str, Any]] = list(getattr(graph, "nodes", []) or [])
        self.edges: list[dict[str, Any]] = list(getattr(graph, "edges", []) or [])
        self.stats: Any = getattr(graph, "stats", None)
        self.by_id: dict[str, dict[str, Any]] = {str(n["id"]): n for n in self.nodes}

        # Controls proven by at least one evidence item (incoming `proves` edge).
        self.proven_controls: set[str] = {
            str(e["to"]) for e in self.edges if e.get("type") == "proves"
        }
        # Controls a person is accountable for (incoming `owns` edge).
        self.owned_controls: set[str] = {
            str(e["to"]) for e in self.edges if e.get("type") == "owns"
        }
        # Controls touched by a finding (incoming `violates` edge).
        self.violated_controls: set[str] = {
            str(e["to"]) for e in self.edges if e.get("type") == "violates"
        }

    def node(self, node_id: str) -> dict[str, Any] | None:
        return self.by_id.get(str(node_id))

    def label(self, node_id: str) -> str:
        n = self.by_id.get(str(node_id))
        return str(n.get("label")) if n else str(node_id)

    def nodes_of(self, node_type: str) -> list[dict[str, Any]]:
        return [n for n in self.nodes if n.get("type") == node_type]

    def edges_of(self, edge_type: str) -> list[dict[str, Any]]:
        return [e for e in self.edges if e.get("type") == edge_type]

    def control_framework(self, control_node_id: str) -> str | None:
        n = self.by_id.get(str(control_node_id))
        if not n:
            return None
        fw = n.get("framework_id")
        return str(fw) if fw else None

    # Controls the org is actively working on: anything proven or under a finding.
    # These are the controls for which an accountability gap is meaningful (a control
    # nobody has touched is noise, not a gap).
    def in_scope_controls(self) -> set[str]:
        return self.proven_controls | self.violated_controls


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_dt(value: Any) -> datetime | None:
    """Accept tz-aware datetimes, naive datetimes, or ISO strings (with trailing Z)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None


def _days_until(when: datetime) -> int:
    """Whole days from now until ``when`` (negative when already past)."""
    delta = when - _now()
    # Round toward zero on the day boundary so "expires today" reads as 0, not -1.
    return int(delta.total_seconds() // 86400)


def _stable_id(category: str, *parts: str) -> str:
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:10]
    return f"{category.lower()}-{digest}"


def _fw_label(framework_id: str | None) -> str:
    if not framework_id:
        return "unspecified framework"
    return _FRAMEWORK_LABELS.get(framework_id, framework_id)


def _fw_node_id(framework_id: str | None) -> str | None:
    return f"framework:{framework_id}" if framework_id else None


# ── GENERATOR 1 — Cascade risk ────────────────────────────────────────────────
def detect_cascade_risks(graph: _GraphView, *, horizon_days: int = 14) -> list[Insight]:
    """Evidence expiring soon that proves multiple controls across multiple frameworks.

    When one artefact underpins controls in several regimes, its expiry is not a single
    gap — it is a synchronised, cross-framework regression the org will not see coming
    from any one framework dashboard.
    """
    insights: list[Insight] = []
    now = _now()

    for ev in graph.nodes_of("evidence"):
        meta = ev.get("metadata") or {}
        expires = _coerce_dt(meta.get("expires_at"))
        if expires is None:
            continue
        days = _days_until(expires)
        # In scope: already expired or expiring within the horizon.
        if expires - now > _td(horizon_days):
            continue

        ev_id = str(ev["id"])
        proved_controls = [
            str(e["to"]) for e in graph.edges if e.get("type") == "proves" and str(e["from"]) == ev_id
        ]
        frameworks = {
            fw for c in proved_controls if (fw := graph.control_framework(c))
        }
        if len(proved_controls) <= 1 or len(frameworks) <= 1:
            continue

        if days < 7:
            severity = "CRITICAL"
        else:
            severity = "HIGH"

        when_phrase = (
            f"expired {abs(days)} day{'s' if abs(days) != 1 else ''} ago"
            if days < 0
            else f"expires in {days} day{'s' if days != 1 else ''}"
        )
        fw_labels = ", ".join(sorted(_fw_label(f) for f in frameworks))
        # ev_id is already the prefixed node id (e.g. "evidence:<uuid>").
        related = [ev_id]
        related += [c for c in proved_controls]
        related += [nid for f in frameworks if (nid := _fw_node_id(f))]

        insights.append(
            Insight(
                id=_stable_id("CASCADE_RISK", ev_id),
                severity=severity,
                category="CASCADE_RISK",
                title=f"{ev.get('label')} {when_phrase} — it proves "
                f"{len(proved_controls)} controls across {len(frameworks)} frameworks",
                detail=(
                    f"This single evidence item is the proof behind {len(proved_controls)} "
                    f"controls spanning {fw_labels}. When it lapses, every one of those "
                    f"controls degrades at once — a synchronised regression no single "
                    f"framework view would surface. Refresh or re-collect it before expiry "
                    f"to hold the whole cluster."
                ),
                related_nodes=related,
                action={"label": "Refresh evidence", "href": "/evidence"},
                computed_at=now.isoformat(),
                # More frameworks + sooner expiry = more urgent.
                rank_hint=len(frameworks) * 1000 - days,
            )
        )

    return insights


# ── GENERATOR 2 — Accountability gap ──────────────────────────────────────────
def detect_accountability_gaps(graph: _GraphView) -> list[Insight]:
    """In-scope controls with no accountable owner (no incoming `owns` edge).

    A control that is assessed or under a finding but owned by nobody has no human who
    will be paged when it drifts. Clustered by framework so the gap reads as a single
    accountability decision, not a list of orphans.
    """
    now = _now()
    gaps_by_fw: dict[str, list[str]] = {}
    for control_id in sorted(graph.in_scope_controls()):
        if control_id in graph.owned_controls:
            continue
        fw = graph.control_framework(control_id) or ""
        gaps_by_fw.setdefault(fw, []).append(control_id)

    insights: list[Insight] = []
    for fw, control_ids in gaps_by_fw.items():
        count = len(control_ids)
        if count == 0:
            continue
        near_deadline = fw in _DEADLINE_FRAMEWORKS
        severity = "HIGH" if near_deadline else "MEDIUM"
        related = list(control_ids)
        if (fw_node := _fw_node_id(fw)):
            related.append(fw_node)
        deadline_clause = (
            " This framework carries a hard regulatory deadline, so an unowned control "
            "here is an enforcement exposure, not just a process gap."
            if near_deadline
            else ""
        )
        insights.append(
            Insight(
                id=_stable_id("ACCOUNTABILITY_GAP", fw or "none"),
                severity=severity,
                category="ACCOUNTABILITY_GAP",
                title=f"{count} {_fw_label(fw)} control{'s' if count != 1 else ''} "
                f"have no accountable owner",
                detail=(
                    f"{count} control{'s' if count != 1 else ''} under {_fw_label(fw)} "
                    f"are assessed or under a finding but have no `owns` relationship to "
                    f"any person. Nobody is on the hook when they drift.{deadline_clause} "
                    f"Assign an owner so accountability is explicit."
                ),
                related_nodes=related,
                action={"label": "Assign owners in graph", "href": "/graph"},
                computed_at=now.isoformat(),
                rank_hint=count + (500 if near_deadline else 0),
            )
        )
    return insights


# ── GENERATOR 3 — Single point of failure ─────────────────────────────────────
def detect_single_points_of_failure(
    graph: _GraphView, *, share_threshold: float = 0.30, framework_threshold: int = 3
) -> list[Insight]:
    """A person owning a disproportionate share of controls (key-person risk)."""
    now = _now()
    owns = [e for e in graph.edges if e.get("type") == "owns"]
    total_owned = len({str(e["to"]) for e in owns})
    if total_owned == 0:
        return []

    by_person: dict[str, list[str]] = {}
    for e in owns:
        by_person.setdefault(str(e["from"]), []).append(str(e["to"]))

    insights: list[Insight] = []
    for person_id, controls in by_person.items():
        owned = sorted(set(controls))
        share = len(owned) / total_owned
        frameworks = {graph.control_framework(c) for c in owned}
        frameworks.discard(None)
        if share < share_threshold and len(frameworks) <= framework_threshold:
            continue

        person = graph.node(person_id)
        role = ""
        if person:
            role = str((person.get("metadata") or {}).get("role") or "")
        name = graph.label(person_id)
        related = [person_id] + owned
        fw_labels = ", ".join(sorted(_fw_label(f) for f in frameworks if f))
        insights.append(
            Insight(
                id=_stable_id("SINGLE_POINT_OF_FAILURE", person_id),
                severity="MEDIUM",
                category="SINGLE_POINT_OF_FAILURE",
                title=f"{name} owns {len(owned)} controls "
                f"({round(share * 100)}% of the owned estate)",
                detail=(
                    f"{name}{f' ({role})' if role else ''} is the single accountable owner "
                    f"for {len(owned)} controls across {len(frameworks)} frameworks "
                    f"({fw_labels}). If this person is unavailable, a disproportionate share "
                    f"of the control estate has no backstop. Spread ownership or name a "
                    f"deputy to remove the key-person risk."
                ),
                related_nodes=related,
                action={"label": "View accountability", "href": "/graph"},
                computed_at=now.isoformat(),
                rank_hint=share * 100 + len(frameworks),
            )
        )
    return insights


# ── GENERATOR 4 — Efficiency win ──────────────────────────────────────────────
def detect_efficiency_wins(graph: _GraphView, *, max_wins: int = 3) -> list[Insight]:
    """Unproven controls a single existing/forthcoming evidence item could close.

    Uses control_mappings: an unproven control mapped (equivalent/overlapping) to a
    control that *is* already proven is, in practice, one upload away from done. Framed
    positively — the rare compliance insight that is good news.
    """
    now = _now()

    # Adjacency over maps_to (direction-agnostic — a mapping is symmetric for reuse).
    mapped: dict[str, set[str]] = {}
    for e in graph.edges_of("maps_to"):
        a, b = str(e["from"]), str(e["to"])
        mapped.setdefault(a, set()).add(b)
        mapped.setdefault(b, set()).add(a)

    # For each evidence item, the proven controls it underpins → the unproven controls
    # those map to. One refreshed/extended upload plausibly closes that whole set.
    wins: list[tuple[str, list[str], list[str]]] = []  # (evidence_id, proven, gaps)
    for ev in graph.nodes_of("evidence"):
        ev_id = str(ev["id"])
        proved = [
            str(e["to"]) for e in graph.edges if e.get("type") == "proves" and str(e["from"]) == ev_id
        ]
        gaps: set[str] = set()
        for c in proved:
            for neighbour in mapped.get(c, set()):
                if neighbour not in graph.proven_controls:
                    gaps.add(neighbour)
        if gaps:
            wins.append((ev_id, proved, sorted(gaps)))

    wins.sort(key=lambda w: len(w[2]), reverse=True)

    insights: list[Insight] = []
    for ev_id, _proved, gaps in wins[:max_wins]:
        ev = graph.node(ev_id)
        ev_label = graph.label(ev_id)
        n = len(gaps)
        gap_labels = ", ".join(graph.label(g) for g in gaps[:4])
        if n > 4:
            gap_labels += f", +{n - 4} more"
        related = [ev_id] + gaps
        insights.append(
            Insight(
                id=_stable_id("EFFICIENCY_WIN", ev_id),
                severity="WIN",
                category="EFFICIENCY_WIN",
                title=f"One update to “{ev_label}” could close "
                f"{n} mapped gap{'s' if n != 1 else ''}",
                detail=(
                    f"“{ev_label}” already proves controls that are mapped (equivalent or "
                    f"overlapping) to {n} currently-unproven control"
                    f"{'s' if n != 1 else ''}: {gap_labels}. Because the underlying control "
                    f"is essentially the same obligation, refreshing or re-scoping this one "
                    f"item is the cheapest path to closing all of them — test once, comply "
                    f"many."
                ),
                related_nodes=related,
                action={"label": "Open evidence", "href": "/evidence"},
                computed_at=now.isoformat(),
                rank_hint=float(n),
            )
        )
    return insights


# ── GENERATOR 5 — Deadline risk ───────────────────────────────────────────────
def detect_deadline_risks(graph: _GraphView, *, score_threshold: int = 60) -> list[Insight]:
    """Frameworks with a low coverage score and a near (or passed) regulatory deadline."""
    now = _now()
    coverage = _framework_coverage(graph)

    # AI systems classed high-risk make the AI Act deadline materially worse.
    high_risk_ai = [
        n for n in graph.nodes_of("system")
        if str((n.get("metadata") or {}).get("ai_risk_class") or "").upper() == "HIGH"
    ]

    insights: list[Insight] = []
    for fw, (deadline_label, deadline) in _FRAMEWORK_DEADLINES.items():
        cov = coverage.get(fw)
        if not cov:
            continue
        proven, total = cov
        score = round(100 * proven / total) if total else 0
        if score >= score_threshold:
            continue

        days = _days_until(deadline)
        related: list[str] = []
        if (fw_node := _fw_node_id(fw)):
            related.append(fw_node)

        ai_clause = ""
        if fw == "eu-ai-act-2024" and high_risk_ai:
            related += [str(s["id"]) for s in high_risk_ai]
            names = ", ".join(graph.label(str(s["id"])) for s in high_risk_ai)
            ai_clause = (
                f" {len(high_risk_ai)} high-risk AI system"
                f"{'s' if len(high_risk_ai) != 1 else ''} ({names}) fall squarely in scope, "
                f"so this is a product-blocking, not paperwork, deadline."
            )

        if days < 0:
            when_phrase = f"passed {abs(days)} days ago"
            severity = "CRITICAL" if score < 50 else "HIGH"
        else:
            when_phrase = f"is {days} days away"
            severity = "CRITICAL" if (days < 90 and score < 50) else "HIGH"

        insights.append(
            Insight(
                id=_stable_id("DEADLINE_RISK", fw),
                severity=severity,
                category="DEADLINE_RISK",
                title=f"{_fw_label(fw)} is at {score}% with its deadline {when_phrase}",
                detail=(
                    f"{deadline_label} {when_phrase}, yet coverage sits at just {score}% "
                    f"({proven}/{total} controls proven). At the current trajectory the org "
                    f"will not be defensible by the deadline.{ai_clause} Prioritise the "
                    f"open controls on this framework now."
                ),
                related_nodes=related,
                action={"label": "Open framework", "href": "/frameworks"},
                computed_at=now.isoformat(),
                # Lower score + sooner deadline = more urgent.
                rank_hint=(score_threshold - score) * 100 - days,
            )
        )
    return insights


# ── GENERATOR 6 — Exposure ────────────────────────────────────────────────────
def detect_exposure(graph: _GraphView) -> list[Insight]:
    """Aggregate financial exposure from findings that expose the org to risks.

    Walks finding -[exposes_to]-> risk and sums impact_eur, then surfaces the single
    largest exposure and the finding driving it — the one number a board cares about.
    """
    now = _now()
    exposes = graph.edges_of("exposes_to")
    if not exposes:
        return []

    # Distinct risks reached by a finding (avoid double counting a shared risk).
    risk_to_findings: dict[str, list[str]] = {}
    for e in exposes:
        risk_to_findings.setdefault(str(e["to"]), []).append(str(e["from"]))

    total = 0
    biggest_risk: str | None = None
    biggest_impact = -1
    for risk_id, _finders in risk_to_findings.items():
        risk = graph.node(risk_id)
        if not risk:
            continue
        impact = int((risk.get("metadata") or {}).get("impact_eur") or 0)
        total += impact
        if impact > biggest_impact:
            biggest_impact = impact
            biggest_risk = risk_id

    if biggest_risk is None or biggest_impact <= 0:
        return []

    driving_findings = risk_to_findings.get(biggest_risk, [])
    finding_label = graph.label(driving_findings[0]) if driving_findings else "an open finding"
    related = [biggest_risk] + driving_findings
    risk_label = graph.label(biggest_risk)

    return [
        Insight(
            id=_stable_id("EXPOSURE", biggest_risk),
            severity="HIGH",
            category="EXPOSURE",
            title=f"€{_fmt_eur(biggest_impact)} single exposure: {risk_label}",
            detail=(
                f"Open findings expose the org to €{_fmt_eur(total)} of quantified risk in "
                f"total. The largest single exposure is {risk_label} at "
                f"€{_fmt_eur(biggest_impact)}, driven by “{finding_label}”. Closing that "
                f"finding is the highest-leverage way to retire exposure."
            ),
            related_nodes=related,
            action={"label": "View finding", "href": "/findings"},
            computed_at=now.isoformat(),
            rank_hint=float(biggest_impact),
        )
    ]


# ── Aggregation ───────────────────────────────────────────────────────────────
def total_exposure_eur(graph: _GraphView) -> int:
    """Sum of impact_eur over distinct risks reached by a finding via `exposes_to`."""
    risks: set[str] = {str(e["to"]) for e in graph.edges_of("exposes_to")}
    total = 0
    for risk_id in risks:
        risk = graph.node(risk_id)
        if risk:
            total += int((risk.get("metadata") or {}).get("impact_eur") or 0)
    return total


def generate_insights(graph: Any) -> list[Insight]:
    """Run every generator over the compliance graph and return ranked insights.

    Ranking: CRITICAL > HIGH > MEDIUM > WIN > LOW, then by magnitude (``rank_hint``)
    descending within a severity band so the most material item leads each group.
    """
    view = graph if isinstance(graph, _GraphView) else _GraphView(graph)

    insights: list[Insight] = []
    insights += detect_cascade_risks(view)
    insights += detect_accountability_gaps(view)
    insights += detect_single_points_of_failure(view)
    insights += detect_efficiency_wins(view)
    insights += detect_deadline_risks(view)
    insights += detect_exposure(view)

    insights.sort(
        key=lambda i: (_SEVERITY_ORDER.get(i.severity, 5), -i.rank_hint)
    )
    return insights


def summarize_insights(graph: Any, insights: Iterable[Insight]) -> dict[str, Any]:
    """Build the summary strip payload (counts + total exposure + timestamp)."""
    view = graph if isinstance(graph, _GraphView) else _GraphView(graph)
    counts: dict[str, int] = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "WIN": 0, "LOW": 0}
    for ins in insights:
        counts[ins.severity] = counts.get(ins.severity, 0) + 1
    return {
        "critical": counts["CRITICAL"],
        "high": counts["HIGH"],
        "medium": counts["MEDIUM"],
        "wins": counts["WIN"],
        "low": counts["LOW"],
        "total_exposure_eur": total_exposure_eur(view),
        "generated_at": _now().isoformat(),
    }


# ── Small internal utilities ──────────────────────────────────────────────────
def _framework_coverage(graph: _GraphView) -> dict[str, tuple[int, int]]:
    """{framework_id: (proven, total)} from graph stats when present, else derived."""
    stats = graph.stats
    fc = getattr(stats, "framework_coverage", None) if stats is not None else None
    out: dict[str, tuple[int, int]] = {}
    if isinstance(fc, dict):
        for fw, v in fc.items():
            try:
                out[str(fw)] = (int(v.get("proven", 0)), int(v.get("total", 0)))
            except (AttributeError, TypeError, ValueError):
                continue
    return out


def _td(days: int):
    from datetime import timedelta

    return timedelta(days=days)


def _fmt_eur(value: int) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"{round(value / 1_000)}k"
    return str(value)
