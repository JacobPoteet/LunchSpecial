// The two server-side pieces the Discord Activity needs.
//
// `/token` — `setActivity` (what writes "Today's Special · No. 26 / Guess 3 of
// 6" onto the player's Discord profile) is gated behind the
// `rpc.activities.write` scope, so the Activity has to authorize. The SDK hands
// the client an authorization *code*; turning it into an access token requires
// the app's client secret, which must never reach the browser. This route is
// that hop.
//
// `/attachment` — Discord's share-moment dialog posts a picture and will only
// take a Discord CDN URL, so the score card has to be uploaded to Discord before
// it can be shared. The upload endpoint lives on discord.com, and everything the
// Activity fetches goes through Discord's proxy from a relative `/api/*` path
// (see CLAUDE.md), so the Worker makes that call instead of the iframe.
//
// Both are anonymous like the rest of the game. Nothing here is stored: no
// token, no image, no player. The upload is forwarded and forgotten.

import { Hono } from "hono";
import { progressLine, type ScorecardTheme } from "../../shared/scorecard";
import { avatarUrl, displayName } from "../avatar";
import { verifyDiscordSignature } from "../discordsig";

const app = new Hono<{ Bindings: Env }>();

/** Discord's authorization codes are short opaque strings; anything longer isn't one. */
const MAX_CODE_LENGTH = 256;

app.post("/token", async (c) => {
  const clientId = c.env.DISCORD_CLIENT_ID;
  const clientSecret = c.env.DISCORD_CLIENT_SECRET;
  // The public site and the Activity itself both run fine without these — only
  // the presence line goes missing — so an unconfigured deployment says so
  // rather than failing as if Discord were down.
  if (!clientId || !clientSecret) {
    return c.json({ error: "Discord Rich Presence is not configured on this deployment" }, 503);
  }

  const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code || code.length > MAX_CODE_LENGTH) return c.json({ error: "Missing authorization code" }, 400);

  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!res.ok) {
    // Log the status, never the body — it echoes the submitted code back.
    console.error(JSON.stringify({ message: "discord token exchange failed", status: res.status }));
    return c.json({ error: "Discord refused the authorization code" }, 502);
  }

  const data = (await res.json().catch(() => null)) as { access_token?: unknown } | null;
  const accessToken = typeof data?.access_token === "string" ? data.access_token : "";
  if (!accessToken) return c.json({ error: "Discord returned no access token" }, 502);

  // Only the token goes back — not the refresh token, scope echo or expiry,
  // none of which the Activity's `authenticate()` call has any use for.
  return c.json({ accessToken });
});

/**
 * A generously-sized score card is a few tens of KB; a megabyte is not one.
 * Bounded before the body is read so a bad client can't make the Worker hold an
 * arbitrary upload in memory on its way to Discord.
 */
const MAX_IMAGE_BYTES = 1_000_000;

/** Discord's attachment endpoint. Ephemeral: the URL it returns is not permanent storage. */
const ATTACHMENT_ENDPOINT = "https://discord.com/api/v10/applications";

app.post("/attachment", async (c) => {
  const clientId = c.env.DISCORD_CLIENT_ID;
  // Same contract as /token: a deployment without the Discord secrets runs the
  // whole game, minus this. The client falls back to copying the score card.
  if (!clientId) {
    return c.json({ error: "Discord sharing is not configured on this deployment" }, 503);
  }

  // The player's own bearer token, from the authorization the Activity already
  // takes for presence. It's forwarded, never stored — this route has no
  // credentials of its own to upload with, and shouldn't: the attachment is
  // posted as the player, which is what makes it shareable by them.
  const auth = c.req.header("Authorization") ?? "";
  if (!/^Bearer \S+$/.test(auth)) return c.json({ error: "Missing bearer token" }, 401);

  const declared = Number(c.req.header("Content-Length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) return c.json({ error: "Score card too large" }, 413);

  const image = await c.req.blob().catch(() => null);
  if (!image || image.size === 0) return c.json({ error: "Missing score card" }, 400);
  if (image.size > MAX_IMAGE_BYTES) return c.json({ error: "Score card too large" }, 413);

  const form = new FormData();
  form.append("file", image, "lunch-special.png");

  const res = await fetch(`${ATTACHMENT_ENDPOINT}/${clientId}/attachment`, {
    method: "POST",
    headers: { Authorization: auth },
    body: form,
  });

  if (!res.ok) {
    // Status only — the body can echo the token back in an error envelope.
    console.error(JSON.stringify({ message: "discord attachment upload failed", status: res.status }));
    return c.json({ error: "Discord refused the score card" }, 502);
  }

  const data = (await res.json().catch(() => null)) as { attachment?: { url?: unknown } } | null;
  const mediaUrl = typeof data?.attachment?.url === "string" ? data.attachment.url : "";
  if (!mediaUrl) return c.json({ error: "Discord returned no attachment url" }, 502);

  return c.json({ mediaUrl });
});

// ---------------------------------------------------------------------------
// The live progress message
// ---------------------------------------------------------------------------
//
// One message per player per channel, posted on their first guess and EDITED on
// every guess after it — so a whole round costs the channel one message rather
// than six, and anyone scrolling past sees a game in progress and a button that
// drops them into their own. That's the loop; the rest of this file is the two
// halves of it.
//
// Creation is Discord-driven: the Activity calls `shareInteraction`, Discord
// invokes our application command, and the interaction lands here signed. The
// reply composes the message and banks the interaction token, which is the only
// thing that can edit it afterwards.
//
// Editing is client-driven: after each guess the Activity POSTs a fresh score
// card to /progress with the opaque handle it minted, and the Worker patches the
// attachment. See migrations/0022 for why that's all the table holds.

/** Discord's interaction types — the three this endpoint can receive. */
const INTERACTION_PING = 1;
const INTERACTION_COMMAND = 2;
const INTERACTION_COMPONENT = 3;

/** Discord's callback types. 12 is LAUNCH_ACTIVITY: it opens the Activity for whoever clicked. */
const CALLBACK_PONG = 1;
const CALLBACK_MESSAGE = 4;
const CALLBACK_LAUNCH_ACTIVITY = 12;

/** The Play now! button's id. Matched exactly — an unknown component is not ours. */
export const PLAY_BUTTON_ID = "lunch-special-play";

/** The command option `shareInteraction` carries the round's handle in. */
const HANDLE_OPTION = "handle";

/** Handles are client-minted opaque hex. Bounded so a bad one can't become a large key. */
const HANDLE_PATTERN = /^[0-9a-f]{16,64}$/;

/** Discord invalidates an interaction token 15 minutes after it's issued. */
const TOKEN_TTL_MINUTES = 15;

const API = "https://discord.com/api/v10";

/** Cream, matching the diner's paper — the hairline down the side of the embed. */
const EMBED_COLOR = 0xe8a53a;

interface InteractionUser {
  id?: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
}

/**
 * Everything the endpoint reads off an interaction. Deliberately narrow: this is
 * the one place a real Discord identity enters the app, and the shape of this
 * interface is the list of what we're allowed to touch.
 */
interface Interaction {
  type?: number;
  token?: string;
  data?: { options?: { name?: string; value?: unknown }[]; custom_id?: string };
  member?: { user?: InteractionUser; nick?: string | null };
  user?: InteractionUser;
}

app.post("/interactions", async (c) => {
  const publicKey = c.env.DISCORD_PUBLIC_KEY;
  // Unconfigured is 503, like the other two — but note the order: the signature
  // check below must never be skippable, so there's nothing here that could let
  // an unsigned request through on a misconfiguration.
  if (!publicKey) return c.json({ error: "Discord interactions are not configured" }, 503);

  // The RAW body: Discord signs the exact bytes it sent, so re-serializing the
  // parsed object would change the signed message and fail every request.
  const body = await c.req.text();
  const signature = c.req.header("X-Signature-Ed25519") ?? "";
  const timestamp = c.req.header("X-Signature-Timestamp") ?? "";
  if (!(await verifyDiscordSignature(body, signature, timestamp, publicKey))) {
    // Discord validates a newly-saved endpoint by sending a deliberately bad
    // signature and requiring exactly this — so a 401 here is a passing grade,
    // not an incident.
    return c.text("invalid request signature", 401);
  }

  const interaction = JSON.parse(body) as Interaction;

  if (interaction.type === INTERACTION_PING) return c.json({ type: CALLBACK_PONG });

  // The Play now! button. Answering with LAUNCH_ACTIVITY opens the Activity for
  // whoever clicked it — the whole point of the message being in the channel.
  if (interaction.type === INTERACTION_COMPONENT) {
    if (interaction.data?.custom_id !== PLAY_BUTTON_ID) return c.json({ type: CALLBACK_PONG });
    return c.json({ type: CALLBACK_LAUNCH_ACTIVITY });
  }

  if (interaction.type !== INTERACTION_COMMAND) return c.json({ type: CALLBACK_PONG });

  const handle = interaction.data?.options?.find((o) => o.name === HANDLE_OPTION)?.value;
  const token = interaction.token;
  if (typeof handle !== "string" || !HANDLE_PATTERN.test(handle) || !token) {
    return c.json({ error: "Malformed share request" }, 400);
  }

  // The identity, straight from Discord's signed payload and never from the
  // client — which is what stops a player making the app announce somebody else.
  // It goes into the reply below and out of scope with this request: the table
  // this writes to holds no part of it.
  const user = interaction.member?.user ?? interaction.user ?? {};
  const name = displayName(user, interaction.member?.nick);
  const icon = user.id ? avatarUrl(user.id, user.avatar) : undefined;

  await rememberMessage(c.env.DB, handle, token);

  // No image yet — the card arrives moments later on the first /progress call.
  // Composing it here would mean holding the bytes somewhere between the
  // Activity and this request, and the message reads fine for that half-second.
  return c.json({
    type: CALLBACK_MESSAGE,
    data: {
      content: progressLine(true, 0),
      embeds: [{ author: { name, icon_url: icon }, color: EMBED_COLOR }],
      components: [
        {
          type: 1,
          components: [{ type: 2, style: 1, label: "Play now!", custom_id: PLAY_BUTTON_ID }],
        },
      ],
    },
  });
});

/**
 * Bank the interaction token against the round's handle, and sweep anything old
 * enough to be useless while we're here.
 *
 * The sweep runs on write rather than on a schedule because the rows expire by
 * Discord's clock, not ours: past {@link TOKEN_TTL_MINUTES} the token is dead
 * and the row is litter. There's no state worth a cron for.
 */
async function rememberMessage(db: D1Database, handle: string, token: string): Promise<void> {
  await db.batch([
    db
      .prepare("DELETE FROM discord_messages WHERE created_at < datetime('now', ?)")
      .bind(`-${TOKEN_TTL_MINUTES} minutes`),
    db
      .prepare(
        `INSERT INTO discord_messages (handle, interaction_token) VALUES (?, ?)
         ON CONFLICT(handle) DO UPDATE SET interaction_token = excluded.interaction_token`,
      )
      .bind(handle, token),
  ]);
}

app.post("/progress", async (c) => {
  const clientId = c.env.DISCORD_CLIENT_ID;
  if (!clientId) return c.json({ error: "Discord sharing is not configured on this deployment" }, 503);

  const handle = c.req.header("X-Round-Handle") ?? "";
  if (!HANDLE_PATTERN.test(handle)) return c.json({ error: "Missing round handle" }, 400);

  // `live` and `puzzle` decide one line of text; the body is the score card.
  const live = c.req.header("X-Round-Live") !== "0";
  const puzzle = Number(c.req.header("X-Round-Puzzle") ?? 0);
  // Which room. Whitelisted rather than passed through, like every other
  // client-supplied field on this Worker: anything unrecognised is the diner.
  const mode: ScorecardTheme = c.req.header("X-Round-Mode") === "night" ? "night" : "day";

  const declared = Number(c.req.header("Content-Length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) return c.json({ error: "Score card too large" }, 413);
  const image = await c.req.blob().catch(() => null);
  if (!image || image.size === 0) return c.json({ error: "Missing score card" }, 400);
  if (image.size > MAX_IMAGE_BYTES) return c.json({ error: "Score card too large" }, 413);

  const row = await c.env.DB.prepare(
    `SELECT interaction_token FROM discord_messages
     WHERE handle = ? AND created_at >= datetime('now', ?)`,
  )
    .bind(handle, `-${TOKEN_TTL_MINUTES} minutes`)
    .first<{ interaction_token: string }>();
  // A handle with no live row is the normal end of a long round, not an error
  // worth surfacing: Discord has expired the token and the message simply stops
  // updating. 410 tells the client to stop trying.
  if (!row) return c.json({ error: "This round's message can no longer be edited" }, 410);

  // Only `content` and `attachments` are sent. `embeds` is deliberately left out
  // so Discord keeps the author line it already has — which is what lets the
  // player's name and face stay out of our database entirely. See migrations/0022.
  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content: progressLine(live, Number.isFinite(puzzle) ? puzzle : 0, mode),
      attachments: [{ id: 0, filename: "lunch-special.png" }],
    }),
  );
  form.append("files[0]", image, "lunch-special.png");

  const res = await fetch(`${API}/webhooks/${clientId}/${row.interaction_token}/messages/@original`, {
    method: "PATCH",
    body: form,
  });

  if (!res.ok) {
    console.error(JSON.stringify({ message: "discord progress edit failed", status: res.status }));
    return c.json({ error: "Discord refused the edit" }, 502);
  }

  // The round is over and the message says so; nothing will edit it again.
  if (!live) await c.env.DB.prepare("DELETE FROM discord_messages WHERE handle = ?").bind(handle).run();

  return c.json({ ok: true });
});

export default app;
