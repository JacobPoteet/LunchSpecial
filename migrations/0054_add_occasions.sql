-- Occasions: the days the diner dresses up (Halloween first).
--
-- Every costume is handcrafted in src/occasions/<id>/ and every occasion has a
-- default window in code (shared/occasions.ts), so a holiday turns up on time
-- with this table empty. A row here is /admin overriding that window for one
-- season: shifting it, shortening it, switching it off (is_active = 0), or
-- running a costume outside its season. A booking that touches a season speaks
-- for the whole of it; the fold is in shared/occasions.ts.
--
-- Pool-style rule as for `schedule`: no migration or seed ever INSERTs here.
-- Booking happens in /admin and unbooked seasons run on the code's window.
--
-- `occasion_id` is a key of OCCASIONS, checked by the Worker on write rather
-- than by a CHECK, so adding an occasion is a code change and never a
-- migration. A row naming an id the code no longer knows is ignored.

CREATE TABLE IF NOT EXISTS occasion_bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  occasion_id TEXT    NOT NULL,
  start_date  TEXT    NOT NULL, -- ET day for lunch, night key for the bar, inclusive
  end_date    TEXT    NOT NULL, -- inclusive
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_occasion_bookings_dates ON occasion_bookings(start_date, end_date);

-- Which costume the round was played in, stamped by the Worker on insert from
-- the round's own day (play_date) and the bookings at that moment, like
-- `country`. The client sends nothing. NULL on every row before this shipped
-- means unmeasured, never "no occasion"; NULL after it means a plain day.
ALTER TABLE analytics_rounds ADD COLUMN occasion TEXT;
