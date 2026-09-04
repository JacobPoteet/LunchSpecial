// Shareable emoji summary of a finished round.

import { wantsNativeShare } from "../../shared/share";

// Every pure fold lives in shared/share.ts and is unit tested there; this module
// is the half that needs a browser. The two grids used to sit here despite never
// touching one, which is why they were the only part of the share path with no
// test — they moved, and this file re-exports them so nothing else had to change.
export {
  SHARE_URL,
  buildNightShareText,
  buildShareText,
  joinShareBlocks,
  shareMessage,
} from "../../shared/share";

/**
 * Copy text to the clipboard, with a legacy fallback.
 *
 * `navigator.clipboard` is gated behind the `clipboard-write` permissions
 * policy, which the Discord Activity iframe does not grant — the promise just
 * rejects there. The old `execCommand("copy")` path has no such gate (it only
 * needs the call to happen inside a user gesture), so it's what actually gets
 * the score card onto a Discord player's clipboard. Try the modern API first
 * and fall back rather than the other way round: `execCommand` is deprecated
 * and steals focus for a tick.
 */
export async function copyShareText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    // Keep it off-screen and unfocusable-looking, but still selectable.
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "-9999px";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Read what this browser can do and ask shared/share.ts where the round goes.
 *
 * Every capability is read synchronously, because `navigator.share` needs the
 * click's transient activation and an await before it would spend that.
 */
export function canUseNativeShare(text: string): boolean {
  const hasShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return wantsNativeShare({
    hasShare,
    coarsePointer: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
    canShareText:
      hasShare && typeof navigator.canShare === "function" ? navigator.canShare({ text }) : null,
  });
}
