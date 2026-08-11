// Discord OAuth token exchange — the one server-side piece Rich Presence needs.
//
// `setActivity` (what writes "Today's Special · No. 26 / Guess 3 of 6" onto the
// player's Discord profile) is gated behind the `rpc.activities.write` scope, so
// the Activity has to authorize. The SDK hands the client an authorization
// *code*; turning it into an access token requires the app's client secret,
// which must never reach the browser. This route is that hop and nothing else.
//
// It is anonymous like the rest of the game: the Activity asks for no
// identifying scope, so the token this returns can write a presence line and
// can't read anything about the player. We store none of it.

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

export default app;
