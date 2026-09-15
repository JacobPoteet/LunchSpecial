-- Which catalogue a player suggestion is for. The tab (After Dark's check) now
-- carries the same suggest form the diner's check does, and a drink asked for
-- at the bar lands in the same inbox as a dish asked for at lunch. `kind` is
-- what keeps the two apart in /admin: dish requests copy out as a
-- /create-dishes line and drinks as /create-drinks, and "Add as" opens the
-- right editor.
--
-- A column, not a second table. The catalogues are separate tables because ten
-- queries read the dish pool unfiltered and a drink in it would go out as a
-- lunch Special. The inbox has three queries and its worst case is a
-- mislabelled message. Additive: existing rows are dishes, which is what they
-- all were.

ALTER TABLE dish_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'dish';
