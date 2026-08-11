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
 * The one scope presence is *known* to need: `rpc.activities.write`, which
 * grants `setActivity`.
 *
 * ---- THIS LIST IS AN OPEN EXPERIMENT. Read before changing it. ----
 *
 * Presence first shipped with exactly this one entry and never appeared on
 * anyone's profile. The fix that made it work changed **two** things at once —
 * it added `identify` *and* started sending `type: 0` — so which of them was
 * load-bearing was never established. This reverts the scope half alone, with
 * `type` left in, to find out.
 *
 * The suspicion against `identify` was that `authenticate()` is an identity
 * call: the SDK parses its reply against a schema where `user` (username,
 * discriminator, id, public_flags) is **required and non-optional**, and a
 * token without `identify` can't produce that object, so the parse throws and
 * every later `setActivity` is dead. Discord's documented example pairs the two
 * scopes. That's a good argument and it may well be right — but it was never
 * observed, and the alternative (the missing `type`) explains the symptom just
 * as well.
 *
 * It matters because the sheet `identify` adds asks a new player for their
 * username, avatar and banner to play a game that has no accounts and stores
 * nothing about them. That's a real cost at the worst possible moment, and it
 * shouldn't be paid on an inference.
 *
 * **To settle it:** deploy this, revoke the existing grant (User Settings →
 * Authorized Apps → Lunch Special — otherwise `prompt: "none"` silently reuses
 * what was already approved and the run proves nothing), then open the Activity
 * and read the console.
 *   - `[discord] Rich Presence active: …`      → `identify` was never needed.
 *     Delete this whole block, keep the one entry, and record that it was
 *     measured.
 *   - `[discord] … (failed at: authenticate)`  → it is genuinely required.
 *     Put `identify` back with that finding written down, so nobody spends a
 *     third round trip on it.
 * Either way, replace this comment with the answer.
 */
const SCOPES = ["rpc.activities.write"] as const;

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
  // Which of the three hops we're on, so a failure names itself in the console.
  // This flow is only reproducible inside the real Discord client, where the
  // difference between "they declined", "the Worker isn't configured" and "the
  // handshake rejected our token" is otherwise one indistinguishable warning.
  let step = "authorize";
  try {
    const { code } = await instance.commands.authorize({
      client_id: clientId,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: [...SCOPES],
    });

    step = "token exchange";
    const res = await fetch("/api/discord/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error(`/api/discord/token answered ${res.status}`);
    const { accessToken } = (await res.json()) as { accessToken?: string };
    if (!accessToken) throw new Error("/api/discord/token returned no access token");

    step = "authenticate";
    await instance.commands.authenticate({ access_token: accessToken });
    return true;
  } catch (err) {
    // Includes the player simply declining. Logged, then dropped: the game is
    // unaffected and re-asking on the next guess would be harassment.
    console.warn(`[discord] Rich Presence unavailable (failed at: ${step}) — skipping profile updates:`, err);
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
