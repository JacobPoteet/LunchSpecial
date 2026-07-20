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

import type { Surface } from "../../shared/types";

/**
 * True when we're running inside the Discord client's Activity iframe. Discord
 * always appends `frame_id` (plus `instance_id`, `platform`, …) to the iframe
 * URL, so its presence is the canonical "am I an Activity?" signal — the same
 * check the SDK itself uses internally.
 */
export function isDiscordActivity(): boolean {
  return new URLSearchParams(window.location.search).has("frame_id");
}

/**
 * Which surface the player is on, for analytics: the Discord Activity embed or
 * the open web. Same synchronous `frame_id` check as {@link isDiscordActivity} —
 * stable for the session, so it's safe to read at beacon time.
 */
export function currentSurface(): Surface {
  return isDiscordActivity() ? "discord" : "web";
}

/**
 * When embedded in Discord, download + initialize the Embedded App SDK and
 * complete the `ready()` handshake. Resolves to the live SDK instance, or
 * `null` when running on the open web (or if init fails — we never block the
 * game from rendering over a Discord hiccup).
 *
 * Awaited once in main.tsx before React mounts.
 */
export async function initDiscord(): Promise<unknown | null> {
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
    await sdk.ready();
    return sdk;
  } catch (err) {
    // A failed handshake shouldn't white-screen the game. Log and let the
    // React app mount anyway.
    console.error("[discord] Embedded App SDK failed to initialize:", err);
    return null;
  }
}
