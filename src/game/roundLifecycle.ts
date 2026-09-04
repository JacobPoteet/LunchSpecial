// The choreography at the end of a round, shared by the diner and the bar.
//
// This is a small module for a reason. Most of what a round does is
// mode-specific — different endpoints, different feedback shapes, different
// guess ceilings — and forcing all of it through one generic hook would cost
// more than the duplication saves. What is genuinely shared, and what would
// genuinely rot if it were copied, is the *timing* of the end: a finished board
// gets a beat before the check prints, a win holds a toast through that beat,
// and a round restored from storage skips the whole thing.
//
// That last rule is the one worth protecting. It looks like an optimisation and
// is actually the difference between a victory lap and a replay of a victory
// lap: a board you finished this morning and reopened at lunch should show its
// result instantly, because you already had the moment.

import { useEffect, useRef, useState } from "react";

export type RoundStatus = "playing" | "won" | "lost";

/**
 * The check doesn't slam into view the moment a round ends — Wordle's trick.
 * The board gets a beat to land first (the winning row's drop, the bell) with a
 * toast over it, then the receipt prints. Without the toast the pause just reads
 * as lag, so the two ship together.
 *
 * WIN_CHECK_DELAY_MS must stay in sync with the `win-toast` animation's total
 * run time in game.css.
 */
export const WIN_CHECK_DELAY_MS = 1700;
export const LOSS_CHECK_DELAY_MS = 800;

export interface CheckOpening {
  /** The banner over the board during the pause, or null. */
  toast: string | null;
  /** Whether the check is on screen. */
  showCheck: boolean;
  setShowCheck: (open: boolean) => void;
  /** True once the check has auto-opened, so closing it doesn't spring it back. */
  checkOpened: boolean;
  /**
   * Re-arm for a fresh round in the same session (a new random dish). Without
   * this the second round would skip its own toast, having been marked opened
   * by the first.
   */
  reset: () => void;
}

/**
 * Open the check once per round, after a beat.
 *
 * `toastFor` is given the winning guess count so each mode can pick its own
 * wording; it is only called on a win, and only on a win that happened in this
 * sitting.
 */
export function useCheckOpening(
  status: RoundStatus,
  guessCount: number,
  toastFor: (guesses: number) => string,
): CheckOpening {
  const [toast, setToast] = useState<string | null>(null);
  const [showCheck, setShowCheck] = useState(false);
  const [checkOpened, setCheckOpened] = useState(false);
  // Captured at mount: a round that was ALREADY finished when the page loaded
  // was celebrated on the day it was played.
  const restoredFinished = useRef(status !== "playing");

  useEffect(() => {
    if (status === "playing" || checkOpened) return;
    if (restoredFinished.current) {
      setCheckOpened(true);
      setShowCheck(true);
      return;
    }
    const won = status === "won";
    if (won) setToast(toastFor(guessCount));
    const t = setTimeout(
      () => {
        setToast(null);
        setCheckOpened(true);
        setShowCheck(true);
      },
      won ? WIN_CHECK_DELAY_MS : LOSS_CHECK_DELAY_MS,
    );
    return () => clearTimeout(t);
    // Keyed on the guess *count* rather than the array, like every other effect
    // that watches a round: the array's identity changes on renders that added
    // no guess.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, guessCount, checkOpened]);

  return {
    toast,
    showCheck,
    setShowCheck,
    checkOpened,
    reset: () => {
      setCheckOpened(false);
      setToast(null);
      setShowCheck(false);
      restoredFinished.current = false;
    },
  };
}
