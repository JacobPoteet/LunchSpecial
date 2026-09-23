// The streak, as something to say — PURE.
//
// `Stats.currentStreak` is a number that only moves when a round is recorded,
// so a player who played five days running and then stayed away for a week
// still has a 5 in storage. That number is right in the "My stats" panel the
// way Wordle's is (it resets on the next play), and wrong on a board: printing
// "5-day streak" beside today's Special to someone whose streak died on
// Thursday is a lie about the one thing the mark exists to say. Everything
// here therefore takes the date of the last recorded round and today, and
// decides first whether the streak is alive at all.

import { addDays } from "./time";

export interface StreakInput {
  /** `Stats.currentStreak` as stored. */
  currentStreak: number;
  /** `Stats.lastCompletedDate` as stored: an ET day, or null if never. */
  lastCompletedDate: string | null;
  /** Today's ET day (`localToday()`). */
  today: string;
}

/**
 * The streak that is actually alive right now: the stored count if the last
 * recorded round was today or yesterday, otherwise 0. A streak that has not
 * been fed since the day before yesterday is over, whatever storage says.
 */
export function liveStreak({ currentStreak, lastCompletedDate, today }: StreakInput): number {
  if (!lastCompletedDate) return 0;
  if (lastCompletedDate !== today && lastCompletedDate !== addDays(today, -1)) return 0;
  return Math.max(0, currentStreak);
}

/**
 * The mark beside the board's meta line, or null when there is nothing worth
 * saying. One day is not a streak yet — "1-day streak" is a sentence that
 * makes the mark look broken, and everyone who has played once has one.
 * Words only: the board draws the flame beside them as an icon.
 */
export function boardStreakMark(input: StreakInput): string | null {
  const n = liveStreak(input);
  return n >= 2 ? `${n}-day streak` : null;
}

/**
 * The line under the stats on the check. Read *after* the round has been
 * recorded, so on a win `currentStreak` already includes today.
 *
 * A win always earns a reason to come back: keep the streak if there is one,
 * start one if there isn't. A loss is told plainly that tomorrow starts fresh,
 * and nothing more — the verdict line above has already said "better luck
 * tomorrow", and rubbing in the number that was just lost is not a reason to
 * return.
 */
export function checkStreakLine({ won, ...input }: StreakInput & { won: boolean }): string {
  if (!won) return "Tomorrow's Special starts a new streak.";
  const n = liveStreak(input);
  if (n >= 2) return `Come back tomorrow to keep your ${n}-day streak going.`;
  return "Come back tomorrow to start a streak.";
}
