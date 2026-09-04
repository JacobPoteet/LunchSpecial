// The walk from the diner to the bar.
//
// One overlay, one animation, and a hard timer behind it. The sequence exists
// because After Dark is supposed to feel like an event rather than a tab, and
// the cheapest way to make a mode feel like a place is to make the journey to
// it take a beat.

import { useEffect } from "react";
import { playSfx } from "../audio";

/**
 * How long the sweep runs. Must stay in sync with the `lights-out` keyframes in
 * game.css — the timer is what actually swaps the page, so a longer animation
 * would be cut off mid-sweep and a shorter one would leave the player looking
 * at a finished overlay.
 */
export const LIGHTS_OUT_MS = 1400;

/**
 * Does this device want motion at all?
 *
 * Read at call time rather than through a media-query listener: the answer only
 * matters at the instant the transition starts, and a player who changes the
 * setting mid-sweep has bigger news than this.
 *
 * Note that this gates the *duration*, not the sound. Motion preference governs
 * motion; the mute button governs sound — the same split playSfx() already
 * makes everywhere else.
 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The overlay itself: a full-bleed scrim that closes over the diner, with the
 * neon sign coming up through it.
 *
 * `aria-hidden` and no focus stop of its own. To a screen reader nothing has
 * happened yet — the bar announces itself when it arrives, through the board's
 * own heading and live regions — and putting a decorative curtain in the tab
 * order would strand a keyboard player on it for a second and a half.
 */
export default function LightsOut() {
  useEffect(() => {
    playSfx("lights-out");
  }, []);
  return (
    <div className="lights-out" aria-hidden="true">
      <div className="lights-out__scrim" />
      <p className="lights-out__sign">After Dark</p>
    </div>
  );
}
