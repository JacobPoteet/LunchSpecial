// /api/admin login, logout and session. The only three routes that don't need
// a session; index.ts mounts them ahead of the guard.

import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { createToken, passwordMatches, SESSION_COOKIE, SESSION_TTL_MS, verifyToken } from "../../auth";

const app = new Hono<{ Bindings: Env }>();

export async function isLoggedIn(c: Context, secret: string) {
  const cookie = getCookie(c, SESSION_COOKIE);
  if (!cookie) return false;
  return (await verifyToken(cookie, secret)) === "session";
}

app.post("/login", async (c) => {
  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.password || !(await passwordMatches(body.password, c.env.ADMIN_PASSWORD))) {
    return c.json({ error: "Wrong password" }, 401);
  }
  const token = await createToken("session", SESSION_TTL_MS, c.env.SESSION_SECRET);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return c.json({ ok: true });
});

app.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/session", async (c) => {
  return c.json({ loggedIn: await isLoggedIn(c, c.env.SESSION_SECRET) });
});

export default app;
