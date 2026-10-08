-- What people guess, one row per submitted guess.
--
-- Until now the beacons recorded that a round was played and how it ended, and
-- never what was ordered. That left two questions unanswerable: which wrong dish
-- do players converge on (a clue that misleads looks identical to a hard dish),
-- and what do they reach for that the menu does not carry.
--
-- Written by the Worker inside POST /api/guess and /api/night/guess, not by a new
-- client beacon. Those routes already receive every guess, so this adds no URL
-- for an ad blocker to match and no request that can be blocked on its own. The
-- client sends its round id along with the guess, and only when the round is
-- tracked; a preview or a playtest sends none and is never recorded.
--
-- A guess is a pick from the catalogue, never free text, so there is nothing
-- personal in a row. It is tied to a device only through round_id ->
-- analytics_rounds.player_id, the same anonymous UUID the round beacons carry.
--
-- Two catalogues, so two pairs of columns, the same split analytics_rounds makes
-- with dish_id / drink_id (migrations/0041). One shared id column would need a
-- discriminator to be read safely. Exactly one pair is set; the CHECK says so.
--
-- `target_*` is stored on the row, not joined from `schedule`: Chef's Choice
-- rounds are never in `schedule`, and a Nightcap must never join against it.
--
-- No foreign key to analytics_rounds. The guess lands before the /start beacon
-- on the first guess, and a blocked beacon must not take the guess down with it.
-- A guess with no round row is reported as untracked, never assigned a kind.
--
-- The primary key makes a retried request a no-op, and DO NOTHING in the insert
-- means the first write wins, so a replay cannot rewrite what was guessed.
--
-- Additive only. Days before this ships have NO rows, which is unmeasured, not
-- "nobody guessed".

CREATE TABLE IF NOT EXISTS analytics_guesses (
  round_id         TEXT NOT NULL,
  guess_number     INTEGER NOT NULL,
  guessed_dish_id  INTEGER,
  target_dish_id   INTEGER,
  guessed_drink_id INTEGER,
  target_drink_id  INTEGER,
  correct          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (round_id, guess_number),
  CHECK (
    (guessed_dish_id IS NOT NULL AND target_dish_id IS NOT NULL
       AND guessed_drink_id IS NULL AND target_drink_id IS NULL)
    OR
    (guessed_drink_id IS NOT NULL AND target_drink_id IS NOT NULL
       AND guessed_dish_id IS NULL AND target_dish_id IS NULL)
  )
);

-- "Which wrong answers does this dish draw": the dashboard's first read.
CREATE INDEX IF NOT EXISTS idx_analytics_guesses_target_dish
  ON analytics_guesses(target_dish_id, guessed_dish_id);
CREATE INDEX IF NOT EXISTS idx_analytics_guesses_target_drink
  ON analytics_guesses(target_drink_id, guessed_drink_id);
