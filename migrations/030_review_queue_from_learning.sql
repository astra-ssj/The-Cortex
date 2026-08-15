-- CORTEX 030 — Review Queue holds real items only.
--
-- api/assessments.py seeded eight hardcoded rows (review-1 … review-8) into
-- demo-org-001 on the first read of /assessments/review-queue: GDPR breach
-- notification, NIS2 CSIRT, EU AI Act human oversight. None of them could be
-- produced or changed by anything a user did, and a buyer who finished an
-- ISO 27001 scenario and opened the queue found unrelated frameworks waiting.
--
-- The seeding function is gone. This removes the rows it already wrote, together
-- with any review history that referenced them, so existing volumes converge on
-- the same empty-until-earned state as a fresh install.
--
-- Items now arrive from graded learner decisions at expert difficulty
-- (core/human_review.enqueue_learning_decision_review) and from low-confidence
-- control assessments (core/assessment_llm), both on the existing sub-0.75
-- convention. Apply after 029. Idempotent.

DELETE FROM human_review_pending
WHERE org_id = 'demo-org-001'
  AND id ~ '^review-[0-9]+$';

DELETE FROM human_review_reviewed
WHERE org_id = 'demo-org-001'
  AND item_id ~ '^review-[0-9]+$';

-- The Learning Loop writes one item per (session, stage) and upserts on replay, so
-- reads are always "this org's queue, newest flag first".
CREATE INDEX IF NOT EXISTS idx_human_review_pending_org_flagged
  ON human_review_pending (org_id, date_flagged DESC);
