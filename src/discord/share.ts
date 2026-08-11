// Posting the check into the channel.
//
// On the web, sharing a round means the native share sheet or the clipboard.
// Inside the Activity it meant the clipboard and a note asking the player to go
// and paste it — leave the game, find the message box, paste. That's three steps
// on the one action a daily puzzle spreads by, and this removes them: Discord's
// share-moment dialog posts the score card as a message, from the player, in the
// channel they're already in.
//
// Three hops, in order:
//   1. draw the card    (src/game/scorecard.ts — a PNG, because the dialog takes
//                        a picture and not text)
//   2. upload it        (via our Worker, which forwards to Discord's attachment
//                        endpoint; see worker/routes/discord.ts for why it isn't
//                        called from here)
//   3. open the dialog  (sdk.commands.openShareMomentDialog)
//
// Any hop can fail, and the only correct response to that is to say so and let
// the caller fall back to copying the text — which is exactly what Discord
// players get today, so a failure here is never worse than not having tried.
// **Nothing in this module may throw**, and none of it may run on the open web.

import type { DiscordSDK } from "@discord/embedded-app-sdk";
import type { Scorecard } from "../../shared/scorecard";
import { peekToken } from "./auth";

let sdk: DiscordSDK | null = null;

/**
 * Hand the live SDK instance over once the Activity handshake completes.
 *
 * Called from initDiscord() on the handshake's own resolution, NOT on the branch
 * that wins the mount race — same rule as attachPresence, and the same reason: a
 * handshake landing at 5.1s is a perfectly good SDK, and gating a feature on
 * that timer is precisely how the Discord share button silently died once
 * already (see CLAUDE.md).
 */
export function attachShare(instance: DiscordSDK): void {
  sdk = instance;
}

/**
 * True when the native share is worth offering: we're embedded, the handshake
 * landed, and the player has already authorized (for presence, on their first
 * board).
 *
 * Deliberately reads the token rather than asking for one. Sharing must never be
 * the thing that raises a consent sheet — a player who declined, or who somehow
 * reached the check without presence having authorized, gets the clipboard path
 * without being asked a second time for something they already refused.
 */
export function canShareToChannel(): boolean {
  return sdk !== null && peekToken() !== null;
}

/**
 * Draw, upload and offer the card. Resolves true only when Discord actually
 * opened the share dialog.
 *
 * A false return is the caller's cue to copy the text instead. Note what false
 * does *not* distinguish: a player who opens the dialog and then closes it
 * without posting still counts as a success, because the share happened as far
 * as this game is concerned — they were given the choice, and second-guessing
 * their answer by also stuffing their clipboard would be presumptuous.
 */
export async function shareToChannel(card: Scorecard): Promise<boolean> {
  const instance = sdk;
  const token = peekToken();
  if (!instance || !token) return false;

  let step = "draw";
  try {
    // Dynamic import for the same reason the SDK is one: the canvas renderer is
    // reachable only from this branch, so a web visitor should never download
    // it. By the time it's needed the player has already clicked.
    const { drawScorecard } = await import("../game/scorecard");
    const image = await drawScorecard(card);
    if (!image) throw new Error("the score card could not be drawn");

    step = "upload";
    const res = await fetch("/api/discord/attachment", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" },
      body: image,
    });
    if (!res.ok) throw new Error(`/api/discord/attachment answered ${res.status}`);
    const { mediaUrl } = (await res.json()) as { mediaUrl?: string };
    if (!mediaUrl) throw new Error("/api/discord/attachment returned no url");

    step = "share dialog";
    await instance.commands.openShareMomentDialog({ mediaUrl });
    return true;
  } catch (err) {
    // Named by hop, because this flow only runs inside the real Discord client
    // and "the share button did nothing" is otherwise unbisectable.
    console.warn(`[discord] native share unavailable (failed at: ${step}) — falling back to the clipboard:`, err);
    return false;
  }
}
