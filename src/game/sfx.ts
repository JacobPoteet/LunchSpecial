// Sound-effect hookups for the game screen.
//
// These are the call sites and the canonical "when" for each diner sound; the
// animations in issue #7 and this file are wired together so a sound lines up
// with the motion it belongs to. Actual audio is issue #6's job — until then
// this is a safe, self-contained scaffold: every call below is a no-op.
//
// To turn sound on (issue #6): import the audio assets, list them in
// SFX_SOURCES, and flip ENABLED to true. No call sites need to change.
//
//   import ticketPrintUrl from "../assets/sfx/ticket-printer.mp3";
//   const SFX_SOURCES = { "ticket-print": ticketPrintUrl, ... };
//   const ENABLED = true;

export type SfxName =
  | "guess-submit" // an order is sent to the kitchen and its row drops in
  | "guess-correct" // the winning order — the service bell dings
  | "ticket-print" // a clue chatters out of the order-ticket printer
  | "modal-open" // a menu / check slides up from the bottom
  | "modal-close"; // ...and slides back down

// Filled in by issue #6. Anything absent here simply stays silent.
const SFX_SOURCES: Partial<Record<SfxName, string>> = {};

// Master switch. Left off until issue #6 ships real audio + a mute control.
const ENABLED = false;

// Cache one Audio element per sound so we don't re-fetch on every play.
const cache = new Map<SfxName, HTMLAudioElement>();

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Play a game sound effect. Safe to call from anywhere and at any time:
 * it does nothing while sound is disabled, when the sound has no asset yet,
 * when the player prefers reduced motion, or if playback is blocked (e.g. no
 * user gesture yet). It never throws.
 */
export function playSfx(name: SfxName): void {
  if (!ENABLED || prefersReducedMotion()) return;
  const src = SFX_SOURCES[name];
  if (!src) return;

  try {
    let base = cache.get(name);
    if (!base) {
      base = new Audio(src);
      base.preload = "auto";
      cache.set(name, base);
    }
    // Clone so rapid, overlapping sounds (ticket after ticket) don't cut each
    // other off, and reset the shared source to the start for the common case.
    const node = base.cloneNode(true) as HTMLAudioElement;
    node.play().catch(() => {
      /* autoplay blocked or interrupted — ignore */
    });
  } catch {
    /* Audio unsupported — stay silent */
  }
}
