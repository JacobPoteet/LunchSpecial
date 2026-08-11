import { describe, expect, it } from "vitest";
import { verifyDiscordSignature } from "./discordsig";

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A throwaway Ed25519 pair, so the happy path is exercised against real crypto. */
async function keypair() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer;
  return { pair, publicKey: toHex(raw) };
}

async function sign(pair: CryptoKeyPair, message: string) {
  return toHex(await crypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(message)));
}

describe("verifyDiscordSignature", () => {
  it("accepts a request Discord actually signed", async () => {
    const { pair, publicKey } = await keypair();
    const body = '{"type":1}';
    const timestamp = "1754870000";
    const signature = await sign(pair, timestamp + body);
    expect(await verifyDiscordSignature(body, signature, timestamp, publicKey)).toBe(true);
  });

  // Discord validates a new endpoint by sending a deliberately bad signature and
  // requiring a rejection, so this case is the one that gets tested for real.
  it("rejects a signature that doesn't match the body", async () => {
    const { pair, publicKey } = await keypair();
    const timestamp = "1754870000";
    const signature = await sign(pair, timestamp + '{"type":1}');
    expect(await verifyDiscordSignature('{"type":2}', signature, timestamp, publicKey)).toBe(false);
  });

  // The timestamp is part of the signed message, so replaying a body under a
  // different one has to fail — otherwise the signature says nothing about when.
  it("rejects a signature lifted onto a different timestamp", async () => {
    const { pair, publicKey } = await keypair();
    const body = '{"type":1}';
    const signature = await sign(pair, "1754870000" + body);
    expect(await verifyDiscordSignature(body, signature, "1754880000", publicKey)).toBe(false);
  });

  it("rejects a signature from the wrong key", async () => {
    const { pair } = await keypair();
    const { publicKey: otherKey } = await keypair();
    const timestamp = "1754870000";
    const signature = await sign(pair, timestamp + '{"type":1}');
    expect(await verifyDiscordSignature('{"type":1}', signature, timestamp, otherKey)).toBe(false);
  });

  // Every one of these is indistinguishable from a forgery as far as the route
  // is concerned, so none of them may throw — they all just answer "no".
  it("answers no for malformed input instead of throwing", async () => {
    const { pair, publicKey } = await keypair();
    const timestamp = "1754870000";
    const good = await sign(pair, timestamp + '{"type":1}');

    expect(await verifyDiscordSignature('{"type":1}', "", timestamp, publicKey)).toBe(false);
    expect(await verifyDiscordSignature('{"type":1}', "zz", timestamp, publicKey)).toBe(false);
    expect(await verifyDiscordSignature('{"type":1}', "abc", timestamp, publicKey)).toBe(false);
    expect(await verifyDiscordSignature('{"type":1}', good, "", publicKey)).toBe(false);
    expect(await verifyDiscordSignature('{"type":1}', good, timestamp, "")).toBe(false);
    expect(await verifyDiscordSignature('{"type":1}', good, timestamp, "not-hex")).toBe(false);
    // Right shape, wrong length — a 16-byte key is not an Ed25519 key.
    expect(await verifyDiscordSignature('{"type":1}', good, timestamp, "00".repeat(16))).toBe(false);
  });
});
