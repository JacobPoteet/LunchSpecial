// Discord Rich Presence — the plumbing.
//
// What the player's Discord profile says while they're playing ("Playing Lunch
// Special / Today's Special · No. 26 / Guess 3 of 6"). The *copy* is a pure fold
// in shared/presence.ts; this module owns one thing Discord cares about: the
// rate at which updates are allowed to leave. The OAuth it rides on moved to
// src/discord/auth.ts, which the share upload shares.
//
// Everything here is best-effort and silent on failure. Rich Presence is a
// flourish on someone else's profile — the game must never wait on it, and a
// Discord hiccup must never surface to the player as an error.

import type { DiscordSDK } from "@discord/embedded-app-sdk";
import type { PresenceActivity } from "../../shared/presence";
import { ensureAuthorized } from "./auth";

/** Activity type 0 = "Playing", the header Discord puts above the two lines. */
const ACTIVITY_TYPE_PLAYING = 0;

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
 * Kick off (or join) the Activity's single authorization, then flush. The token
 * itself is the share upload's business; all presence needs to know is whether
 * `setActivity` will be accepted.
 */
function requestAuthorization(instance: DiscordSDK): void {
  void ensureAuthorized(instance).then((token) => {
    authorized = token !== null;
    unavailable = token === null;
    if (authorized) flush();
  });
}

/**
 * Push `desired` to Discord if it differs from what's already showing and the
 * rate limit allows it; otherwise arm a timer to try again the moment it does.
 */
function flush(): void {
  if (!sdk || !desired || unavailable) return;
  if (!authorized) {
    requestAuthorization(sdk);
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

  // `type` is a protocol detail rather than copy, so it's composed in here
  // instead of in the fold. Every documented example carries it.
  const activity = { type: ACTIVITY_TYPE_PLAYING, ...desired };
  const first = sent === "";
  sent = payload;
  sentAt = Date.now();
  sdk.commands.setActivity({ activity }).then(
    () => {
      // One line, once, so "is presence even running?" is answerable from the
      // console without reproducing a failure.
      if (first) console.info("[discord] Rich Presence active:", activity.details, "·", activity.state);
    },
    (err: unknown) => {
      // Let the same state be retried on the next change rather than latching a
      // failed update as "already showing".
      sent = "";
      console.warn("[discord] setActivity failed:", err);
    },
  );
}
