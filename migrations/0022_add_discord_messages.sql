-- The Discord Activity's live progress message.
--
-- When a player makes their first guess inside the Activity, the app posts one
-- message into the channel they launched from and then EDITS it after every
-- later guess, so a whole round costs the channel one message instead of six.
-- Editing needs the interaction token Discord issued when the message was
-- created, and that has to survive between guesses. This table is that, and
-- deliberately nothing else.
--
-- What is NOT in here, on purpose:
--   * no Discord user id, username or avatar — the name and face live in the
--     message's embed, written once from Discord's own signed interaction
--     payload and never re-sent, so they never need storing
--   * no channel or guild id — the token already identifies the message
--   * no image — the score card is uploaded straight through to Discord
--
-- `handle` is an opaque random string minted by the client for one round. Read
-- this table cold and it tells you nothing about anybody: a random id, a
-- credential that Discord expires after 15 minutes, and a timestamp.

CREATE TABLE IF NOT EXISTS discord_messages (
  handle TEXT PRIMARY KEY,
  interaction_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rows are swept by age on write. Discord invalidates the token at 15 minutes,
-- so anything older is already useless — the sweep is tidiness, not the thing
-- that makes expiry true.
CREATE INDEX IF NOT EXISTS idx_discord_messages_created ON discord_messages(created_at);
