-- CORTEX 028 — Seed dimension_weights for CX-1001 through CX-1005.
-- Idempotent (UPDATE, not INSERT). Apply after 027_scenario_choice_dimension_weights.sql.
--
-- Portable: joins scenario_choices through scenario_stages and scenarios by slug,
-- so the same file applies on any database that already has the content seeds.
-- Re-runs overwrite with the same values.
--
-- 38 rows: CX-1001 (7), CX-1002 (7), CX-1003 (7), CX-1004 (7), CX-1005 (10).
-- Terminal 'complete' stages have no choices and are not updated here.
--
-- Scoring model. Columns are cm/ev/es/rm = control_mapping, evidence,
-- escalation, remediation. Two conventions run through every scenario:
--
--   Entry stages weight control_mapping (can you name the right control at all?)
--   and leave remediation at 0 — there is nothing to remediate before the facts
--   are established. Decisive later stages carry the remediation signal.
--
--   A wrong answer can still earn credit on a dimension it genuinely
--   demonstrates. CX-1001 'challenge' misses the control but shows the best
--   escalation judgment on the board (+20). Destroying evidence is the one act
--   penalised hardest across every scenario, because it is the only mistake an
--   auditor cannot let you correct later.
--
-- CX-1001 values reproduce the pre-027 Python heuristic exactly, so migrating
-- changes no existing learner's score.

BEGIN;

UPDATE scenario_choices sc
SET dimension_weights = jsonb_build_object(
      'control_mapping', v.cm,
      'evidence', v.ev,
      'escalation', v.es,
      'remediation', v.rm
    )
FROM scenario_stages st,
     scenarios s,
     (
       VALUES
         -- CX-1001 cloud_access_onboarding (A.8.2 / A.5.18 / A.5.15)
         ('cloud_access_onboarding', 'access_request', 'least_privilege', 15, 10, 10, 0),
         ('cloud_access_onboarding', 'access_request', 'challenge', -10, 0, 20, 0),
         ('cloud_access_onboarding', 'access_request', 'approve_all', -10, 0, -15, 0),
         ('cloud_access_onboarding', 'access_request', 'deny', -10, 0, 0, 0),
         ('cloud_access_onboarding', 'escalation', 'least_privilege', 10, 10, 10, 15),
         ('cloud_access_onboarding', 'escalation', 'approve_all', -8, 0, -15, -10),
         ('cloud_access_onboarding', 'escalation', 'deny', -8, 0, 0, -10),

         -- CX-1002 supplier_incident_response (A.5.19 / A.5.20 / A.5.26 / A.5.28)
         -- Contract invocation is the control; notifying a regulator before the
         -- facts are known is not diligence, it is a premature disclosure.
         ('supplier_incident_response', 'initial_assessment', 'invoke_supplier_contract', 15, 10, 10, 0),
         ('supplier_incident_response', 'initial_assessment', 'contain_and_investigate', -10, 5, -5, 0),
         ('supplier_incident_response', 'initial_assessment', 'escalate_to_dpo', -8, 0, 5, -5),
         ('supplier_incident_response', 'initial_assessment', 'notify_authority_immediately', -10, -10, -15, 0),
         ('supplier_incident_response', 'notification_decision', 'notify_authority_assess_subjects', 10, 10, 15, 15),
         ('supplier_incident_response', 'notification_decision', 'notify_authority_and_subjects', -5, 0, -10, 5),
         ('supplier_incident_response', 'notification_decision', 'defer_pending_forensics', -10, 5, -15, -10),

         -- CX-1003 change_management_failure (A.5.26 / A.8.32 / A.10.1)
         -- Rolling back first feels responsive but restores the vulnerability and
         -- loses the forensic state that proves what happened.
         ('change_management_failure', 'initial_response', 'invoke_incident_process', 15, 10, 10, 0),
         ('change_management_failure', 'initial_response', 'escalate_to_cto', -8, 0, 5, -5),
         ('change_management_failure', 'initial_response', 'rollback_immediately', -10, -10, -5, -5),
         ('change_management_failure', 'initial_response', 'let_engineering_resolve', -12, -5, -15, -5),
         ('change_management_failure', 'root_cause_decision', 'raise_nonconformity', 10, 10, 10, 15),
         ('change_management_failure', 'root_cause_decision', 'technical_finding_only', -5, 5, -5, -10),
         ('change_management_failure', 'root_cause_decision', 'close_no_finding', -10, -10, -10, -15),

         -- CX-1004 asset_classification_breach (A.5.9 / A.5.12 / A.5.13 / A.5.28 / A.10.1)
         -- Deleting the data destroys the evidence; concealing it from the auditor
         -- is the worst outcome in the track and is scored as such.
         ('asset_classification_breach', 'initial_assessment', 'restrict_and_log', 15, 10, 10, 0),
         ('asset_classification_breach', 'initial_assessment', 'wait_for_legal', -8, 0, -5, -10),
         ('asset_classification_breach', 'initial_assessment', 'notify_all_staff', -10, -5, -15, 0),
         ('asset_classification_breach', 'initial_assessment', 'delete_and_reclassify', -10, -15, -5, -5),
         ('asset_classification_breach', 'audit_disclosure_decision', 'disclose_and_self_raise', 10, 10, 15, 15),
         ('asset_classification_breach', 'audit_disclosure_decision', 'partial_disclosure', -5, -5, -10, -5),
         ('asset_classification_breach', 'audit_disclosure_decision', 'no_disclosure', -12, -15, -15, -12),

         -- CX-1005 ransomware_group_response (A.5.26 / A.5.28 / A.5.29 / A.5.30 / A.8.13)
         -- Expert tier, three decision stages. Paying carries sanctions exposure
         -- on top of the control failure, so it is penalised on every dimension.
         ('ransomware_group_response', 'invocation_decision', 'invoke_and_isolate', 15, 10, 10, 0),
         ('ransomware_group_response', 'invocation_decision', 'wait_for_forensics', -8, 5, -10, -10),
         ('ransomware_group_response', 'invocation_decision', 'contain_without_bcp', -10, 0, -10, -5),
         ('ransomware_group_response', 'invocation_decision', 'pay_ransom_first', -15, -10, -15, -10),
         ('ransomware_group_response', 'containment_strategy', 'image_then_restore', 10, 15, 10, 10),
         ('ransomware_group_response', 'containment_strategy', 'restore_immediately', -8, -15, -5, -5),
         ('ransomware_group_response', 'containment_strategy', 'pay_and_decrypt', -15, -10, -10, -10),
         ('ransomware_group_response', 'board_communication', 'board_brief_staged_notify', 10, 10, 15, 15),
         ('ransomware_group_response', 'board_communication', 'full_disclosure_notify_all', -5, 0, -12, 0),
         ('ransomware_group_response', 'board_communication', 'defer_all_notification', -10, -5, -15, -10)
     ) AS v(scenario_slug, stage_slug, choice_id, cm, ev, es, rm)
WHERE sc.stage_id = st.id
  AND st.scenario_id = s.id
  AND s.slug = v.scenario_slug
  AND st.slug = v.stage_slug
  AND sc.choice_id = v.choice_id;

COMMIT;
