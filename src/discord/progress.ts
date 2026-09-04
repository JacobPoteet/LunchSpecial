// The live progress message: one message per round, edited as the player goes.
//
// The player makes their first guess and the app posts into the channel they
// launched from — their name and face, a picture of the board so far, and a
// "Play now!" button. Every guess after that rewrites that same message. Nobody
// gets six notifications, and anybody scrolling past sees a game in progress
// and a one-click way into their own.
//
// This module is the client half. The message is created by Discord invoking our
// application command (`shareInteraction`) and answered by the Worker, which is
// where the player's identity is read — deliberately, because it arrives there
// signed by Discord and can't be spoofed by anything running here.
//
// Everything is fire-and-forget. A round must play identically whether or not
// any of this works, so nothing here is awaited by the game, nothing throws, and
// a failure retires the loop for the rest of the round rather than retrying into
// Discord's rate limits.

import type { DiscordSDK } from "@discord/embedded-app-sdk";
import type { Scorecard } from "../../shared/scorecard";

/**
 * The application command `shareInteraction` invokes. Registered once against
 * the app (scripts/discord-register-command.mjs) — the name here and the name
 * there have to match or Discord has nothing to fire.
 */
const SHARE_COMMAND = "progress";

let sdk: DiscordSDK | null = null;
/** This round's opaque handle: minted here, meaningless anywhere else. */
let handle: string | null = null;
/** Set once the message exists, so later guesses edit instead of posting again. */
let posted = false;
/** Sticky. A loop that failed once must not keep trying for the rest of the round. */
let retired = false;
/** One update in flight at a time; a fast player must not race their own edits. */
let sending = false;
let pending: { card: Scorecard; live: boolean; puzzleNumber: number } | null = null;

export function attachProgress(instance: DiscordSDK): void {
  sdk = instance;
}

/**
 * Start a fresh round. Clears the previous round's handle so the next first
 * guess posts a new message rather than editing a finished one — which is also
 * what makes switching channels work: a new launch is a new round is a new
 * message, exactly where the player now is.
 */
export function resetProgress(): void {
  handle = null;
  posted = false;
  retired = false;
  pending = null;
}

/** 32 hex characters — unguessable, and meaningless to anyone who does guess it. */
function mintHandle(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Publish the board as it stands. Call it after every guess and once more when
 * the round ends; it decides for itself whether that means posting or editing.
 *
 * `live` false is the last call for the round: the message's text flips to the
 * past tense and the Worker drops the row that let it be edited.
 */
export function publishProgress(input: {
  /**
   * The already-folded card. Taken rather than folded here because the diner
   * and the bar fold different feedback shapes into it, and the one thing this
   * module needs from either is a picture and a number.
   */
  card: Scorecard;
  puzzleNumber: number;
  live: boolean;
}): void {
  // Deliberately NOT gated on the OAuth token presence uses. Nothing in this
  // loop needs it — `shareInteraction` is an SDK command, and the edit rides the
  // interaction token the Worker banked — so requiring one would mean the
  // channel message silently never appeared whenever DISCORD_CLIENT_SECRET was
  // unset, which has nothing to do with this feature and is miserable to debug.
  if (!sdk || retired) return;
  // Nothing to show yet. The first guess is the moment this becomes interesting
  // to a channel, and posting an empty board before it would be noise.
  if (input.card.rows.length === 0) return;

  pending = { card: input.card, live: input.live, puzzleNumber: input.puzzleNumber };
  void drain();
}

/**
 * Send whatever the newest state is, one at a time.
 *
 * Trailing rather than queued: if three guesses land while an upload is in
 * flight, the channel should see the third, not all three in order. The message
 * shows a *position*, and the newest one is the only one that's true.
 */
async function drain(): Promise<void> {
  if (sending || !pending || retired) return;
  sending = true;
  try {
    while (pending && !retired) {
      const next = pending;
      pending = null;
      await send(next.card, next.live, next.puzzleNumber);
    }
  } finally {
    sending = false;
  }
}

async function send(card: Scorecard, live: boolean, puzzleNumber: number): Promise<void> {
  const instance = sdk;
  if (!instance) return;

  let step = "draw";
  try {
    // Dynamic import for the same reason the SDK is one: the canvas renderer is
    // reachable only from inside Discord, so a web visitor never downloads it.
    const { drawScorecard } = await import("../game/scorecard");
    const image = await drawScorecard(card);
    if (!image) throw new Error("the score card could not be drawn");

    if (!posted) {
      step = "share";
      handle = mintHandle();
      // Discord invokes our command, which the Worker answers by composing the
      // message and banking the token that can edit it. `require_launch_channel`
      // is what puts it in the channel the Activity was started from.
      await instance.commands.shareInteraction({
        command: SHARE_COMMAND,
        options: [{ name: "handle", value: handle }],
        require_launch_channel: true,
      });
      posted = true;
    }

    step = "edit";
    const res = await fetch("/api/discord/progress", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "X-Round-Handle": handle ?? "",
        "X-Round-Live": live ? "1" : "0",
        "X-Round-Puzzle": String(puzzleNumber),
        // Which room, so the Worker's one line of message text names the right
        // one. Derived from the card rather than passed separately: a card and
        // a caption disagreeing about the mode is a bug waiting to happen.
        "X-Round-Mode": card.theme,
      },
      body: image,
    });
    // 410 is the ordinary end of a long round — Discord expired the token and
    // the message stops updating where it stands. Retire quietly; it isn't a
    // failure the player should ever learn about.
    if (res.status === 410) {
      retired = true;
      return;
    }
    if (!res.ok) throw new Error(`/api/discord/progress answered ${res.status}`);
  } catch (err) {
    // One failure retires the loop. The alternative is retrying into Discord's
    // rate limits on every guess of a round that was never going to work.
    retired = true;
    console.warn(`[discord] live progress message unavailable (failed at: ${step}):`, err);
  }
}
