// The browser's half of the After Dark clock.
//
// shared/night.ts holds the folds and takes the clock as an argument; this is
// the two-line reader that supplies one, plus the countdown the closed sign and
// the invite band both tick against. Same split as shared/build.ts and the
// __BUILD__ global.

import { useEffect, useState } from "react";
import { barIsOpen, localClock, msUntilLastCall, msUntilOpen, nightKey } from "../../shared/night";
import { devIgnoresBarHours } from "./devHarness";

export { BAR_CLOSE_HOUR, BAR_OPEN_HOUR, nightNumber } from "../../shared/night";

/** Which night it is here, right now. */
export function currentNight(): string {
  return nightKey(localClock());
}

/** Is the bar open on this device's clock? */
export function isBarOpen(): boolean {
  return devIgnoresBarHours() || barIsOpen(localClock());
}

/**
 * Milliseconds until the doors open, 0 if they already are.
 *
 * The dev override reports 0 rather than being checked separately at each call
 * site, so the harness exercises the same "open" branch a player at 9pm gets
 * instead of a parallel one only the harness ever runs.
 */
export function untilOpen(): number {
  return devIgnoresBarHours() ? 0 : msUntilOpen(localClock());
}

/** Milliseconds until last call, 0 if the bar is shut. */
export function untilLastCall(): number {
  return msUntilLastCall(localClock());
}

/**
 * The device's UTC offset in minutes, east-positive.
 *
 * Sent on the Nightcap beacons and nowhere else. Without it "when do people
 * drink" can only be answered in ET, which is meaningless for a window defined
 * on local time: every player's 9pm would land in a different bucket and the
 * profile would be noise rather than a reading.
 *
 * `getTimezoneOffset` is west-positive, which is backwards from how anyone says
 * it out loud, so it is flipped here once rather than at each read.
 */
export function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/**
 * A long-form label for a night. Deliberately the evening's own date even in
 * the small hours: at 1am on the 5th you are still out on the 4th, and a card
 * that says the 5th is arguing with the player about what night it is.
 */
export function nightDateLabel(night: string): string {
  return new Date(`${night}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * What the diner should say about the bar right now.
 *
 * `open` when there is a Nightcap waiting, `settled` when tonight's is already
 * played, `soon` when the doors are shut but it is late enough that mentioning
 * them is news rather than an advert, and `none` the rest of the time.
 *
 * The `soon` window is the evening only. A player finishing lunch at nine in
 * the morning does not need a countdown to something eleven hours away, and a
 * game that tells you about a thing you cannot do yet, all day, every day, has
 * started nagging.
 */
export type BarInvite = "none" | "soon" | "open" | "settled";

/** How early the closed sign turns into an invitation. Three hours. */
const TEASE_WINDOW_MS = 3 * 60 * 60 * 1000;

export function barInvite(playedTonight: boolean): BarInvite {
  const wait = untilOpen();
  if (wait === 0) return playedTonight ? "settled" : "open";
  return wait <= TEASE_WINDOW_MS ? "soon" : "none";
}

/**
 * The same answer, re-asked once a second.
 *
 * The tick is what makes the invitation appear *live*: a player who finished
 * lunch at 19:58 and left the check open should see the bar open at 20:00
 * without touching anything. Same reason useNewDayAvailable polls for the
 * midnight-ET rollover, and the same cost -- one comparison a second.
 */
export function useBarInvite(playedTonight: boolean): BarInvite {
  const [state, setState] = useState<BarInvite>(() => barInvite(playedTonight));
  useEffect(() => {
    setState(barInvite(playedTonight));
    const t = setInterval(() => setState(barInvite(playedTonight)), 1000);
    return () => clearInterval(t);
  }, [playedTonight]);
  return state;
}
