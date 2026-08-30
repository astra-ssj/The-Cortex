-- CORTEX 034 — Remove the legacy CISM label from Learning Loop scenarios.
-- CISM is a professional certification, not a framework implemented by CORTEX.

UPDATE scenarios
SET frameworks = array_remove(frameworks, 'cism')
WHERE 'cism' = ANY(frameworks);
