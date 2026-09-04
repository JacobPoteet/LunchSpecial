-- After Dark: the back bar.
--
-- Drinks get their own tables rather than a `kind` column on `dishes`. The
-- deciding argument is the failure mode, not the duplication: roughly ten
-- queries in this codebase read the dish pool as `WHERE is_active = 1` with no
-- kind filter (the guess list, the fallback pick, the shuffle, autofill, the
-- menu mix, the dish report). Retrofitting `AND kind = 'dish'` onto all of them
-- works right up until someone adds the eleventh, and the way you find out is a
-- Negroni going out as Tuesday's lunch Special.
--
-- The columns are not the dish columns either. `course` says nothing when every
-- row is a drink, and no drink has a `protein`. Those two tiles become `spirit`
-- and `profile`, which is the whole reason a drink round plays differently.
--
-- Additive only, and touched by nothing that already exists. Safe against prod
-- on the next release.

CREATE TABLE drinks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL,
  -- The same nine buckets as dishes, driving the same yellow near-match.
  region TEXT NOT NULL,
  -- Replaces `course`. 'none' is "no base spirit" (a mocktail, a coffee, a
  -- tea), which is NOT the same claim as non-alcoholic: beer and wine are their
  -- own values and are very much alcoholic. See is_alcoholic below.
  spirit TEXT NOT NULL CHECK (spirit IN
    ('gin','whiskey','rum','tequila','vodka','brandy','wine','beer','none','other')),
  temperature TEXT NOT NULL CHECK (temperature IN ('hot','cold')),
  -- Replaces `protein`. How it drinks, not what is in it.
  profile TEXT NOT NULL CHECK (profile IN ('sweet','sour','bitter','strong','creamy')),
  -- JSON array of canonical lowercase ingredient names, same vocabulary as
  -- dishes so a spelling is never forked across the two catalogues.
  ingredients TEXT NOT NULL DEFAULT '[]',
  -- Stored, never derived. spirit='other' covers both arak (alcoholic) and kava
  -- (not), and spirit='none' covers both a mocktail and a coffee. Nothing about
  -- the base spirit settles this, and the admin needs it to keep the pool's mix
  -- honest -- a bar that is 95% booze is a different game from one that isn't.
  -- It is deliberately NOT a feedback tile: `spirit` already carries the signal
  -- a player can act on, and a boolean tile is a coin flip.
  is_alcoholic INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  -- Credit only, exactly as on dishes: nothing about scheduling, the fallback
  -- pick, feedback or analytics reads it.
  is_fan_submission INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Three coasters, not five clue tickets. Four guesses means at most three
-- misses, so a fourth row could never be printed and would be dead weight the
-- writer still had to fill.
CREATE TABLE drink_clues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drink_id INTEGER NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL CHECK (order_index BETWEEN 1 AND 3),
  text TEXT NOT NULL,
  UNIQUE (drink_id, order_index)
);

-- One drink a night. `night` is the LOCAL calendar day the evening began on
-- (shared/night.ts), not an ET day like `schedule.date` -- the bar's window is
-- the player's own 20:00-03:00, so two players on the same night are not on the
-- same ET day and never were. Every player on their own night N gets this row.
CREATE TABLE drink_schedule (
  night TEXT PRIMARY KEY CHECK (night GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  drink_id INTEGER NOT NULL REFERENCES drinks(id)
);

CREATE INDEX idx_drink_clues_drink ON drink_clues(drink_id);
CREATE INDEX idx_drink_schedule_drink ON drink_schedule(drink_id);
