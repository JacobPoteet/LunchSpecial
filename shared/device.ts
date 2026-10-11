// The anonymous device id's two homes, and what a Discord round can say about
// the client it ran on (GitHub #251).
//
// Shared by both halves: the client classifies and builds the cookie, the
// Worker re-checks the two closed sets before anything is stored. Nothing here
// is about who the player is. `client` is the kind of app, `deviceFrom` is which
// store this page load found the id in, and neither can tell two people apart.

/**
 * Which Discord client a round ran in. `desktop` is the installed app, `browser`
 * is discord.com in a web browser, `mobile` is the phone app.
 *
 * Discord's own `platform` param says only desktop or mobile, and reports the
 * browser client as desktop. The installed app is Electron and says so in its
 * user agent, which is what splits the two.
 */
export const DISCORD_CLIENTS = ["desktop", "browser", "mobile"] as const;
export type DiscordClient = (typeof DISCORD_CLIENTS)[number];

/**
 * Where this page load found its device id: `storage` (localStorage had it),
 * `cookie` (localStorage came back empty and the cookie mirror restored it), or
 * `new` (neither had one, so it was minted). A Discord device that keeps showing
 * `new` is one whose client keeps neither store.
 */
export const DEVICE_ID_ORIGINS = ["storage", "cookie", "new"] as const;
export type DeviceIdOrigin = (typeof DEVICE_ID_ORIGINS)[number];

/** The installed desktop app's user agent carries `discord/<version>` and `Electron/<version>`. */
const DESKTOP_APP = /\b(discord|electron)\/\d/i;

/**
 * Classify the Discord client from the Activity's `platform` param and the user
 * agent. Null when the param is missing or unknown: unmeasured, never a guess.
 */
export function discordClientOf(platform: string | null, userAgent: string): DiscordClient | null {
  if (platform === "mobile") return "mobile";
  if (platform === "desktop") return DESKTOP_APP.test(userAgent) ? "desktop" : "browser";
  return null;
}

/** A client-supplied `client`, kept only when it is one of the closed set. */
export function normalizeClient(raw: unknown): DiscordClient | null {
  return DISCORD_CLIENTS.includes(raw as DiscordClient) ? (raw as DiscordClient) : null;
}

/** A client-supplied `deviceFrom`, kept only when it is one of the closed set. */
export function normalizeDeviceOrigin(raw: unknown): DeviceIdOrigin | null {
  return DEVICE_ID_ORIGINS.includes(raw as DeviceIdOrigin) ? (raw as DeviceIdOrigin) : null;
}

/** The cookie that mirrors `lunch-special:player`. */
export const DEVICE_COOKIE = "ls_device";

/** 400 days, the longest lifetime Chromium honours. */
export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/** Both shapes `getPlayerId` mints (a UUID, or `<ms>-<base36>`); anything else in the cookie is ignored. */
const DEVICE_VALUE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * The device id in a `document.cookie` string, or null.
 *
 * Read by the client only. The Worker receives the cookie on every request
 * and never reads it: an id is bound to a round by `/start` and nowhere else.
 */
export function readDeviceCookie(cookies: string): string | null {
  for (const part of cookies.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== DEVICE_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return DEVICE_VALUE.test(value) ? value : null;
  }
  return null;
}

/**
 * The `document.cookie` assignment that stores `id`.
 *
 * `SameSite=None; Secure; Partitioned` because inside Discord's browser client
 * the game is a third-party iframe on discord.com. Partitioned (CHIPS) is what
 * lets Chromium keep it there, keyed to discord.com, which is the same key its
 * localStorage already sits under. Null for an id this module would refuse to
 * read back.
 */
export function deviceCookie(id: string): string | null {
  if (!DEVICE_VALUE.test(id)) return null;
  return `${DEVICE_COOKIE}=${id}; Max-Age=${DEVICE_COOKIE_MAX_AGE}; Path=/; Secure; SameSite=None; Partitioned`;
}
