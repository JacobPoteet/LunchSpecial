-- The language a round was played in, and a request was sent in (#269).
--
--   analytics_rounds.locale   Stamped by POST /api/rounds/start, insert-only
--                             like `kind` and `surface`.
--   dish_requests.locale      Stamped by POST /api/requests.
--
-- The client's resolved language, re-checked by the Worker against the shipped
-- list (shared/locale.ts, `shippedLocale`): a tag like "en" or "es", NULL for
-- anything else, the pseudo-locale included. NULL is also every row from
-- before this shipped. NULL is "not measured", never English.
--
-- A language is a setting, not an identity. Additive only.

ALTER TABLE analytics_rounds ADD COLUMN locale TEXT;
ALTER TABLE dish_requests ADD COLUMN locale TEXT;
