-- CORTEX 021 seed — supplier_incident_response (CX-1002) as content rows.
-- Idempotent (ON CONFLICT DO NOTHING throughout). Apply after 019_scenario_content.sql.
--
-- Authored here — title, track, frameworks, difficulty, brief, agent_message,
-- demands, consequence, is_correct, framework_rationale. Existing
-- cloud_access_onboarding rows are untouched (this seed INSERTs a new slug only).

-- ─────────────────────────────────────────────
-- 1. Scenario
-- ─────────────────────────────────────────────
INSERT INTO scenarios (slug, title, brief, track, frameworks, difficulty, active)
VALUES (
  'supplier_incident_response',
  'Third-Party Breach: Supplier Security Incident',
  'You are the Information Security Lead at AstraLabs Group. '
  'Your SaaS HR platform provider has just notified you of a '
  'security incident affecting customer data. You have 72 hours '
  'under GDPR Article 33 — but first you need to decide how to '
  'respond to the supplier and protect the organisation. '
  'Your decisions drive the investigation and notification path.',
  'ai-risk-lead',
  ARRAY['iso27001-2022']::TEXT[],
  'practitioner',
  TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────
-- 2. Stages
-- ─────────────────────────────────────────────
-- Slugs join scenario_sessions.stage: initial_assessment is the opening turn,
-- notification_decision is the second decision, complete is terminal (no choices).
INSERT INTO scenario_stages (scenario_id, slug, sequence, agent_message, demands)
SELECT s.id, v.slug, v.sequence, v.agent_message, v.demands
FROM scenarios s
CROSS JOIN (
  VALUES
    (
      'initial_assessment',
      1,
      'We have sent you the incident report as contracted. The '
      'breach affected names, email addresses, and job titles for '
      'your employee records — approximately 340 people. We '
      'believe it was contained at 03:00 this morning but '
      'forensics are still running. We have patched the vector. '
      'What do you need from us right now?',
      ARRAY[
        'Full forensic report within 24 hours',
        'Confirmation of data scope and affected records',
        'Evidence that the attack vector is closed',
        'Named incident coordinator on your side'
      ]::TEXT[]
    ),
    (
      'notification_decision',
      2,
      'Forensics are complete. Confirmed: 340 employee records, '
      'names and emails only, no financial data, no passwords. '
      'Exfiltration cannot be ruled out — the attacker had access '
      'for six hours. We have the logs. The patch is verified. '
      'You have about 48 hours left on your GDPR clock. '
      'What is your notification position?',
      ARRAY[
        'A decision on supervisory authority notification',
        'A decision on individual data subject notification',
        'Your evidence preservation instruction',
        'Confirmation of your internal escalation path'
      ]::TEXT[]
    ),
    (
      'complete',
      3,
      'Understood. Your response position is recorded. We will '
      'act within the scope you have defined and keep you updated '
      'on the forensic timeline.',
      NULL::TEXT[]
    )
) AS v(slug, sequence, agent_message, demands)
WHERE s.slug = 'supplier_incident_response'
ON CONFLICT (scenario_id, slug) DO NOTHING;

-- ─────────────────────────────────────────────
-- 3. Choices + graded reference answers
-- ─────────────────────────────────────────────
-- 'complete' is terminal and intentionally has no rows.
-- Reference answers: invoke_supplier_contract (stage 1),
-- notify_authority_assess_subjects (stage 2).
INSERT INTO scenario_choices (stage_id, choice_id, label, consequence, is_correct, framework_rationale, display_order)
SELECT st.id, v.choice_id, v.label, v.consequence, v.is_correct, v.framework_rationale, v.display_order
FROM scenario_stages st
JOIN scenarios s ON s.id = st.scenario_id
CROSS JOIN (
  VALUES
    -- initial_assessment
    (
      'initial_assessment',
      'contain_and_investigate',
      'Contain first — demand evidence before any action',
      'You hold all external communication until '
      'forensics confirm scope. Investigation is controlled but '
      'the GDPR clock is running with no notification started.',
      FALSE,
      'ISO 27001:2022 A.5.26 requires '
      'response to information security incidents — containment '
      'alone without parallel notification assessment fails the '
      'response objective. GDPR Article 33 runs independently '
      'of forensic completion.',
      1
    ),
    (
      'initial_assessment',
      'invoke_supplier_contract',
      'Invoke contract — enforce SLA and evidence obligations',
      'You formally invoke the supplier''s security '
      'obligations under the DPA and demand the forensic report, '
      'logs, and a named coordinator within the contracted SLA. '
      'Investigation and notification assessment run in parallel.',
      TRUE,
      'Satisfies ISO 27001:2022 A.5.19 '
      '(information security in supplier relationships) and '
      'A.5.20 (addressing security within supplier agreements). '
      'Parallel tracks preserve the GDPR Article 33 window '
      'while enforcing contractual evidence obligations.',
      2
    ),
    (
      'initial_assessment',
      'notify_authority_immediately',
      'Notify supervisory authority immediately',
      'You file a precautionary Article 33 '
      'notification before forensics complete. The authority '
      'is informed but the notification may need material '
      'amendment once scope is confirmed.',
      FALSE,
      'ISO 27001:2022 A.6.8 requires '
      'reporting through proper channels with accurate '
      'information. A premature notification without confirmed '
      'scope risks a materially inaccurate filing — the '
      'obligation is to notify without undue delay once you '
      'know, not before.',
      3
    ),
    (
      'initial_assessment',
      'escalate_to_dpo',
      'Escalate to DPO — delegate the response decision',
      'You route the incident to the DPO and stand '
      'down from the technical response. The DPO takes over '
      'notification assessment but the technical investigation '
      'loses its security lead.',
      FALSE,
      'ISO 27001:2022 A.5.26 assigns '
      'incident response responsibility — the security lead '
      'does not transfer that responsibility by escalating. '
      'DPO involvement is required but does not substitute '
      'for the security response track.',
      4
    ),
    -- notification_decision
    (
      'notification_decision',
      'notify_authority_and_subjects',
      'Notify authority and affected individuals',
      'You file the Article 33 notification to the '
      'supervisory authority and send Article 34 communications '
      'to the 340 affected employees. Full compliance posture, '
      'evidence preserved.',
      FALSE,
      'Article 34 individual notification '
      'is only mandatory when the breach is likely to result '
      'in high risk to individuals. Names and emails with '
      'uncertain exfiltration warrants authority notification '
      '(Article 33) but individual notification requires a '
      'risk assessment first — notifying without that '
      'assessment is procedurally premature.',
      1
    ),
    (
      'notification_decision',
      'notify_authority_assess_subjects',
      'Notify authority — assess individual risk first',
      'You file the Article 33 notification within '
      'the 72-hour window and commission a risk assessment for '
      'individual notification. Evidence is preserved and the '
      'supplier logs are secured.',
      TRUE,
      'Satisfies ISO 27001:2022 A.5.26 '
      'and A.5.28 (collection of evidence) alongside GDPR '
      'Article 33 (authority notification without undue delay) '
      'and Article 34 (individual notification conditional on '
      'high risk assessment). Proportionate and evidenced.',
      2
    ),
    (
      'notification_decision',
      'defer_pending_forensics',
      'Defer all notification until forensics conclude',
      'You wait for the complete forensic report '
      'before filing anything. The 72-hour GDPR window closes '
      'before forensics are done. Late notification filed.',
      FALSE,
      'Fails GDPR Article 33 — notification '
      'must be made without undue delay and where feasible '
      'within 72 hours of becoming aware. Forensic completion '
      'is not a prerequisite. ISO 27001:2022 A.5.26 requires '
      'timely response, not perfect information.',
      3
    )
) AS v(stage_slug, choice_id, label, consequence, is_correct, framework_rationale, display_order)
WHERE s.slug = 'supplier_incident_response'
  AND st.slug = v.stage_slug
ON CONFLICT (stage_id, choice_id) DO NOTHING;
