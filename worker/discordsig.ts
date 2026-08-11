// Verifying that an interaction really came from Discord.
//
// The interactions endpoint is a public URL that anyone can POST to, and what it
// does on request is post a message into somebody's Discord channel as our app.
// The only thing standing between those two facts is this check: Discord signs
// every request with the app's Ed25519 key, and a request whose signature
// doesn't verify is not from Discord no matter how well-formed it looks.
//
// Discord also validates the endpoint on save by sending a deliberately
// *badly*-signed PING and requiring a 401 — so getting this wrong fails loudly
// at setup rather than quietly in production, which is the one mercy here.

/** Hex → bytes. Returns null for anything that isn't an even run of hex digits. */
function fromHex(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * True when `body` was signed by the holder of `publicKey` for `timestamp`.
 *
 * Discord signs the concatenation of the timestamp header and the **raw** body,
 * so the caller has to hand over the exact bytes that arrived — re-serializing
 * parsed JSON changes the signed message (key order, whitespace, number
 * formatting) and every request would fail.
 *
 * Never throws: a malformed header, a key that isn't 32 bytes, or a runtime
 * without Ed25519 all come back as `false`, which is the same answer as a forged
 * request and the same response.
 */
export async function verifyDiscordSignature(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string,
): Promise<boolean> {
  const sig = fromHex(signature);
  const key = fromHex(publicKey);
  if (!sig || sig.length !== 64 || !key || key.length !== 32 || timestamp === "") return false;

  try {
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", cryptoKey, sig, new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}
