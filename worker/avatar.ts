// Where a Discord user's avatar lives — PURE.
//
// The progress message the Activity posts shows who's playing, as an embed
// author line: their display name and their face. Discord fetches the picture
// itself from the URL we hand it, so **no avatar bytes ever pass through this
// app** — we resolve a string and forget it. That's the whole reason this is a
// URL builder and not an image proxy.
//
// The fiddly part, and the reason it's tested: "no avatar" is not one case.
// Users who never set a picture have no hash at all and get one of Discord's
// stock faces, indexed off their user id rather than off anything they own.

/** Discord's CDN. Public: these URLs are already visible beside every message the user sends. */
const CDN = "https://cdn.discordapp.com";

/** Small — it's rendered as a ~20px circle on the embed's author line. */
const SIZE = 64;

/** How many stock avatars Discord cycles through for users who never set one. */
const DEFAULT_AVATARS = 6;

/**
 * The avatar URL for a user, or the right stock face when they haven't got one.
 *
 * `hash` is Discord's `user.avatar`, which is null for a user who never uploaded
 * a picture. An animated avatar's hash starts `a_` and must be requested as a
 * GIF — asking for `.png` returns a still frame, which is a worse-looking bug
 * than it sounds because it only affects users with Nitro.
 */
export function avatarUrl(userId: string, hash: string | null | undefined): string {
  if (hash) {
    const ext = hash.startsWith("a_") ? "gif" : "png";
    return `${CDN}/avatars/${userId}/${hash}.${ext}?size=${SIZE}`;
  }
  return `${CDN}/embed/avatars/${defaultAvatarIndex(userId)}.png`;
}

/**
 * Which stock face a user without an avatar gets.
 *
 * Under Discord's current username system that's `(id >> 22) % 6`. The id is a
 * snowflake — well past 2^53 — so this has to be BigInt arithmetic; doing it in
 * `Number` silently rounds and lands everyone on the same one or two faces. An
 * id that isn't a number at all falls back to the first, because a broken
 * picture is not worth an exception on the way to posting a message.
 */
function defaultAvatarIndex(userId: string): number {
  try {
    return Number((BigInt(userId) >> 22n) % BigInt(DEFAULT_AVATARS));
  } catch {
    return 0;
  }
}

/**
 * What to call the player: their per-server nickname, else their display name,
 * else the username Discord guarantees.
 *
 * Nickname first because the message lands in that server, where that's the name
 * everyone else knows them by. Falls back to a neutral word rather than an empty
 * author line — a nameless card still says how the round went.
 */
export function displayName(user: { username?: string; global_name?: string | null }, nickname?: string | null): string {
  return nickname?.trim() || user.global_name?.trim() || user.username?.trim() || "Someone";
}
