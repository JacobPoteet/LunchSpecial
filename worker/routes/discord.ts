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

export default app;
