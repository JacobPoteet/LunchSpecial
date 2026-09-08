// HMAC-signed tokens: admin session cookies, preview tokens and showcase links.
// Stateless — a token is `payload.exp.signature` where signature = HMAC-SHA256(payload.exp).
//
// Stateless means the token IS the record: there is no row to look up, so the
// string has to carry its own payload, its own expiry and a signature proving
// nobody edited either. That is what makes a token long, and a showcase link is
// the one place a person actually reads one — it goes in an email. Hence the two
// compressions below, both of which cost nothing:
//
//   - the signature is truncated to 128 bits (43 base64url chars -> 22)
//   - the expiry is base36 whole seconds (13 chars -> 6)
//
// Neither is reversible without invalidating every token already issued, which
// on this app means one admin logout and any live preview links dying. Both are
// cheap; a showcase link outliving a format change is not worth a second parser.

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

/**
 * How much of the HMAC to keep, in bytes.
 *
 * 128 bits. RFC 2104 allows truncation and asks for at least half the output,
 * which this is exactly. Forging a token means finding a second message whose
 * first 16 bytes of HMAC-SHA256 match under a key you do not have, with no
 * oracle to test against beyond a Worker that answers "invalid".
 */
const SIGNATURE_BYTES = 16;

async function sign(data: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const full = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toBase64Url(full.slice(0, SIGNATURE_BYTES));
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

/**
 * The expiry, as base36 whole seconds.
 *
 * Milliseconds in decimal cost 13 characters to express a moment nothing here
 * measures to better than a second: every TTL in this file is hours or days.
 * Rounding UP means a token never dies earlier than its stated lifetime.
 */
function encodeExpiry(atMs: number): string {
  return Math.ceil(atMs / 1000).toString(36);
}

function decodeExpiryMs(encoded: string): number | null {
  if (!/^[0-9a-z]+$/.test(encoded)) return null;
  const seconds = parseInt(encoded, 36);
  return Number.isSafeInteger(seconds) ? seconds * 1000 : null;
}

export async function createToken(payload: string, ttlMs: number, secret: string): Promise<string> {
  const data = `${payload}.${encodeExpiry(Date.now() + ttlMs)}`;
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
  const exp = decodeExpiryMs(data.slice(expDot + 1));
  if (exp === null || Date.now() > exp) return null;
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
