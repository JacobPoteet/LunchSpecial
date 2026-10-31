-- The Kids' Menu's card size (shared/kidsmenu.ts): how many dishes the card
-- printed, each time a tracked lunch round opened it. One row per board, so a
-- round that opened at the fourth miss and again at the fifth has two:
--
--   at_guess   Guesses on the board, 4 or 5 (the board the card was built for).
--   dishes     Dishes the card listed, the Special among them. Always >= 1.
--   opened_at  When the Worker built it; the first build of that board wins.
--
-- Written by POST /api/kids-menu from the menu it has just built, never by a
-- beacon, and only for a round that has an analytics_rounds row (a blocked
-- /start records no open, as kids_menu_at already does). No player_id: a row
-- is reached through its round, and wiping a device deletes these first.
-- Rounds before this migration have no rows: their card size is unmeasured,
-- never zero. analytics_rounds.kids_menu_at stays the first-open stamp.
--
-- Nothing identifies a player. Additive only.

CREATE TABLE IF NOT EXISTS kids_menu_opens (
  round_id TEXT NOT NULL,
  at_guess INTEGER NOT NULL,
  dishes INTEGER NOT NULL,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (round_id, at_guess)
);
