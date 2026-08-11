// Discord Rich Presence — the plumbing.
//
// What the player's Discord profile says while they're playing ("Playing Lunch
// Special / Today's Special · No. 26 / Guess 3 of 6"). The *copy* is a pure fold
// in shared/presence.ts; this module owns the parts that touch Discord: the one
// OAuth scope it takes, and the rate at which updates are allowed to leave.
//
// Everything here is best-effort and silent on failure. Rich Presence is a
// flourish on someone else's profile — the game must never wait on it, and a
// Discord hiccup must never surface to the player as an error.

import type { DiscordSDK } from "@discord/embedded-app-sdk";
import type { PresenceActivity } from "../../shared/presence";

/**
 * The only scope we ask for.
 *
 * `setActivity` is gated behind `rpc.activities.write`, so — unlike the rest of
 * the game — presence genuinely requires an OAuth round trip. We deliberately
 * ask for nothing else: not `identify`, not `guilds`. The app still never learns
 * who the player is, so the anonymous model (localStorage state, no accounts)
 * survives intact; all we buy is the right to write one line onto their own
 * profile. Keep this list at one entry.
 */
const SCOPES = ["rpc.activities.write"] as const;

/**
 * Discord's RPC rate limit for SET_ACTIVITY is 5 updates per 20 seconds, so one
 * every 4s is the fastest we may push. A round can't legitimately change state
 * that often — but React effects can re-run, and a burst that trips the limit
 * would drop the *interesting* update (the win) rather than the noise.
 */
const MIN_UPDATE_INTERVAL_MS = 4000;

let sdk: DiscordSDK | null = null;
/** Latest presence the game wants shown; null until the board resolves. */
let desired: PresenceActivity | null = null;
/** Serialized copy of what Discord was last told, so identical updates cost nothing. */
let sent = "";
let sentAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let authorizing: Promise<boolean> | null = null;
let authorized = false;
/** Sticky: a refused or broken authorization must not re-prompt on every guess. */
let unavailable = false;

/**
 * Hand the live SDK instance over once the Activity handshake completes.
 *
 * Called from initDiscord() on the handshake's own resolution, NOT on the
 * branch that wins the mount race — a handshake that lands at 5.1s is a
 * perfectly good SDK, and gating this on that timer is exactly the bug that
 * silently killed the Discord share button (see CLAUDE.md).
 */
export function attachPresence(instance: DiscordSDK): void {
  sdk = instance;
  flush();
}

/**
 * Publish what the player is doing. Cheap to call on every render: identical
 * activities are dropped, and the first call is what triggers authorization —
 * so a player who never opens a real board never sees a consent prompt.
 */
export function setPresence(activity: PresenceActivity): void {
  desired = activity;
  flush();
}

/**
 * Trade the Activity's authorization code for an access token and hand it back
 * to the Discord client. The code alone is useless without the app's client
 * secret, which lives on the Worker — hence the /api/discord/token hop.
 *
 * `prompt: "none"` keeps this silent for anyone who has authorized the app
 * before; the consent sheet is a first-launch cost only.
 */
async function authorize(instance: DiscordSDK): Promise<boolean> {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId) return false;
  try {
    const { code } = await instance.commands.authorize({
      client_id: clientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: [...SCOPES],
    });
    const res = await fetch("/api/discord/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
    const { accessToken } = (await res.json()) as { accessToken?: string };
    if (!accessToken) throw new Error("token exchange returned no access token");
    await instance.commands.authenticate({ access_token: accessToken });
    return true;
  } catch (err) {
    // Includes the player simply declining. Logged, then dropped: the game is
    // unaffected and re-asking on the next guess would be harassment.
    console.warn("[discord] Rich Presence unavailable — skipping profile updates:", err);
    return false;
  }
}

/** Authorize at most once per page load, whatever the outcome. */
function ensureAuthorized(instance: DiscordSDK): void {
  if (authorizing) return;
  authorizing = authorize(instance).then((ok) => {
    authorized = ok;
    unavailable = !ok;
    if (ok) flush();
    return ok;
  });
}

/**
 * Push `desired` to Discord if it differs from what's already showing and the
 * rate limit allows it; otherwise arm a timer to try again the moment it does.
 */
function flush(): void {
  if (!sdk || !desired || unavailable) return;
  if (!authorized) {
    ensureAuthorized(sdk);
    return;
  }

  const payload = JSON.stringify(desired);
  if (payload === sent) return;

  const wait = sentAt + MIN_UPDATE_INTERVAL_MS - Date.now();
  if (wait > 0) {
    // A trailing update, not a dropped one: whatever `desired` holds when the
    // timer fires is what gets sent, so the newest state always wins.
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, wait);
    }
    return;
  }

  const activity = desired;
  sent = payload;
  sentAt = Date.now();
  sdk.commands.setActivity({ activity }).catch((err: unknown) => {
    // Let the same state be retried on the next change rather than latching a
    // failed update as "already showing".
    sent = "";
    console.warn("[discord] setActivity failed:", err);
  });
}
