// The Activity's one authorization, and the token it yields.
//
// This used to live inside presence.ts, back when Rich Presence was the only
// thing that needed OAuth. Sharing the check into the channel needs the same
// token (Discord's attachment endpoint takes a user bearer of any scopes), so
// the flow moved here and the token is now kept instead of dropped after
// `authenticate()`. Nothing else changed: same two scopes, same silent prompt,
// same once-per-page-load rule.
//
// Everything here is best-effort. A player who declines, or a deployment with no
// Discord secrets configured, loses the presence line and the native share and
// keeps the whole game — nothing may ever wait on this.

import type { DiscordSDK } from "@discord/embedded-app-sdk";

/**
 * Both scopes the Activity takes. Not one, and not three.
 *
 * `rpc.activities.write` grants `setActivity`. `identify` is required by the
 * `authenticate()` hop: the SDK parses its reply against a schema where `user`
 * (username, discriminator, id, public_flags) is **required and non-optional**,
 * so a token that can't produce that object fails the parse — and every later
 * `setActivity` with it.
 *
 * **This was measured, not reasoned** (GitHub #101 → #106). The list was
 * deliberately cut back to `rpc.activities.write` alone, with `type: 0` left in
 * so the two candidate causes were separated, and presence went silent again.
 * Both scopes: works. One: dead. The cost of `identify` — username, avatar and
 * banner on the consent sheet of a game that has no accounts — is real enough to
 * be worth one round trip to confirm we were paying it for a reason. We were.
 * Don't spend a third: leave this list alone.
 *
 * What that cost buys is Discord's handshake and nothing else. **The user object
 * is dropped on the floor** — never read, stored, sent to the Worker, or written
 * to localStorage. The game stays anonymous: no accounts, per-device state, no
 * identity in any table. Sharing doesn't change that; the attachment endpoint
 * takes this token because it takes any bearer, not because it identifies
 * anyone. Don't start reading the scope we're forced to take.
 */
const SCOPES = ["identify", "rpc.activities.write"] as const;

let authorizing: Promise<string | null> | null = null;
/** The access token, kept for the share upload. Null until authorized, and after a refusal. */
let token: string | null = null;

/**
 * Trade the Activity's authorization code for an access token and hand it back
 * to the Discord client. The code alone is useless without the app's client
 * secret, which lives on the Worker — hence the /api/discord/token hop.
 *
 * `prompt: "none"` keeps this silent for anyone who has authorized the app
 * before; the consent sheet is a first-launch cost only.
 */
async function authorize(instance: DiscordSDK): Promise<string | null> {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId) return null;
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
    return accessToken;
  } catch (err) {
    // Includes the player simply declining. Logged, then dropped: the game is
    // unaffected and re-asking on the next guess would be harassment.
    console.warn(`[discord] authorization unavailable (failed at: ${step}):`, err);
    return null;
  }
}

/**
 * The access token, authorizing on the first call and never again — whatever the
 * outcome. Resolves to null when it isn't available, which is a normal state, not
 * an error: a player can decline, and a deployment can ship without the Discord
 * secrets configured at all.
 *
 * Callers must treat null as "do the non-Discord thing", never as a reason to
 * retry. Re-asking mid-round is harassment, and a consent sheet over a live board
 * is worse than no presence and no native share put together.
 */
export function ensureAuthorized(instance: DiscordSDK): Promise<string | null> {
  authorizing ??= authorize(instance).then((result) => {
    token = result;
    return result;
  });
  return authorizing;
}

/**
 * The token if we already have one, without triggering authorization.
 *
 * This is what lets presence stay lazy — it authorizes on the first real board —
 * while the share button can check whether it's worth trying the native path
 * without ever being the thing that raises a consent sheet.
 */
export function peekToken(): string | null {
  return token;
}
