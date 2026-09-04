// The browser's half of the After Dark clock.
//
// shared/night.ts holds the folds and takes the clock as an argument; this is
// the two-line reader that supplies one, plus the countdown the closed sign and
// the invite band both tick against. Same split as shared/build.ts and the
// __BUILD__ global.

import {
  barIsOpen,
  localClock,
  msUntilLastCall,
  msUntilOpen,
  nightKey,
  nightNumber,
} from "../../shared/night";

export { BAR_CLOSE_HOUR, BAR_OPEN_HOUR, nightNumber } from "../../shared/night";

/** Which night it is here, right now. */
export function currentNight(): string {
  return nightKey(localClock());
}

/** Is the bar open on this device's clock? */
export function isBarOpen(): boolean {
  return barIsOpen(localClock());
}

/** Milliseconds until the doors open, 0 if they already are. */
export function untilOpen(): number {
  return msUntilOpen(localClock());
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

/** "Night No. 12" for the board, or an empty string for an unnumbered round. */
export function nightLabel(night: string): string {
  const n = nightNumber(night);
  return n > 0 ? `Night No. ${n}` : "";
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
