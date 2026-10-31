-- Osso Focaccia (id 179) carried plain focaccia's pantry and duplicated
-- Focaccia, so it leaves the pool (#279). Deactivated, never deleted: the row,
-- its id and its slug still resolve for anything that points at them. It has
-- no schedule rows, past or future, so nothing booked is affected.
UPDATE dishes SET is_active = 0 WHERE slug = 'osso-focaccia';
