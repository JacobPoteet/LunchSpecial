-- A note to one player. Requests carry the anonymous device id that sent them
-- (dish_requests.player_id), so the admin can answer one: a notice with
-- player_id set is served to that device and nobody else, and it has been
-- received when announcement_views holds a row for that same id.
--
-- NULL is a broadcast, which is what every notice was before this column.
-- Additive only.

ALTER TABLE announcements ADD COLUMN player_id TEXT;
