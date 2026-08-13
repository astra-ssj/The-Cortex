-- CORTEX 024 seed — ransomware_group_response (CX-1005) as content rows.
-- Idempotent (ON CONFLICT DO NOTHING throughout). Apply after 023_scenario_cx1004_seed.sql.
--
-- Authored here — title, track, frameworks, difficulty, brief, agent_message,
-- demands, consequence, is_correct, framework_rationale. Existing
-- cloud_access_onboarding, supplier_incident_response,
-- change_management_failure, and asset_classification_breach rows are
-- untouched (this seed INSERTs a new slug only).
--
-- ISO 27001:2022 expert scenario: ransomware encrypts the largest subsidiary
-- of a six-entity international group. Tests A.5.26 (response to information
-- security incidents), A.5.28 (collection of evidence), A.5.29 (information
-- security during disruption), A.5.30 (ICT readiness for business continuity),
-- A.8.13 (information backup).

-- ─────────────────────────────────────────────
-- 1. Scenario
-- ─────────────────────────────────────────────
INSERT INTO scenarios (slug, title, brief, track, frameworks, difficulty, active)
VALUES (
  'ransomware_group_response',
  'Ransomware: Group-Wide Business Continuity Invocation',
  'You are the Group CISO of a multi-entity international '
  'group operating across six entities in six jurisdictions. '
  'At 06:15 on a Monday, your SOC alerts you that ransomware '
  'has encrypted the file servers of your largest subsidiary. '
  'The subsidiary accounts for 40% of group revenue. Three '
  'other entities share network segments with the affected '
  'subsidiary. Backups exist but have not been tested in '
  'nine months. Your board convenes in four hours. '
  'Your decisions determine invocation, containment, '
  'communication, and recovery sequencing across the group.',
  'ai-risk-lead',
  ARRAY['iso27001-2022']::TEXT[],
  'expert',
  TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────
-- 2. Stages
-- ─────────────────────────────────────────────
-- Slugs join scenario_sessions.stage: invocation_decision is the opening turn,
-- containment_strategy is the second decision, board_communication is the
-- third, complete is terminal (no choices).
INSERT INTO scenario_stages (scenario_id, slug, sequence, agent_message, demands)
SELECT s.id, v.slug, v.sequence, v.agent_message, v.demands
FROM scenarios s
CROSS JOIN (
  VALUES
    (
      'invocation_decision',
      1,
      'SOC confirms ransomware on the subsidiary file servers. '
      'Encryption is still running — it started approximately '
      '90 minutes ago. Three shared network segments connect '
      'to other entities. We have not isolated yet because '
      'isolation takes down the shared ERP system that all '
      'six entities depend on for daily operations. '
      'The ransom note is on screen. What is your call?',
      ARRAY[
        'Whether to invoke business continuity now',
        'Whether to isolate the subsidiary immediately',
        'Whether to engage law enforcement',
        'Who owns the decision if you are unavailable'
      ]::TEXT[]
    ),
    (
      'containment_strategy',
      2,
      'Business continuity is invoked. Subsidiary is isolated — '
      'ERP is down for all six entities. IT confirms backups '
      'exist for the subsidiary but the last tested restore '
      'was nine months ago. Restore time estimate is 18-36 '
      'hours, unverified. The three connected entities are '
      'clean so far but we cannot confirm lateral movement '
      'has not occurred. The ransom demand is 2.1 million '
      'euros with a 48-hour deadline. What is your '
      'containment position?',
      ARRAY[
        'Whether to forensically image before restoring',
        'Whether to scan the three connected entities now',
        'Your position on the ransom demand',
        'Backup restoration sequencing across the group'
      ]::TEXT[]
    ),
    (
      'board_communication',
      3,
      'Forensic imaging is underway. Connected entities are '
      'being scanned — two are clean, one has suspicious '
      'lateral movement indicators but no confirmed encryption. '
      'Restore estimate is 28 hours for the subsidiary. '
      'The board convenes in 90 minutes. General counsel '
      'wants to know your notification position across the '
      'six jurisdictions before the board meeting — GDPR, '
      'NIS2, and local breach notification laws apply '
      'differently across the group. What do you tell '
      'the board and what do you notify externally?',
      ARRAY[
        'Board communication scope and framing',
        'Supervisory authority notification position',
        'NIS2 early warning decision (where applicable)',
        'Whether affected customers are notified now'
      ]::TEXT[]
    ),
    (
      'complete',
      4,
      'Understood. Your response position across all four '
      'decision points is recorded. The group will operate '
      'within the scope you have defined. Recovery sequencing '
      'and external notifications will proceed accordingly.',
      NULL::TEXT[]
    )
) AS v(slug, sequence, agent_message, demands)
WHERE s.slug = 'ransomware_group_response'
ON CONFLICT (scenario_id, slug) DO NOTHING;

-- ─────────────────────────────────────────────
-- 3. Choices + graded reference answers
-- ─────────────────────────────────────────────
-- 'complete' is terminal and intentionally has no rows.
-- Reference answers: invoke_and_isolate (stage 1),
-- image_then_restore (stage 2), board_brief_staged_notify (stage 3).
INSERT INTO scenario_choices (stage_id, choice_id, label, consequence, is_correct, framework_rationale, display_order)
SELECT st.id, v.choice_id, v.label, v.consequence, v.is_correct, v.framework_rationale, v.display_order
FROM scenario_stages st
JOIN scenarios s ON s.id = st.scenario_id
CROSS JOIN (
  VALUES
    -- invocation_decision
    (
      'invocation_decision',
      'invoke_and_isolate',
      'Invoke BCP and isolate the subsidiary now',
      'Business continuity is invoked across '
      'the group. The subsidiary is isolated immediately, '
      'taking down the shared ERP. All six entities lose '
      'ERP access but the spread vector is closed. The '
      'incident timeline is clean from invocation.',
      TRUE,
      'Satisfies ISO 27001:2022 A.5.29 '
      '(information security during disruption) and A.5.30 '
      '(ICT readiness for business continuity). Isolation '
      'is the correct containment action under A.5.26 '
      'even at operational cost — the spread risk to three '
      'connected entities outweighs the ERP disruption. '
      'BCP invocation ensures the response is governed '
      'and auditable.',
      1
    ),
    (
      'invocation_decision',
      'contain_without_bcp',
      'Contain technically — do not invoke BCP yet',
      'IT attempts technical containment without '
      'formal BCP invocation. The response is ungoverned, '
      'decision authority is unclear, and the board has '
      'no formal briefing obligation. Containment may '
      'succeed but the response has no auditable governance '
      'structure.',
      FALSE,
      'Fails ISO 27001:2022 A.5.29 — '
      'BCP exists to govern the response to disruption, '
      'not only to restore services. Containing without '
      'invocation means no defined roles, no escalation '
      'path, and no recovery time objective in force. '
      'The three connected entities remain at unquantified '
      'risk without a formal response framework.',
      2
    ),
    (
      'invocation_decision',
      'pay_ransom_first',
      'Negotiate the ransom — explore payment before isolation',
      'Ransom negotiation begins while encryption '
      'continues. The spread window stays open across the '
      'three connected entities. Payment does not guarantee '
      'decryption and may violate sanctions obligations '
      'depending on the threat actor''s jurisdiction.',
      FALSE,
      'Fails ISO 27001:2022 A.5.26 '
      'and A.5.29 — the incident response obligation is '
      'to contain and recover, not to negotiate while '
      'the attack is active. A.8.13 (information backup) '
      'and A.5.30 require a recovery path that does not '
      'depend on attacker cooperation. Sanctions risk '
      'is a legal exposure outside the ISMS but material '
      'to the decision.',
      3
    ),
    (
      'invocation_decision',
      'wait_for_forensics',
      'Wait for forensic confirmation before invoking',
      'No BCP invocation until forensics confirm '
      'scope. Encryption continues during the forensic '
      'window. The three connected entities remain exposed. '
      'The board meeting arrives with no formal response '
      'structure in place.',
      FALSE,
      'Fails ISO 27001:2022 A.5.29 '
      'and A.5.30 — BCP invocation is triggered by '
      'disruption to critical operations, not by forensic '
      'confirmation of scope. Waiting extends the spread '
      'window and leaves the response ungoverned. Forensics '
      'run in parallel with containment, not before it.',
      4
    ),
    -- containment_strategy
    (
      'containment_strategy',
      'image_then_restore',
      'Forensic image first — then restore from backup',
      'All affected systems are forensically '
      'imaged before restoration begins. Evidence is '
      'preserved end to end. Restore begins after imaging '
      'with the 28-hour timeline. Connected entities are '
      'scanned in parallel. Ransom is declined.',
      TRUE,
      'Satisfies ISO 27001:2022 A.5.28 '
      '(collection of evidence), A.8.13 (information '
      'backup), and A.5.30. Forensic imaging before '
      'restoration preserves the evidence chain for law '
      'enforcement and insurance. Declining the ransom '
      'is consistent with A.5.29 — recovery must not '
      'depend on attacker cooperation when a tested '
      'backup path exists, and the backup exists even '
      'if untested.',
      1
    ),
    (
      'containment_strategy',
      'restore_immediately',
      'Restore from backup immediately — speed first',
      'Restoration begins without forensic '
      'imaging. Systems are back online faster but the '
      'evidence chain is destroyed. Law enforcement '
      'cannot prosecute and insurance claims are '
      'unsupportable without forensic evidence.',
      FALSE,
      'Fails ISO 27001:2022 A.5.28 — '
      'evidence must be collected before remediation '
      'where possible. Restoring without imaging destroys '
      'the forensic record. A.5.30 requires ICT recovery '
      'to be evidenced and auditable — an unevidenced '
      'restore cannot support post-incident review '
      'or regulatory inquiry.',
      2
    ),
    (
      'containment_strategy',
      'pay_and_decrypt',
      'Pay the ransom — decrypt rather than restore',
      'Payment is made. Decryption keys are '
      'provided and systems are restored faster than '
      'the 28-hour backup path. No forensic imaging. '
      'Sanctions risk materialises if the threat actor '
      'is on a restricted list. The attacker is funded '
      'for the next attack.',
      FALSE,
      'Fails ISO 27001:2022 A.5.28 '
      'and A.5.29. Payment without forensic imaging '
      'destroys evidence and funds the threat actor. '
      'A.8.13 requires backup capability precisely to '
      'avoid operational dependency on attacker '
      'cooperation. Sanctions exposure is a material '
      'legal risk outside the ISMS that the CISO '
      'must escalate to legal before any payment '
      'is considered.',
      3
    ),
    -- board_communication
    (
      'board_communication',
      'full_disclosure_notify_all',
      'Full board disclosure — notify all authorities across all jurisdictions now',
      'The board receives a complete incident '
      'briefing. Supervisory authority notifications are '
      'filed across all six jurisdictions simultaneously. '
      'NIS2 early warning is filed where applicable. '
      'Customer notification is issued group-wide.',
      FALSE,
      'ISO 27001:2022 A.5.26 requires '
      'notification through proper channels with accurate '
      'scope. Filing across all jurisdictions simultaneously '
      'before scope is confirmed in the three connected '
      'entities risks materially inaccurate notifications. '
      'GDPR Article 33 and NIS2 obligations are '
      'jurisdiction-specific — a blanket filing without '
      'confirmed scope in each entity is procedurally '
      'premature and may require amendment.',
      1
    ),
    (
      'board_communication',
      'board_brief_staged_notify',
      'Board briefing with staged notification — confirmed entities first',
      'The board receives a full briefing on '
      'confirmed scope and ongoing investigation. Authority '
      'notifications are filed for the confirmed subsidiary '
      'only. NIS2 early warning is filed where the '
      'subsidiary operates. Connected entity notifications '
      'are staged pending scan confirmation. Customer '
      'notification follows scope confirmation.',
      TRUE,
      'Satisfies ISO 27001:2022 A.5.26 '
      'and A.5.29. Staged notification matches confirmed '
      'scope to each jurisdiction''s obligation — GDPR '
      'Article 33 for the subsidiary''s data subjects, '
      'NIS2 early warning where applicable, with connected '
      'entity notifications triggered by scan results. '
      'Board briefing ensures governance is visible at '
      'the right level without overstating scope.',
      2
    ),
    (
      'board_communication',
      'defer_all_notification',
      'Defer all external notification — brief board only, notify when fully resolved',
      'The board is briefed but no external '
      'notifications are filed. Notification is deferred '
      'until full recovery and scope confirmation. '
      'GDPR 72-hour and NIS2 24-hour windows close '
      'during the deferral period.',
      FALSE,
      'Fails GDPR Article 33 and '
      'NIS2 Article 19 — both impose time-bound '
      'notification obligations that run from awareness, '
      'not from resolution. ISO 27001:2022 A.5.26 '
      'requires timely notification through defined '
      'channels. Deferring until resolution guarantees '
      'late notification across multiple jurisdictions '
      'and compounds the regulatory exposure.',
      3
    )
) AS v(stage_slug, choice_id, label, consequence, is_correct, framework_rationale, display_order)
WHERE s.slug = 'ransomware_group_response'
  AND st.slug = v.stage_slug
ON CONFLICT (stage_id, choice_id) DO NOTHING;
