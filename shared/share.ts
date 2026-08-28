// Where a finished round goes when the player taps Share — PURE.
//
// The button has three destinations (the Discord channel, the native share
// sheet, the clipboard) and only one of them is settled before the click. This
// module holds the two decisions that don't need a browser to make: what the
// message says, and whether the native sheet is the right target. The plumbing
// that reads `navigator` lives in src/game/share.ts, and the Discord half in
// src/discord/share.ts.

export const SHARE_URL = "https://lunchspecial.app";

/**
 * The one string every non-Discord share target receives.
 *
 * The url is folded into the text rather than travelling as Web Share's
 * separate `url` field. Windows' share sheet (Chrome and Edge on desktop) hands
 * each target whichever field that target understands, and most of them take
 * the url and drop the text — so a payload split across both fields arrives as
 * a bare link with the whole score card missing. One field can't be
 * half-delivered.
 */
export function shareMessage(text: string): string {
  return `${text}\n${SHARE_URL}`;
}

/** What the browser will tell us about itself, read once at click time. */
export type ShareCapabilities = {
  /** `navigator.share` exists. */
  hasShare: boolean;
  /** The primary pointer is coarse — `matchMedia("(pointer: coarse)")`. */
  coarsePointer: boolean;
  /**
   * What `navigator.canShare({ text })` said, or null where that API is absent
   * (it shipped after `share` itself, so its absence is not a refusal).
   */
  canShareText: boolean | null;
};

/**
 * Is the native share sheet the *better* target here?
 *
 * `navigator.share` existing is not the question, and treating it as the
 * question is what broke desktop: Chrome and Edge on Windows both have it, and
 * what it opens is an OS dialog offering to mail the result to somebody, which
 * is not what anyone means by sharing a Wordle grid. The clipboard is the
 * desktop answer — paste it wherever you were already going to paste it. The
 * sheet is the phone answer, where there's no comfortable paste target and
 * every messaging app is one tap away.
 *
 * A coarse *primary* pointer is the closest thing to "this is a phone" the
 * platform will say. Deliberately primary rather than `any-pointer`, which is
 * also true of a Windows touchscreen laptop — a mouse-driven desktop that
 * happens to have a screen you can poke, and exactly the case being fixed.
 *
 * The heuristic is allowed to be wrong in both directions because neither way
 * loses the grid: a mis-read desktop opens a sheet that now carries the whole
 * message in one field, and a mis-read tablet copies. That's the property to
 * preserve if this is ever retuned.
 */
export function wantsNativeShare(caps: ShareCapabilities): boolean {
  if (!caps.hasShare) return false;
  if (!caps.coarsePointer) return false;
  return caps.canShareText !== false;
}
