-- CORTEX 035 — Structured control attribution for scenario choices, and the
-- framework/audit-type the learner selected in the Audit Simulator.
-- Idempotent. Apply after 019 (scenario content) and 017 (scenario_sessions).
--
-- Why this column exists. Control references were only ever authored into
-- scenario_choices.framework_rationale prose, and the sole reader was a regex in
-- core/competency.py. That regex cannot tell "Fails ISO 27001:2022 a.8.2" from
-- "Satisfies ISO 27001:2022 a.8.2" — it extracts a.8.2 from both. Competency per
-- control is therefore underivable from prose alone. control_refs records which
-- controls a choice engages; the pass/fail signal stays where it already lives,
-- in is_correct and dimension_weights.
--
-- Ids are canonical lowercase and must exist in compliance/iso27001.py. The prose
-- is inconsistent (019 wrote a.8.2, 021-024 wrote A.5.26) and uses A.10.1 for what
-- is actually management-system clause 10.1, so refs are authored here rather than
-- parsed. tests/test_control_posture.py asserts every ref resolves in the registry.
--
-- Distractors whose prose cites no ISO control inherit the stage's control set —
-- the controls the correct answer names. Without that, choosing a wrong answer at
-- such a stage would attribute to no control at all and silently cost the learner
-- nothing.

ALTER TABLE scenario_choices
  ADD COLUMN IF NOT EXISTS control_refs JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN scenario_choices.control_refs IS
  'Canonical lowercase framework control ids this choice engages, e.g. ["a.8.2","a.5.18"]. '
  'Must resolve in the framework registry. Pass/fail comes from is_correct and dimension_weights.';

ALTER TABLE scenario_sessions
  ADD COLUMN IF NOT EXISTS framework  TEXT,
  ADD COLUMN IF NOT EXISTS audit_type TEXT;

COMMENT ON COLUMN scenario_sessions.framework IS
  'Framework id selected in the Audit Simulator when this session was launched.';
COMMENT ON COLUMN scenario_sessions.audit_type IS
  'Audit type selected in the Audit Simulator when this session was launched.';

-- ─────────────────────────────────────────────
-- Backfill control_refs
-- ─────────────────────────────────────────────
UPDATE scenario_choices c
SET control_refs = CAST(v.refs AS jsonb)
FROM (
  VALUES
    -- CX-1001 cloud_access_onboarding — privileged access under time pressure
    ('cloud_access_onboarding', 'access_request',           'approve_all',                    '["a.8.2"]'),
    ('cloud_access_onboarding', 'access_request',           'least_privilege',                '["a.8.2","a.5.18"]'),
    ('cloud_access_onboarding', 'access_request',           'challenge',                      '["a.5.15"]'),
    ('cloud_access_onboarding', 'access_request',           'deny',                           '["a.5.15"]'),
    ('cloud_access_onboarding', 'escalation',               'approve_all',                    '["a.8.2"]'),
    ('cloud_access_onboarding', 'escalation',               'least_privilege',                '["a.8.2","a.5.18"]'),
    ('cloud_access_onboarding', 'escalation',               'deny',                           '["a.5.15"]'),
    ('cloud_access_onboarding', 'business_escalation',      'approve_all',                    '["a.8.2"]'),
    ('cloud_access_onboarding', 'business_escalation',      'least_privilege',                '["a.8.2","a.5.18"]'),
    ('cloud_access_onboarding', 'business_escalation',      'deny',                           '["a.5.15"]'),

    -- CX-1002 supplier_incident_response — third-party breach, Article 33 window
    ('supplier_incident_response', 'initial_assessment',    'contain_and_investigate',        '["a.5.26"]'),
    ('supplier_incident_response', 'initial_assessment',    'invoke_supplier_contract',       '["a.5.19","a.5.20"]'),
    ('supplier_incident_response', 'initial_assessment',    'notify_authority_immediately',   '["a.6.8"]'),
    ('supplier_incident_response', 'initial_assessment',    'escalate_to_dpo',                '["a.5.26"]'),
    ('supplier_incident_response', 'notification_decision', 'notify_authority_and_subjects',  '["a.5.26","a.5.28"]'),
    ('supplier_incident_response', 'notification_decision', 'notify_authority_assess_subjects','["a.5.26","a.5.28"]'),
    ('supplier_incident_response', 'notification_decision', 'defer_pending_forensics',        '["a.5.26"]'),

    -- CX-1003 change_management_failure — emergency patch bypasses CAB
    ('change_management_failure', 'initial_response',       'invoke_incident_process',        '["a.5.26"]'),
    ('change_management_failure', 'initial_response',       'rollback_immediately',           '["a.8.32"]'),
    ('change_management_failure', 'initial_response',       'escalate_to_cto',                '["a.5.26"]'),
    ('change_management_failure', 'initial_response',       'let_engineering_resolve',        '["a.5.26","clause.10.1"]'),
    ('change_management_failure', 'root_cause_decision',    'raise_nonconformity',            '["clause.10.1","a.8.32"]'),
    ('change_management_failure', 'root_cause_decision',    'technical_finding_only',         '["a.8.32"]'),
    ('change_management_failure', 'root_cause_decision',    'close_no_finding',               '["clause.10.1","a.8.32"]'),

    -- CX-1004 asset_classification_breach — unclassified PII before surveillance audit
    ('asset_classification_breach', 'initial_assessment',        'restrict_and_log',          '["a.5.9","a.5.12","a.5.26"]'),
    ('asset_classification_breach', 'initial_assessment',        'delete_and_reclassify',     '["a.5.28","a.5.12"]'),
    ('asset_classification_breach', 'initial_assessment',        'notify_all_staff',          '["a.5.13","a.5.10"]'),
    ('asset_classification_breach', 'initial_assessment',        'wait_for_legal',            '["a.5.26"]'),
    ('asset_classification_breach', 'audit_disclosure_decision', 'disclose_and_self_raise',   '["a.5.9","a.5.12","a.5.13","clause.10.1"]'),
    ('asset_classification_breach', 'audit_disclosure_decision', 'partial_disclosure',        '["a.5.9","a.5.12"]'),
    ('asset_classification_breach', 'audit_disclosure_decision', 'no_disclosure',             '["clause.10.1","clause.10.2"]'),

    -- CX-1005 ransomware_group_response — group-wide continuity invocation
    ('ransomware_group_response', 'invocation_decision',    'invoke_and_isolate',             '["a.5.29","a.5.30","a.5.26"]'),
    ('ransomware_group_response', 'invocation_decision',    'contain_without_bcp',            '["a.5.29"]'),
    ('ransomware_group_response', 'invocation_decision',    'pay_ransom_first',               '["a.5.26","a.5.29","a.5.30","a.8.13"]'),
    ('ransomware_group_response', 'invocation_decision',    'wait_for_forensics',             '["a.5.29","a.5.30"]'),
    ('ransomware_group_response', 'containment_strategy',   'image_then_restore',             '["a.5.28","a.5.29","a.5.30","a.8.13"]'),
    ('ransomware_group_response', 'containment_strategy',   'restore_immediately',            '["a.5.28","a.5.30"]'),
    ('ransomware_group_response', 'containment_strategy',   'pay_and_decrypt',                '["a.5.28","a.5.29","a.8.13"]'),
    ('ransomware_group_response', 'board_communication',    'full_disclosure_notify_all',     '["a.5.26"]'),
    ('ransomware_group_response', 'board_communication',    'board_brief_staged_notify',      '["a.5.26","a.5.29"]'),
    ('ransomware_group_response', 'board_communication',    'defer_all_notification',         '["a.5.26"]')
) AS v(scenario_slug, stage_slug, choice_id, refs)
WHERE c.choice_id = v.choice_id
  AND c.stage_id IN (
    SELECT st.id
    FROM scenario_stages st
    JOIN scenarios s ON s.id = st.scenario_id
    WHERE s.slug = v.scenario_slug
      AND st.slug = v.stage_slug
  );

-- Choice lookup during derivation is always (stage, choice_id); the existing
-- UNIQUE (stage_id, choice_id) already covers it. This index serves the reverse
-- direction — finding every choice that touches a control.
CREATE INDEX IF NOT EXISTS idx_scenario_choices_control_refs
  ON scenario_choices USING GIN (control_refs);
