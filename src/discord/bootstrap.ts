// Discord Activity bootstrap.
//
// Lunch Special ships as ONE Cloudflare Worker that serves both the public
// website and — when framed inside Discord — a Discord Activity. There is no
// separate build: this module is the only Discord-specific client code, and it
// activates purely at runtime when the app detects it is running inside
// Discord's iframe. On the plain web, `initDiscord()` returns immediately and
// the Embedded App SDK is never even downloaded (it's behind a dynamic import).
//
// Scope: "minimal embed" — we complete the SDK handshake so the Activity loads
// and then let the existing game run anonymously, exactly as it does on the web
// (localStorage state, no accounts). OAuth / per-user identity is intentionally
// not wired up yet; see CLAUDE.md.

import type { DiscordSDK } from "@discord/embedded-app-sdk";
import type { Surface } from "../../shared/types";

/**
 * The query params Discord adds to the Activity iframe URL. `frame_id` is the
 * detection signal; the rest are what the Embedded App SDK reads back out of
 * the URL, so they all have to survive an in-app navigation.
 */
const DISCORD_PARAM_KEYS = [
  "frame_id",
  "instance_id",
  "platform",
  "channel_id",
  "guild_id",
  "location_id",
  "custom_id",
  "referrer_id",
  "mobile_app_version",
] as const;

/** sessionStorage slot holding this tab's Discord params (see `discordParams`). */
const DISCORD_PARAMS_KEY = "lunch-special:discord-params";

/**
 * Discord's params for this tab, serialized as a query string ("" on the web).
 *
 * The game navigates between modes by assigning a fresh URL (no router), which
 * wipes the query string — so Chef's Choice and Leftovers used to land on a
 * `frame_id`-less URL and every round after the first was logged as a web play.
 * We capture the params on the first load of the tab and stash them in
 * sessionStorage (tab-scoped, exactly like an Activity session), so both the
 * surface check and {@link surfaceUrl} keep working after any navigation.
 */
const discordParams = ((): string => {
  const read = () => {
    try {
      return window.sessionStorage.getItem(DISCORD_PARAMS_KEY) ?? "";
    } catch {
      return "";
    }
  };

  const url = new URLSearchParams(window.location.search);
  if (!url.has("frame_id")) return read();

  const kept = new URLSearchParams();
  for (const key of DISCORD_PARAM_KEYS) {
    const value = url.get(key);
    if (value !== null) kept.set(key, value);
  }
  const serialized = kept.toString();
  try {
    window.sessionStorage.setItem(DISCORD_PARAMS_KEY, serialized);
  } catch {
    // Private mode / storage disabled: fall back to URL-only detection.
  }
  return serialized;
})();

/**
 * True when we're running inside the Discord client's Activity iframe. Discord
 * always appends `frame_id` (plus `instance_id`, `platform`, …) to the iframe
 * URL, so its presence is the canonical "am I an Activity?" signal — the same
 * check the SDK itself uses internally. Strictly URL-based: the SDK handshake
 * needs the real params on *this* page load.
 */
export function isDiscordActivity(): boolean {
  return new URLSearchParams(window.location.search).has("frame_id");
}

/**
 * Which surface the player is on, for analytics: the Discord Activity embed or
 * the open web. Sticky for the tab (see `discordParams`) so archive/random
 * rounds aren't miscounted as web plays. Stable for the session, so it's safe
 * to read at beacon time.
 */
export function currentSurface(): Surface {
  return discordParams !== "" ? "discord" : "web";
}

/**
 * Rewrite an in-app URL so it keeps the player on the same surface: inside
 * Discord it re-attaches the Activity params the assignment would otherwise
 * drop (params already on `url` win). A no-op on the open web.
 */
export function surfaceUrl(url: string): string {
  if (discordParams === "") return url;
  const [path, query] = url.split("?");
  const merged = new URLSearchParams(discordParams);
  if (query) for (const [key, value] of new URLSearchParams(query)) merged.set(key, value);
  return `${path}?${merged.toString()}`;
}

/** How long to wait on the Activity handshake before mounting the game regardless. */
const READY_TIMEOUT_MS = 5000;

/**
 * When embedded in Discord, download + initialize the Embedded App SDK and
 * complete the `ready()` handshake. Resolves to the live SDK instance, or
 * `null` when running on the open web (or if init fails — we never block the
 * game from rendering over a Discord hiccup).
 *
 * Awaited once in main.tsx before React mounts.
 *
 * Note: nothing in the game currently *uses* the SDK — sharing a result inside
 * the Activity copies the score card to the clipboard for the player to paste
 * (the SDK's `shareLink` modal kept failing). The handshake still has to happen
 * or Discord never shows the Activity at all.
 */
export async function initDiscord(): Promise<DiscordSDK | null> {
  if (!isDiscordActivity()) return null;

  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId) {
    console.error(
      "[discord] Running as an Activity but VITE_DISCORD_CLIENT_ID is unset at build time — the SDK cannot initialize.",
    );
    return null;
  }

  try {
    // Dynamic import: keeps the SDK out of the standalone web bundle entirely
    // (tree-shaken/code-split), so open-web visitors pay nothing for it.
    const { DiscordSDK } = await import("@discord/embedded-app-sdk");
    const sdk = new DiscordSDK(clientId);
    const handshake = sdk
      .ready()
      .then(() => sdk)
      .catch((err: unknown) => {
        console.error("[discord] SDK ready() failed:", err);
        return null;
      });
    // `ready()` waits on Discord's RPC parent, so race it: mode switches re-run
    // this handshake on every page load, and a stalled one would leave the
    // player staring at a blank iframe. The game itself doesn't need the SDK to
    // render, so mounting without it is always better.
    const timedOut = Symbol("timeout");
    const result = await Promise.race([
      handshake,
      new Promise<typeof timedOut>((resolve) => setTimeout(() => resolve(timedOut), READY_TIMEOUT_MS)),
    ]);
    if (result === timedOut) {
      console.warn(`[discord] SDK ready() didn't resolve in ${READY_TIMEOUT_MS}ms — mounting the game anyway.`);
      return null;
    }
    return result;
  } catch (err) {
    // A failed handshake shouldn't white-screen the game. Log and let the
    // React app mount anyway.
    console.error("[discord] Embedded App SDK failed to initialize:", err);
    return null;
  }
}
