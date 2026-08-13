-- CORTEX 022 seed — change_management_failure (CX-1003) as content rows.
-- Idempotent (ON CONFLICT DO NOTHING throughout). Apply after 021_scenario_cx1002_seed.sql.
--
-- Authored here — title, track, frameworks, difficulty, brief, agent_message,
-- demands, consequence, is_correct, framework_rationale. Existing
-- cloud_access_onboarding and supplier_incident_response rows are untouched
-- (this seed INSERTs a new slug only).
--
-- ISO 27001:2022 practitioner scenario: emergency patch bypasses CAB, production
-- outage follows. Tests A.5.26 (incident response), A.8.32 (change management),
-- A.10.1 (nonconformity and corrective action).

-- ─────────────────────────────────────────────
-- 1. Scenario
-- ─────────────────────────────────────────────
INSERT INTO scenarios (slug, title, brief, track, frameworks, difficulty, active)
VALUES (
  'change_management_failure',
  'Emergency Patch: Change Management Bypass',
  'You are the Information Security Lead at AstraLabs Group. '
  'At 02:30 on a Tuesday, a critical vulnerability (CVSS 9.8) '
  'is published for the web framework running your customer '
  'portal. The engineering lead has already pushed an emergency '
  'patch to production without CAB approval — the portal is '
  'now down. You have an angry CTO, a broken production '
  'system, and a change process that was bypassed entirely. '
  'Your decisions determine how this is investigated, '
  'contained, and prevented from recurring.',
  'ai-risk-lead',
  ARRAY['iso27001-2022']::TEXT[],
  'practitioner',
  TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────
-- 2. Stages
-- ─────────────────────────────────────────────
-- Slugs join scenario_sessions.stage: initial_response is the opening turn,
-- root_cause_decision is the second decision, complete is terminal (no choices).
INSERT INTO scenario_stages (scenario_id, slug, sequence, agent_message, demands)
SELECT s.id, v.slug, v.sequence, v.agent_message, v.demands
FROM scenarios s
CROSS JOIN (
  VALUES
    (
      'initial_response',
      1,
      'I know I bypassed the CAB. CVSS 9.8, actively exploited '
      'in the wild — I was not going to wait 48 hours for a '
      'change window. The patch is legitimate, it is the right '
      'fix, and yes it broke something I did not expect. The '
      'portal is down and I need your decision on how we handle '
      'the next two hours, not a process lecture.',
      ARRAY[
        'Incident classification decision',
        'Whether to roll back or forward-fix',
        'Who owns the customer communication',
        'Whether this triggers a formal investigation'
      ]::TEXT[]
    ),
    (
      'root_cause_decision',
      2,
      'Portal is back up — forward-fix worked. CTO wants a '
      'root cause report by end of day. I can give you the '
      'technical timeline: the patch itself was correct, the '
      'outage was a missed dependency in the staging environment '
      'that does not mirror prod. The process question is '
      'separate. What is your position on the change management '
      'finding and what goes into the report?',
      ARRAY[
        'Root cause attribution — technical or process failure',
        'Whether a nonconformity is raised against the ISMS',
        'Corrective action scope',
        'Whether this is reportable under any external obligation'
      ]::TEXT[]
    ),
    (
      'complete',
      3,
      'Understood. Your response position is recorded. I will '
      'work within the corrective action scope you have defined '
      'and provide the technical timeline for the report.',
      NULL::TEXT[]
    )
) AS v(slug, sequence, agent_message, demands)
WHERE s.slug = 'change_management_failure'
ON CONFLICT (scenario_id, slug) DO NOTHING;

-- ─────────────────────────────────────────────
-- 3. Choices + graded reference answers
-- ─────────────────────────────────────────────
-- 'complete' is terminal and intentionally has no rows.
-- Reference answers: invoke_incident_process (stage 1),
-- raise_nonconformity (stage 2).
INSERT INTO scenario_choices (stage_id, choice_id, label, consequence, is_correct, framework_rationale, display_order)
SELECT st.id, v.choice_id, v.label, v.consequence, v.is_correct, v.framework_rationale, v.display_order
FROM scenario_stages st
JOIN scenarios s ON s.id = st.scenario_id
CROSS JOIN (
  VALUES
    -- initial_response
    (
      'initial_response',
      'invoke_incident_process',
      'Invoke incident response — classify and contain',
      'You formally classify this as a P1 incident, '
      'assign an incident commander, and run the response '
      'process in parallel with the fix. The outage is managed '
      'and the timeline is preserved for the root cause report.',
      TRUE,
      'Satisfies ISO 27001:2022 A.5.26 — information security '
      'incidents must be assessed and responded to through '
      'defined processes. Classifying correctly preserves '
      'evidence and ensures the response is auditable, '
      'regardless of whether the underlying patch was legitimate.',
      1
    ),
    (
      'initial_response',
      'rollback_immediately',
      'Roll back the patch — restore known good state',
      'The patch is reverted and the portal '
      'returns to the vulnerable state. The vulnerability '
      'is now live again and the outage timeline extends '
      'while the rollback is applied.',
      FALSE,
      'ISO 27001:2022 A.8.32 requires change management to '
      'consider the impact of changes including rollback — but '
      'rolling back to a CVSS 9.8 vulnerable state without a '
      'compensating control trades one risk for a larger one. '
      'The correct path is forward-fix under incident process, '
      'not rollback.',
      2
    ),
    (
      'initial_response',
      'escalate_to_cto',
      'Escalate to CTO — make it a leadership decision',
      'You transfer the response decision to the '
      'CTO. Leadership is involved but the incident process '
      'is not invoked and no incident commander is assigned. '
      'The timeline is uncontrolled.',
      FALSE,
      'ISO 27001:2022 A.5.26 assigns incident response '
      'responsibility to defined roles — escalating the '
      'decision does not invoke the process. CTO involvement '
      'is appropriate for communication, not as a substitute '
      'for the incident response track.',
      3
    ),
    (
      'initial_response',
      'let_engineering_resolve',
      'Let engineering resolve it — stay out of the way',
      'Engineering forward-fixes the portal '
      'without incident classification. The outage resolves '
      'but no timeline is preserved, no incident commander '
      'is assigned, and the root cause report has no '
      'auditable basis.',
      FALSE,
      'Fails ISO 27001:2022 A.5.26 — incidents must be assessed '
      'and responded to through defined processes. An '
      'unclassified outage with no incident record cannot '
      'support a nonconformity finding or corrective action '
      'under A.10.1.',
      4
    ),
    -- root_cause_decision
    (
      'root_cause_decision',
      'raise_nonconformity',
      'Raise a nonconformity — process failure, full corrective action',
      'A formal nonconformity is raised against '
      'the ISMS change management control. Corrective action '
      'covers both the technical gap (staging/prod parity) '
      'and the process gap (emergency change procedure). '
      'The report attributes both causes.',
      TRUE,
      'Satisfies ISO 27001:2022 A.10.1 (nonconformity and '
      'corrective action) and A.8.32 (change management). A '
      'bypass without an emergency change procedure is a '
      'process nonconformity regardless of the patch '
      'legitimacy. Corrective action on both dimensions '
      'prevents recurrence.',
      1
    ),
    (
      'root_cause_decision',
      'technical_finding_only',
      'Technical finding only — staging gap, no process nonconformity',
      'The report attributes the outage to the '
      'staging environment gap. The change management bypass '
      'is noted but not raised as a nonconformity. No '
      'corrective action on the process.',
      FALSE,
      'Fails ISO 27001:2022 A.8.32 — the absence of an '
      'emergency change procedure is a control gap, not a '
      'one-off deviation. Attributing only the technical '
      'cause leaves the process vulnerability unaddressed '
      'and creates recurrence risk.',
      2
    ),
    (
      'root_cause_decision',
      'close_no_finding',
      'Close with no finding — patch was correct, outcome acceptable',
      'The incident is closed with a technical '
      'timeline and no finding raised. The change management '
      'bypass is treated as justified by the CVSS score. '
      'No corrective action.',
      FALSE,
      'Fails ISO 27001:2022 A.10.1 and A.8.32. The '
      'legitimacy of the patch does not excuse the absence '
      'of a controlled emergency change path. Closing '
      'without a finding signals that CVSS severity '
      'overrides change governance — that precedent '
      'undermines the ISMS.',
      3
    )
) AS v(stage_slug, choice_id, label, consequence, is_correct, framework_rationale, display_order)
WHERE s.slug = 'change_management_failure'
  AND st.slug = v.stage_slug
ON CONFLICT (stage_id, choice_id) DO NOTHING;
