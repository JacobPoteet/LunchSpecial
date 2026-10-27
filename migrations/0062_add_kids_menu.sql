-- The Kids Menu (shared/kidsmenu.ts): an opt-in short list of the dishes that
-- still fit, offered from the fourth miss. Three facts about its use, all
-- written by the Worker's own routes, never by a beacon:
--
--   analytics_rounds.kids_menu_at     Guesses on the board when the menu was
--                                     first opened (4 or 5). Stamped once by
--                                     POST /api/kids-menu. NULL is a round that
--                                     never opened it, or one from before this
--                                     shipped; read it only over rounds that
--                                     reached a fourth miss after the ship day.
--   analytics_guesses.from_kids_menu  1 when the guess was ordered off the
--                                     card, 0 when it came from the order bar.
--                                     NULL before this shipped (unmeasured).
--   kids_menu_peeks                   One row per "What's in it?" a tracked
--                                     round spent, which is also how the Worker
--                                     holds a round to MENU_PEEKS. The primary
--                                     key makes a second peek at the same dish
--                                     free. No FK to analytics_rounds, like the
--                                     guess ledger: a blocked /start must not
--                                     drop it. player_id rides along so a
--                                     device wipe reaches it.
--
-- The cohort the Experiments tab reads, "rounds that reached a fourth miss",
-- needs no column: it is a guess 4 whose dish is not the target in
-- analytics_guesses (from 0053), or a finished Special with guesses >= 5.
--
-- Nothing identifies a player. Additive only.

ALTER TABLE analytics_rounds ADD COLUMN kids_menu_at INTEGER;
ALTER TABLE analytics_guesses ADD COLUMN from_kids_menu INTEGER;

CREATE TABLE IF NOT EXISTS kids_menu_peeks (
  round_id   TEXT NOT NULL,
  dish_id    INTEGER NOT NULL,
  player_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (round_id, dish_id)
);

CREATE INDEX IF NOT EXISTS idx_kids_menu_peeks_player ON kids_menu_peeks(player_id);
