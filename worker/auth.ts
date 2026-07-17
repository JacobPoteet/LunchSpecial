// HMAC-signed tokens: admin session cookies and dish preview tokens.
// Stateless — a token is `payload.exp.signature` where signature = HMAC-SHA256(payload.exp).

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

async function verify(data: string, signature: string, secret: string): Promise<boolean> {
  const expected = await sign(data, secret);
  // Hash both sides so the comparison is fixed-length and timing-safe.
  const a = await crypto.subtle.digest("SHA-256", encoder.encode(expected));
  const b = await crypto.subtle.digest("SHA-256", encoder.encode(signature));
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

export async function createToken(payload: string, ttlMs: number, secret: string): Promise<string> {
  const exp = Date.now() + ttlMs;
  const data = `${payload}.${exp}`;
  return `${data}.${await sign(data, secret)}`;
}

/** Returns the payload if the token is authentic and unexpired, else null. */
export async function verifyToken(token: string, secret: string): Promise<string | null> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;
  const data = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  if (!(await verify(data, signature, secret))) return null;
  const expDot = data.lastIndexOf(".");
  if (expDot < 0) return null;
  const exp = Number(data.slice(expDot + 1));
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return data.slice(0, expDot);
}

/** Constant-time-ish password check (compares SHA-256 digests). */
export async function passwordMatches(supplied: string, expected: string): Promise<boolean> {
  const a = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(supplied)));
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(expected)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const SESSION_COOKIE = "lunch_admin_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
