-- CORTEX 026 — Seed next_stage / risk_outcome for CX-1001 through CX-1005.
-- Idempotent (UPDATE, not INSERT). Apply after 025_scenario_choice_transitions.sql.
--
-- Portable: joins scenario_choices through scenario_stages and scenarios by slug,
-- so the same file applies on any database that already has the content seeds.
-- Re-runs overwrite with the same values.
--
-- 38 rows: CX-1001 (7), CX-1002 (7), CX-1003 (7), CX-1004 (7), CX-1005 (10).
-- Terminal 'complete' stages have no choices and are not updated here.

BEGIN;

UPDATE scenario_choices sc
SET
  next_stage = v.next_stage,
  risk_outcome = v.risk_outcome
FROM scenario_stages st,
     scenarios s,
     (
       VALUES
         -- CX-1001 cloud_access_onboarding
         ('cloud_access_onboarding', 'access_request', 'approve_all', 'complete', 'over-provisioned'),
         ('cloud_access_onboarding', 'access_request', 'least_privilege', 'complete', 'controlled'),
         ('cloud_access_onboarding', 'access_request', 'challenge', 'escalation', 'under_review'),
         ('cloud_access_onboarding', 'access_request', 'deny', 'complete', 'blocked'),
         ('cloud_access_onboarding', 'escalation', 'approve_all', 'complete', 'over-provisioned'),
         ('cloud_access_onboarding', 'escalation', 'least_privilege', 'complete', 'controlled'),
         ('cloud_access_onboarding', 'escalation', 'deny', 'complete', 'blocked'),

         -- CX-1002 supplier_incident_response
         ('supplier_incident_response', 'initial_assessment', 'contain_and_investigate', 'notification_decision', 'delayed_response'),
         ('supplier_incident_response', 'initial_assessment', 'invoke_supplier_contract', 'notification_decision', 'controlled'),
         ('supplier_incident_response', 'initial_assessment', 'notify_authority_immediately', 'notification_decision', 'premature_notification'),
         ('supplier_incident_response', 'initial_assessment', 'escalate_to_dpo', 'notification_decision', 'delegated'),
         ('supplier_incident_response', 'notification_decision', 'notify_authority_and_subjects', 'complete', 'over-notified'),
         ('supplier_incident_response', 'notification_decision', 'notify_authority_assess_subjects', 'complete', 'controlled'),
         ('supplier_incident_response', 'notification_decision', 'defer_pending_forensics', 'complete', 'late_notification'),

         -- CX-1003 change_management_failure
         ('change_management_failure', 'initial_response', 'invoke_incident_process', 'root_cause_decision', 'controlled'),
         ('change_management_failure', 'initial_response', 'rollback_immediately', 'root_cause_decision', 'vulnerability_restored'),
         ('change_management_failure', 'initial_response', 'escalate_to_cto', 'root_cause_decision', 'ungoverned'),
         ('change_management_failure', 'initial_response', 'let_engineering_resolve', 'root_cause_decision', 'unclassified'),
         ('change_management_failure', 'root_cause_decision', 'raise_nonconformity', 'complete', 'controlled'),
         ('change_management_failure', 'root_cause_decision', 'technical_finding_only', 'complete', 'partial_remediation'),
         ('change_management_failure', 'root_cause_decision', 'close_no_finding', 'complete', 'unresolved'),

         -- CX-1004 asset_classification_breach
         ('asset_classification_breach', 'initial_assessment', 'restrict_and_log', 'audit_disclosure_decision', 'controlled'),
         ('asset_classification_breach', 'initial_assessment', 'delete_and_reclassify', 'audit_disclosure_decision', 'evidence_destroyed'),
         ('asset_classification_breach', 'initial_assessment', 'notify_all_staff', 'audit_disclosure_decision', 'secondary_disclosure'),
         ('asset_classification_breach', 'initial_assessment', 'wait_for_legal', 'audit_disclosure_decision', 'exposure_extended'),
         ('asset_classification_breach', 'audit_disclosure_decision', 'disclose_and_self_raise', 'complete', 'controlled'),
         ('asset_classification_breach', 'audit_disclosure_decision', 'partial_disclosure', 'complete', 'partial_compliance'),
         ('asset_classification_breach', 'audit_disclosure_decision', 'no_disclosure', 'complete', 'audit_integrity_failure'),

         -- CX-1005 ransomware_group_response
         ('ransomware_group_response', 'invocation_decision', 'invoke_and_isolate', 'containment_strategy', 'controlled'),
         ('ransomware_group_response', 'invocation_decision', 'contain_without_bcp', 'containment_strategy', 'ungoverned'),
         ('ransomware_group_response', 'invocation_decision', 'pay_ransom_first', 'containment_strategy', 'spread_risk'),
         ('ransomware_group_response', 'invocation_decision', 'wait_for_forensics', 'containment_strategy', 'spread_risk'),
         ('ransomware_group_response', 'containment_strategy', 'image_then_restore', 'board_communication', 'controlled'),
         ('ransomware_group_response', 'containment_strategy', 'restore_immediately', 'board_communication', 'evidence_destroyed'),
         ('ransomware_group_response', 'containment_strategy', 'pay_and_decrypt', 'board_communication', 'sanctions_risk'),
         ('ransomware_group_response', 'board_communication', 'full_disclosure_notify_all', 'complete', 'premature_notification'),
         ('ransomware_group_response', 'board_communication', 'board_brief_staged_notify', 'complete', 'controlled'),
         ('ransomware_group_response', 'board_communication', 'defer_all_notification', 'complete', 'late_notification')
     ) AS v(scenario_slug, stage_slug, choice_id, next_stage, risk_outcome)
WHERE sc.stage_id = st.id
  AND st.scenario_id = s.id
  AND s.slug = v.scenario_slug
  AND st.slug = v.stage_slug
  AND sc.choice_id = v.choice_id;

COMMIT;
