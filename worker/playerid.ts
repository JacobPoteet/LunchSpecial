// The one place a Discord user id is touched (GitHub #251).
//
// Discord's mobile app drops the Activity's storage when the app is quit, so
// the anonymous device id cannot be what remembers a player there. The Worker
// already holds the player's access token for a moment during the token
// exchange; it asks Discord who that is, turns the answer into an opaque
// string, and forgets the answer.
//
// What leaves this module is `d-` plus 32 hex characters of HMAC-SHA256(secret,
// user id). It cannot be turned back into the Discord id without the secret,
// and it is not stored next to a name, an avatar or anything else Discord
// returned: the rest of the user object is never read. The id is stable for as
// long as PLAYER_ID_SECRET is, which is why it is its own secret and not
// SESSION_SECRET (rotating that one logs the admin out and must stay cheap).

const encoder = new TextEncoder();

/** A Discord user id is a snowflake: digits only. Anything else is not one. */
const SNOWFLAKE = /^\d{5,25}$/;

export async function derivePlayerId(discordUserId: unknown, secret: string | undefined): Promise<string | null> {
  // An unset secret arrives as undefined and would sign with the string "undefined".
  if (!secret || typeof discordUserId !== "string" || !SNOWFLAKE.test(discordUserId)) return null;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`player:${discordUserId}`)));
  const hex = [...mac.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `d-${hex}`;
}

/** The signed claim `/progress` accepts: who this request is, proven at the token exchange. */
export const PLAYER_CLAIM = "player:";

/** Long enough for a long sitting; the next launch mints a fresh one. */
export const PLAYER_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
