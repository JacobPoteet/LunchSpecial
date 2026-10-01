-- One spelling per ingredient. Six ingredients had a plural twin in the pantry
-- (clam/clams, pickle/pickles, olive/olives, almond/almonds, clove/cloves, pine
-- nut/pine nuts) and the canonical form is lowercase singular. Ingredient
-- families (shared/families.ts) call two DIFFERENT ingredients of a family
-- close, so a guess holding cloves against a Special holding clove would have
-- come back yellow where it should be a match.
--
-- Keyed on the JSON text rather than on slugs, because prod carries admin edits
-- this repo has never seen. A row that somehow held both spellings loses the
-- plural; every other row has it renamed. Idempotent: a second run finds nothing.

UPDATE dishes SET ingredients = replace(replace(ingredients, ',"clams"', ''), '"clams",', '')
  WHERE ingredients LIKE '%"clams"%' AND ingredients LIKE '%"clam"%';
UPDATE dishes SET ingredients = replace(ingredients, '"clams"', '"clam"')
  WHERE ingredients LIKE '%"clams"%';
UPDATE dishes SET ingredients = replace(replace(ingredients, ',"pickles"', ''), '"pickles",', '')
  WHERE ingredients LIKE '%"pickles"%' AND ingredients LIKE '%"pickle"%';
UPDATE dishes SET ingredients = replace(ingredients, '"pickles"', '"pickle"')
  WHERE ingredients LIKE '%"pickles"%';
UPDATE dishes SET ingredients = replace(replace(ingredients, ',"olives"', ''), '"olives",', '')
  WHERE ingredients LIKE '%"olives"%' AND ingredients LIKE '%"olive"%';
UPDATE dishes SET ingredients = replace(ingredients, '"olives"', '"olive"')
  WHERE ingredients LIKE '%"olives"%';
UPDATE dishes SET ingredients = replace(replace(ingredients, ',"almonds"', ''), '"almonds",', '')
  WHERE ingredients LIKE '%"almonds"%' AND ingredients LIKE '%"almond"%';
UPDATE dishes SET ingredients = replace(ingredients, '"almonds"', '"almond"')
  WHERE ingredients LIKE '%"almonds"%';
UPDATE dishes SET ingredients = replace(replace(ingredients, ',"cloves"', ''), '"cloves",', '')
  WHERE ingredients LIKE '%"cloves"%' AND ingredients LIKE '%"clove"%';
UPDATE dishes SET ingredients = replace(ingredients, '"cloves"', '"clove"')
  WHERE ingredients LIKE '%"cloves"%';
UPDATE dishes SET ingredients = replace(replace(ingredients, ',"pine nuts"', ''), '"pine nuts",', '')
  WHERE ingredients LIKE '%"pine nuts"%' AND ingredients LIKE '%"pine nut"%';
UPDATE dishes SET ingredients = replace(ingredients, '"pine nuts"', '"pine nut"')
  WHERE ingredients LIKE '%"pine nuts"%';
UPDATE drinks SET ingredients = replace(replace(ingredients, ',"clams"', ''), '"clams",', '')
  WHERE ingredients LIKE '%"clams"%' AND ingredients LIKE '%"clam"%';
UPDATE drinks SET ingredients = replace(ingredients, '"clams"', '"clam"')
  WHERE ingredients LIKE '%"clams"%';
UPDATE drinks SET ingredients = replace(replace(ingredients, ',"pickles"', ''), '"pickles",', '')
  WHERE ingredients LIKE '%"pickles"%' AND ingredients LIKE '%"pickle"%';
UPDATE drinks SET ingredients = replace(ingredients, '"pickles"', '"pickle"')
  WHERE ingredients LIKE '%"pickles"%';
UPDATE drinks SET ingredients = replace(replace(ingredients, ',"olives"', ''), '"olives",', '')
  WHERE ingredients LIKE '%"olives"%' AND ingredients LIKE '%"olive"%';
UPDATE drinks SET ingredients = replace(ingredients, '"olives"', '"olive"')
  WHERE ingredients LIKE '%"olives"%';
UPDATE drinks SET ingredients = replace(replace(ingredients, ',"almonds"', ''), '"almonds",', '')
  WHERE ingredients LIKE '%"almonds"%' AND ingredients LIKE '%"almond"%';
UPDATE drinks SET ingredients = replace(ingredients, '"almonds"', '"almond"')
  WHERE ingredients LIKE '%"almonds"%';
UPDATE drinks SET ingredients = replace(replace(ingredients, ',"cloves"', ''), '"cloves",', '')
  WHERE ingredients LIKE '%"cloves"%' AND ingredients LIKE '%"clove"%';
UPDATE drinks SET ingredients = replace(ingredients, '"cloves"', '"clove"')
  WHERE ingredients LIKE '%"cloves"%';
UPDATE drinks SET ingredients = replace(replace(ingredients, ',"pine nuts"', ''), '"pine nuts",', '')
  WHERE ingredients LIKE '%"pine nuts"%' AND ingredients LIKE '%"pine nut"%';
UPDATE drinks SET ingredients = replace(ingredients, '"pine nuts"', '"pine nut"')
  WHERE ingredients LIKE '%"pine nuts"%';
