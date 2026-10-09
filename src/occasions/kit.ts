// What an occasion is allowed to touch: the slots.
//
// A costume is handcrafted, top to bottom, in its own folder
// (src/occasions/<id>/). What it gets to fill is this fixed list of places in
// the game, each one mounted by the page and empty on a plain day. Adding a
// place is a deliberate change to this file and to the page that mounts it;
// what goes IN a place is entirely the costume's business.
//
// Every slot is decoration. Rules that hold for all of them:
//
// - Nothing a slot draws may carry meaning on its own. Decorations are
//   `aria-hidden`; the one interactive slot (Cloche) is a real button with a
//   label and announces what it does.
// - Every animation is listed in the costume's reduced-motion block, in the
//   same commit as its keyframes.
// - Nothing paints over text. Contrast is measured on the painted surface, so a
//   decoration sits in a corner, a margin or behind the card, never under type.

import type { ComponentType } from "react";

/** The room a slot is drawn in. The bar is the same room with the lights off. */
export type Room = "diner" | "bar";

export interface OccasionKit {
  /**
   * The neon script in the marquee. Receives the words the sign says and owns
   * the letters (a dead letter, a bat on the tube). Must keep every word
   * readable to a screen reader: the h1 around it is the page's name.
   */
  Sign?: ComponentType<{ text: string; room: Room }>;
  /** Fixed, behind the card and above the backdrop: fog, a moon. Both rooms. */
  Room?: ComponentType<{ room: Room }>;
  /** Inside the menu card, absolutely placed in its corners. */
  Card?: ComponentType<{ room: Room }>;
  /**
   * The cloche on the Special line. The one slot that may be pressed, so it
   * renders a real button and says what happened through its own live region.
   */
  Cloche?: ComponentType<{ src: string }>;
  /** Over the win toast, once. Gone with it. */
  Win?: ComponentType;
  /** Beside the check's verdict ("On the house!" / "Better luck tomorrow"). */
  Verdict?: ComponentType<{ won: boolean }>;
  /** Inside the walk to the bar, over the scrim. */
  LightsOut?: ComponentType;
  /** The house's words on the day. Anything absent keeps the everyday line. */
  copy?: Partial<Record<CopyKey, string>>;
}

export type CopyKey =
  /** Under the neon sign, in the diner. */
  | "sub"
  /** The script sign-off at the foot of the menu card. */
  | "thanks"
  /** The fine print under it. */
  | "fine"
  /** Under the sign, at the bar. */
  | "barSub";
