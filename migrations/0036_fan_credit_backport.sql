-- Fan-submission credits set in /admin that the repo did not carry.
--
-- is_fan_submission is a credit only: nothing about scheduling, the fallback
-- pick, feedback or analytics reads it. It rides on RevealInfo, so the stamp
-- appears on the check after game over.
--
-- These three were ticked in the admin dish editor and lived in prod D1 alone.
-- The UPDATE is a no-op against prod and exists so a fresh database built from
-- migrations plus the seed credits the same dishes.

UPDATE dishes SET is_fan_submission = 1
 WHERE slug IN ('fish-and-chips', 'peking-duck', 'souffle');
