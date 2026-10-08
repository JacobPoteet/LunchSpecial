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
-- personal in a row. player_id is the same anonymous device UUID the round
-- beacons carry, stored on the row so a device wipe reaches guesses whose round
-- row never landed (a blocked /start). NULL when the client sent none.
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
-- The primary key keeps one row per guess number. The insert's DO UPDATE means
-- the last write wins: a client retries a number only when it never saw the
-- response, and the dish it sends then is the one on its board.
--
-- Whether a guess was right is not stored: it is guessed_* = target_*.
--
-- Additive only. Days before this ships have NO rows, which is unmeasured, not
-- "nobody guessed".

CREATE TABLE IF NOT EXISTS analytics_guesses (
  round_id         TEXT NOT NULL,
  guess_number     INTEGER NOT NULL,
  player_id        TEXT,
  guessed_dish_id  INTEGER,
  target_dish_id   INTEGER,
  guessed_drink_id INTEGER,
  target_drink_id  INTEGER,
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
-- The device review and wipe.
CREATE INDEX IF NOT EXISTS idx_analytics_guesses_player
  ON analytics_guesses(player_id);
