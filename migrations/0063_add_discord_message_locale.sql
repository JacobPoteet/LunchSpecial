-- The language of a Discord progress message (worker/routes/discord.ts).
--
-- The message is written once from the signed interaction and edited after
-- every guess, and the edits must stay in the language it started in. The
-- interaction carries the server's language (`guild_locale`); the Worker
-- matches it to a reviewed locale and keeps the tag here for the edits.
--
-- A shipped locale tag ("en", "es"), never Discord's raw value, and the
-- server's setting, not the player's: nothing here identifies anybody. NULL is
-- a row from before this shipped, or a server whose language we don't speak
-- yet, and reads as English. Additive only.

ALTER TABLE discord_messages ADD COLUMN locale TEXT;
