// The share button's dispatcher and label, shared by the check and the tab.
//
// Which target runs is only settled at click time, on every surface: inside
// the Activity a player who declined the authorization gets the clipboard, on
// the web a phone gets the share sheet and a desktop the clipboard. The idle
// label therefore never names a destination, and the *result* says where the
// round went. The two modals used to carry a copy of this each; the copies
// had already drifted by one comment.

import { useEffect, useState } from "react";
import type { Scorecard } from "../../shared/scorecard";
import type { Surface } from "../../shared/types";
import { canShareToChannel, shareToChannel } from "../discord/share";
import { playSfx } from "../audio";
import { canUseNativeShare, copyShareText } from "./share";

export type ShareState = "idle" | "working" | "channel" | "sent" | "copied" | "failed";

export function shareLabel(state: ShareState, surface: Surface, idle = "Share"): string {
  switch (state) {
    case "working":
      return "Plating up…";
    case "channel":
      return "Sent to the channel!";
    case "sent":
      return "Shared!";
    case "copied":
      return surface === "discord" ? "Copied — paste it in chat!" : "Copied!";
    case "failed":
      return "Tap to retry";
    default:
      return idle;
  }
}

export interface ShareInput {
  surface: Surface;
  /** The whole message, url included. Built at click time. */
  message: () => string;
  /** The picture of the board, for the Discord channel. Built at click time. */
  card: () => Scorecard;
  /** Fired once per press, before any target runs: the share beacon. */
  onShare?: () => void;
  /** The idle label. The bar says "Share the night"; the default is the diner's. */
  idle?: string;
}

/**
 * Three exits, in order: the Discord channel (with the clipboard as its
 * fallback, which is what every Discord player had before the share dialog
 * existed), the native share sheet on a phone, the clipboard everywhere else.
 * A dismissed sheet (`AbortError`) returns to idle and is correctly silent.
 *
 * The sound is played off the resulting state rather than inside the
 * dispatcher, which has five exits and would otherwise carry the same two
 * lines in each.
 */
export function useShare({ surface, message, card, onShare, idle }: ShareInput) {
  const [state, setState] = useState<ShareState>("idle");

  const share = async () => {
    setState("idle");
    onShare?.();
    const text = message();
    if (surface === "discord") {
      if (canShareToChannel()) {
        setState("working");
        if (await shareToChannel(card())) {
          setState("channel");
          return;
        }
      }
      setState((await copyShareText(text)) ? "copied" : "failed");
      return;
    }
    if (canUseNativeShare(text)) {
      try {
        await navigator.share({ text });
        setState("sent");
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Any other failure: the clipboard.
      }
    }
    setState((await copyShareText(text)) ? "copied" : "failed");
  };

  useEffect(() => {
    if (state === "channel" || state === "sent" || state === "copied") playSfx("share-success");
    else if (state === "failed") playSfx("error");
  }, [state]);

  return { state, share, label: shareLabel(state, surface, idle), busy: state === "working" };
}
