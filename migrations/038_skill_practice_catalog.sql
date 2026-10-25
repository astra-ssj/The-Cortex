-- ASTRA 038 — Skill-derived practice metadata and evidence freshness scenario.
-- Idempotent. Apply after 035.
--
-- Upstream SKILL.md is never loaded by the runtime. These columns retain the
-- immutable provenance of the reviewed curriculum adaptation presented to the
-- learner.

ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS source_skill_id TEXT,
  ADD COLUMN IF NOT EXISTS source_skill_version TEXT,
  ADD COLUMN IF NOT EXISTS source_skill_url TEXT,
  ADD COLUMN IF NOT EXISTS source_skill_hash TEXT,
  ADD COLUMN IF NOT EXISTS source_skill_license TEXT,
  ADD COLUMN IF NOT EXISTS source_review_state TEXT,
  ADD COLUMN IF NOT EXISTS practice_area TEXT,
  ADD COLUMN IF NOT EXISTS estimated_minutes INT,
  ADD COLUMN IF NOT EXISTS learning_objectives JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scenarios_source_review_state_check'
  ) THEN
    ALTER TABLE scenarios
      ADD CONSTRAINT scenarios_source_review_state_check
      CHECK (
        source_review_state IS NULL
        OR source_review_state IN ('candidate', 'adapted', 'reviewed')
      );
  END IF;
END $$;

INSERT INTO scenarios (
  slug, title, brief, track, frameworks, difficulty, active,
  source_skill_id, source_skill_version, source_skill_url,
  source_skill_hash, source_skill_license, source_review_state,
  practice_area, estimated_minutes, learning_objectives
) VALUES (
  'evidence_freshness_audit',
  'The Evidence That Arrived Too Late',
  'A surveillance audit starts in four weeks. The evidence folder looks complete, but most files were copied into it last week. Decide what the records actually prove, identify a missing quarterly occurrence, and choose an honest refresh action.',
  'audit-practice',
  ARRAY['iso27001-2022', 'soc2'],
  'foundation',
  TRUE,
  'evidence-freshness-check',
  'v2026.10.19.2',
  'https://github.com/better-isms/grcskills/blob/v2026.10.19.2/skills/tristan-roth/evidence-freshness-check/SKILL.md',
  '713d89b9b3f74106c82d322c91e3dbfbe7c8e3ba738a464fd31734a138abe954',
  'MIT',
  'adapted',
  'evidence',
  12,
  '[
    "Use the date inside an artefact rather than its file modification date",
    "Count recurring evidence by expected occurrence across the audit period",
    "Choose an honest refresh action without recreating historical evidence"
  ]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  brief = EXCLUDED.brief,
  track = EXCLUDED.track,
  frameworks = EXCLUDED.frameworks,
  difficulty = EXCLUDED.difficulty,
  active = EXCLUDED.active,
  source_skill_id = EXCLUDED.source_skill_id,
  source_skill_version = EXCLUDED.source_skill_version,
  source_skill_url = EXCLUDED.source_skill_url,
  source_skill_hash = EXCLUDED.source_skill_hash,
  source_skill_license = EXCLUDED.source_skill_license,
  source_review_state = EXCLUDED.source_review_state,
  practice_area = EXCLUDED.practice_area,
  estimated_minutes = EXCLUDED.estimated_minutes,
  learning_objectives = EXCLUDED.learning_objectives;

INSERT INTO scenario_stages (scenario_id, slug, sequence, agent_message, demands)
SELECT id, 'artefact_date', 1,
       'The access-review export was copied into the evidence folder last week, so the file timestamp looks current. The report header inside it is nine months old. Can I mark it current for the audit?',
       ARRAY['Decide which date is authoritative', 'State what the artefact can prove']
FROM scenarios
WHERE slug = 'evidence_freshness_audit'
ON CONFLICT (scenario_id, slug) DO UPDATE SET
  sequence = EXCLUDED.sequence,
  agent_message = EXCLUDED.agent_message,
  demands = EXCLUDED.demands;

INSERT INTO scenario_stages (scenario_id, slug, sequence, agent_message, demands)
SELECT id, 'coverage_check', 2,
       'The policy requires quarterly access reviews. We found Q1, Q2, and Q4, but no Q3 record. Three out of four feels close enough. How should I present the year?',
       ARRAY['Assess occurrence coverage', 'Choose how to record the missing quarter']
FROM scenarios
WHERE slug = 'evidence_freshness_audit'
ON CONFLICT (scenario_id, slug) DO UPDATE SET
  sequence = EXCLUDED.sequence,
  agent_message = EXCLUDED.agent_message,
  demands = EXCLUDED.demands;

INSERT INTO scenario_stages (scenario_id, slug, sequence, agent_message, demands)
SELECT id, 'refresh_action', 3,
       'The Q4 review did happen and the identity platform still holds the signed export. Our folder copy is undated. What should the evidence owner do before fieldwork?',
       ARRAY['Choose a truthful refresh action', 'Preserve the original record']
FROM scenarios
WHERE slug = 'evidence_freshness_audit'
ON CONFLICT (scenario_id, slug) DO UPDATE SET
  sequence = EXCLUDED.sequence,
  agent_message = EXCLUDED.agent_message,
  demands = EXCLUDED.demands;

INSERT INTO scenario_stages (scenario_id, slug, sequence, agent_message, demands)
SELECT id, 'complete', 4, '', ARRAY[]::TEXT[]
FROM scenarios
WHERE slug = 'evidence_freshness_audit'
ON CONFLICT (scenario_id, slug) DO UPDATE SET sequence = EXCLUDED.sequence;

INSERT INTO scenario_choices (
  stage_id, choice_id, label, consequence, is_correct,
  framework_rationale, display_order, next_stage, risk_outcome,
  dimension_weights, control_refs
)
SELECT st.id, v.choice_id, v.label, v.consequence, v.is_correct,
       v.rationale, v.display_order, v.next_stage, v.risk_outcome,
       v.dimension_weights::jsonb, v.control_refs::jsonb
FROM scenario_stages st
JOIN scenarios s ON s.id = st.scenario_id
JOIN (
  VALUES
    ('artefact_date', 'inspect_content_date',
     'Use the report date inside the artefact and check the promised review cycle',
     'The evidence is classified from what it actually records, not when it was copied.',
     TRUE,
     'The internal report date is the supportable evidence date. ISO 27001:2022 A.5.33 protects the integrity of records used to demonstrate activity.',
     1, 'coverage_check', 'under_review',
     '{"evidence": 15, "control_mapping": 10}',
     '["a.5.33"]'),
    ('artefact_date', 'trust_file_timestamp',
     'Treat the recent file modification date as proof that the evidence is current',
     'A copied file timestamp is mistaken for the date of the activity.',
     FALSE,
     'File metadata changes when records are copied or exported and does not establish when the control activity occurred.',
     2, 'coverage_check', 'evidence_stale',
     '{"evidence": -12}',
     '["a.5.33"]'),
    ('artefact_date', 'recreate_current_screenshot',
     'Take a new screenshot and file it as evidence of the earlier review',
     'Current state is presented as historical evidence, weakening the audit trail.',
     FALSE,
     'A new screenshot can show today''s state but cannot prove that a review occurred nine months ago.',
     3, 'coverage_check', 'evidence_compromised',
     '{"evidence": -15, "remediation": -8}',
     '["a.5.33"]'),
    ('artefact_date', 'accept_owner_assurance',
     'Accept the owner''s statement that nothing material changed',
     'An unsupported assurance replaces an attributable record.',
     FALSE,
     'A verbal assurance does not make an undated or stale record current and attributable.',
     4, 'coverage_check', 'unsupported_claim',
     '{"evidence": -10, "escalation": -5}',
     '["a.5.33"]'),

    ('coverage_check', 'record_missing_q3',
     'Record Q3 as missing, name the owner and cause, and preserve the three valid occurrences',
     'The coverage statement is complete and the missing occurrence becomes an honest gap.',
     TRUE,
     'Recurring activity is assessed occurrence by occurrence. Independent review under ISO 27001:2022 A.5.35 depends on a record that exposes, rather than hides, missing coverage.',
     1, 'refresh_action', 'controlled',
     '{"evidence": 15, "remediation": 8, "escalation": 10}',
     '["a.5.33","a.5.35"]'),
    ('coverage_check', 'call_year_mostly_complete',
     'Report the control as mostly complete because three quarters are present',
     'A named missing occurrence is blurred into an unsupported annual conclusion.',
     FALSE,
     'Three records do not prove four expected occurrences. The missing quarter must remain visible to the reviewer.',
     2, 'refresh_action', 'coverage_gap_hidden',
     '{"evidence": -10, "control_mapping": -5}',
     '["a.5.35"]'),
    ('coverage_check', 'backfill_q3',
     'Run the review now and label it as the missing Q3 occurrence',
     'A current correction is misrepresented as historical operation.',
     FALSE,
     'Running the activity now may correct the present state, but it cannot recreate evidence that Q3 occurred.',
     3, 'refresh_action', 'evidence_compromised',
     '{"evidence": -15, "remediation": -10}',
     '["a.5.33","a.5.35"]'),
    ('coverage_check', 'remove_q3_from_sample',
     'Exclude Q3 from the sample and present only the quarters with records',
     'The sample is shaped to hide the known gap.',
     FALSE,
     'Known missing coverage must be disclosed; selectively removing it undermines independent review.',
     4, 'refresh_action', 'audit_integrity_risk',
     '{"evidence": -15, "escalation": -10}',
     '["a.5.35"]'),

    ('refresh_action', 'repull_source_record',
     'Re-pull the signed export with its internal date visible and retain source provenance',
     'The owner obtains an attributable copy without changing the historical record.',
     TRUE,
     'Re-exporting an existing source record preserves what occurred while making its date and origin visible.',
     1, 'complete', 'controlled',
     '{"evidence": 12, "remediation": 10}',
     '["a.5.33"]'),
    ('refresh_action', 'edit_existing_copy',
     'Add the expected date to the undated folder copy',
     'The evidence is altered rather than recovered from its authoritative source.',
     FALSE,
     'Dates must come from the record itself or its authoritative source; editing the copy weakens integrity.',
     2, 'complete', 'evidence_compromised',
     '{"evidence": -15, "remediation": -8}',
     '["a.5.33"]'),
    ('refresh_action', 'use_current_state',
     'Take a current screenshot and use it as proof that Q4 happened',
     'Current configuration is substituted for evidence of the historical review.',
     FALSE,
     'A current screenshot proves current state only; it does not prove that the Q4 review occurred.',
     3, 'complete', 'unsupported_claim',
     '{"evidence": -12}',
     '["a.5.33"]'),
    ('refresh_action', 'leave_undated',
     'Submit the undated copy with an explanatory note from the owner',
     'The explanation does not repair the missing date or source attribution.',
     FALSE,
     'An owner note may explain the gap but does not transform an undated copy into dated evidence.',
     4, 'complete', 'evidence_stale',
     '{"evidence": -8, "escalation": -5}',
     '["a.5.33"]')
) AS v(
  stage_slug, choice_id, label, consequence, is_correct,
  rationale, display_order, next_stage, risk_outcome,
  dimension_weights, control_refs
) ON v.stage_slug = st.slug
WHERE s.slug = 'evidence_freshness_audit'
ON CONFLICT (stage_id, choice_id) DO UPDATE SET
  label = EXCLUDED.label,
  consequence = EXCLUDED.consequence,
  is_correct = EXCLUDED.is_correct,
  framework_rationale = EXCLUDED.framework_rationale,
  display_order = EXCLUDED.display_order,
  next_stage = EXCLUDED.next_stage,
  risk_outcome = EXCLUDED.risk_outcome,
  dimension_weights = EXCLUDED.dimension_weights,
  control_refs = EXCLUDED.control_refs;

CREATE INDEX IF NOT EXISTS idx_scenarios_source_skill_id
  ON scenarios (source_skill_id)
  WHERE source_skill_id IS NOT NULL;
