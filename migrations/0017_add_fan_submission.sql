-- Fan-submitted dishes: ones that reached the menu through a player's "Suggest
-- a dish" request rather than the kitchen's own list. Purely a credit — it has
-- no effect on scheduling, the fallback pick, or feedback. The check modal
-- stamps the dish when it turns up as the Special and points the next player at
-- the suggestion form.
--
-- Additive: adds one column with a default and flags the dishes already known to
-- have come from requests. The rest are tagged by hand in /admin.

ALTER TABLE dishes ADD COLUMN is_fan_submission INTEGER NOT NULL DEFAULT 0;

UPDATE dishes SET is_fan_submission = 1
 WHERE slug IN ('fairy-bread', 'german-chocolate-cake', 'funnel-cake', 'scrambled-eggs');
