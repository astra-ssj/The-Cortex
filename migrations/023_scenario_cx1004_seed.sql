-- CORTEX 023 seed — asset_classification_breach (CX-1004) as content rows.
-- Idempotent (ON CONFLICT DO NOTHING throughout). Apply after 022_scenario_cx1003_seed.sql.
--
-- Authored here — title, track, frameworks, difficulty, brief, agent_message,
-- demands, consequence, is_correct, framework_rationale. Existing
-- cloud_access_onboarding, supplier_incident_response, and
-- change_management_failure rows are untouched (this seed INSERTs a new slug only).
--
-- ISO 27001:2022 practitioner scenario: sensitive data found on unclassified
-- shared drive three days before surveillance audit. Tests A.5.9 (inventory
-- of information assets), A.5.10 (acceptable use), A.5.12 (classification of
-- information), A.5.13 (labelling of information), A.5.26 (response to
-- information security incident), A.5.28 (collection of evidence),
-- A.10.1 (nonconformity and corrective action).

-- ─────────────────────────────────────────────
-- 1. Scenario
-- ─────────────────────────────────────────────
INSERT INTO scenarios (slug, title, brief, track, frameworks, difficulty, active)
VALUES (
  'asset_classification_breach',
  'Audit Prep: Sensitive Data on Unclassified Storage',
  'You are the Information Security Lead at AstraLabs Group. '
  'Three days before your ISO 27001:2022 surveillance audit, '
  'a junior analyst flags that a shared network drive contains '
  'unclassified folders holding what appears to be contract '
  'data, salary information, and customer PII. The drive is '
  'accessible to all 340 staff across the group. You have '
  '72 hours before the auditor arrives and your asset register '
  'shows nothing for this drive. Your decisions determine '
  'how you respond, what you disclose, and what you fix.',
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
-- audit_disclosure_decision is the second decision, complete is terminal (no choices).
INSERT INTO scenario_stages (scenario_id, slug, sequence, agent_message, demands)
SELECT s.id, v.slug, v.sequence, v.agent_message, v.demands
FROM scenarios s
CROSS JOIN (
  VALUES
    (
      'initial_assessment',
      1,
      'I found it during routine prep. The folder is called '
      '''Finance-Archive-2022'' and it has been sitting there '
      'since the merger. Salary bands, three customer contracts '
      'with PII, and what looks like board minutes. No access '
      'log that I can find — the drive predates our SIEM. '
      'I have not touched anything. What do you want me to do?',
      ARRAY[
        'Whether to restrict access immediately',
        'Whether to preserve or quarantine the data',
        'Whether to log this as a security event',
        'Who else needs to know right now'
      ]::TEXT[]
    ),
    (
      'audit_disclosure_decision',
      2,
      'Access is restricted. I have done a full inventory — '
      'confirmed PII for 47 customers, salary data for 180 '
      'employees, and 6 board documents marked confidential '
      'in the source system but unclassified here. The auditor '
      'arrives in 48 hours. None of this is in the asset '
      'register and there is no classification label on any '
      'of it. What is your disclosure position for the audit?',
      ARRAY[
        'Whether to disclose proactively to the auditor',
        'Whether to raise a GDPR breach notification',
        'What goes into the asset register before audit',
        'Whether a nonconformity is self-raised'
      ]::TEXT[]
    ),
    (
      'complete',
      3,
      'Understood. Your response position is recorded. '
      'I will prepare the audit file and asset register '
      'entries within the scope you have defined.',
      NULL::TEXT[]
    )
) AS v(slug, sequence, agent_message, demands)
WHERE s.slug = 'asset_classification_breach'
ON CONFLICT (scenario_id, slug) DO NOTHING;

-- ─────────────────────────────────────────────
-- 3. Choices + graded reference answers
-- ─────────────────────────────────────────────
-- 'complete' is terminal and intentionally has no rows.
-- Reference answers: restrict_and_log (stage 1),
-- disclose_and_self_raise (stage 2).
INSERT INTO scenario_choices (stage_id, choice_id, label, consequence, is_correct, framework_rationale, display_order)
SELECT st.id, v.choice_id, v.label, v.consequence, v.is_correct, v.framework_rationale, v.display_order
FROM scenario_stages st
JOIN scenarios s ON s.id = st.scenario_id
CROSS JOIN (
  VALUES
    -- initial_assessment
    (
      'initial_assessment',
      'restrict_and_log',
      'Restrict access and log as a security event',
      'Access to the drive is restricted immediately and the '
      'discovery is logged as a security event with timestamp '
      'and analyst details. The data is preserved in place '
      'pending classification and investigation.',
      TRUE,
      'Satisfies ISO 27001:2022 A.5.9 (inventory of information '
      'assets) by initiating asset identification, A.5.12 '
      '(classification of information) by flagging unclassified '
      'data for remediation, and A.5.26 by logging the event. '
      'Restricting access immediately limits exposure while '
      'preserving evidence.',
      1
    ),
    (
      'initial_assessment',
      'delete_and_reclassify',
      'Delete the unclassified copies — reclassify from source',
      'The unclassified files are deleted and the team '
      'retrieves classified versions from source systems. '
      'Evidence of the exposure period is destroyed in the '
      'process.',
      FALSE,
      'Fails ISO 27001:2022 A.5.28 (collection of evidence) — '
      'deleting files destroys the evidence needed to assess '
      'the exposure period and scope. A.5.12 remediation must '
      'preserve the audit trail, not eliminate it.',
      2
    ),
    (
      'initial_assessment',
      'notify_all_staff',
      'Notify all staff — transparency first',
      'A company-wide notification is sent describing the '
      'exposed data. Staff awareness is raised but the '
      'notification itself may constitute a secondary '
      'disclosure of the sensitive content.',
      FALSE,
      'ISO 27001:2022 A.5.13 (labelling of information) and '
      'A.5.10 (acceptable use) govern who handles sensitive '
      'data. Broad notification of salary and PII content to '
      'all 340 staff widens the exposure rather than '
      'containing it.',
      3
    ),
    (
      'initial_assessment',
      'wait_for_legal',
      'Hold all action — wait for legal advice',
      'No action is taken pending legal review. The drive '
      'remains accessible to all staff for the duration. The '
      'exposure window extends through the audit.',
      FALSE,
      'Fails ISO 27001:2022 A.5.26 — incidents require timely '
      'response. Waiting for legal advice before restricting '
      'access is not a recognised hold under the standard. '
      'Legal involvement is appropriate in parallel, not as a '
      'prerequisite to containment.',
      4
    ),
    -- audit_disclosure_decision
    (
      'audit_disclosure_decision',
      'disclose_and_self_raise',
      'Disclose proactively — self-raise nonconformity and notify GDPR authority',
      'You brief the auditor on the finding before the audit '
      'begins, self-raise a nonconformity against A.5.9 and '
      'A.5.12, update the asset register with the drive and '
      'its classification status, and file an Article 33 '
      'notification for the customer PII. The audit proceeds '
      'with full transparency.',
      TRUE,
      'Satisfies ISO 27001:2022 A.5.9, A.5.12, A.5.13, and '
      'A.10.1 (nonconformity and corrective action). Proactive '
      'disclosure to an auditor is consistent with continual '
      'improvement under clause 10 and demonstrates ISMS '
      'maturity. GDPR Article 33 notification is required for '
      'the customer PII exposure — 47 records with uncertain '
      'access history meets the threshold.',
      1
    ),
    (
      'audit_disclosure_decision',
      'partial_disclosure',
      'Disclose the drive — omit the GDPR angle',
      'You brief the auditor on the unclassified asset and '
      'update the register, but do not raise the GDPR '
      'notification. The auditor sees a classification finding; '
      'the regulatory obligation is unmet.',
      FALSE,
      'Partial disclosure satisfies ISO 27001:2022 A.5.9 and '
      'A.5.12 but fails the GDPR Article 33 obligation '
      'independently. The two obligations run in parallel — '
      'meeting one does not discharge the other.',
      2
    ),
    (
      'audit_disclosure_decision',
      'no_disclosure',
      'Do not disclose — fix quietly before the auditor arrives',
      'The asset register is updated and access is corrected '
      'before audit day. The auditor sees a compliant state. '
      'The exposure period, the PII, and the GDPR obligation '
      'are undisclosed.',
      FALSE,
      'Fails ISO 27001:2022 clause 10 (continual improvement) '
      'and A.10.1 — concealing a nonconformity from an auditor '
      'is a material audit integrity failure. GDPR Article 33 '
      'remains unmet regardless of the audit outcome. This '
      'approach risks both certification withdrawal and '
      'regulatory enforcement.',
      3
    )
) AS v(stage_slug, choice_id, label, consequence, is_correct, framework_rationale, display_order)
WHERE s.slug = 'asset_classification_breach'
  AND st.slug = v.stage_slug
ON CONFLICT (stage_id, choice_id) DO NOTHING;
