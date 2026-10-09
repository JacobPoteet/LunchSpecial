-- Occasions: the days the diner dresses up (Halloween first).
--
-- Every costume is handcrafted in src/occasions/<id>/. A row here is one run of
-- one costume, booked on the admin's Events page exactly like a notice: dates
-- both ends inclusive, is_active outranks the dates, and live rows never
-- overlap (the Worker refuses). No row, no costume. The fold is in
-- shared/occasions.ts.
--
-- Pool-style rule as for `schedule`: no migration or seed ever INSERTs here.
-- Booking happens in /admin.
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
