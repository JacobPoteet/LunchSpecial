// The first visit: which coach mark is up.
//
// Three beats teach the board to a device that has never played, and which
// one shows is read off the round rather than stepped through. That is what
// lets a reload mid-first-round land on the right beat, and what stops a beat
// being dismissed by an animation that never fired. GamePage owns the state;
// this fold owns the decision. See src/game/Coach.tsx for the pieces.

export type CoachBeat = "order" | "pick" | "read";

export interface CoachInput {
  /** Whether this device is being walked through the game at all. */
  coaching: boolean;
  /** "playing" until the round ends; any other value ends the walkthrough. */
  status: string;
  /** Guesses landed so far (not the optimistic pending one). */
  guesses: number;
  /** How many dishes the order bar is offering right now. */
  matches: number;
}

/**
 * Empty board → `order` (the spotlight on the order bar), or `pick` once the
 * list has something in it. One guess down → `read`, the legend over the
 * first row. Two guesses, or a finished round, and the player has the idea:
 * nothing, and the caller writes the seen key.
 */
export function coachBeat({ coaching, status, guesses, matches }: CoachInput): CoachBeat | null {
  if (!coaching || status !== "playing") return null;
  if (guesses === 0) return matches > 0 ? "pick" : "order";
  if (guesses === 1) return "read";
  return null;
}

/** True once the walkthrough has done its job and the seen key should be written. */
export function coachingDone({ status, guesses }: Pick<CoachInput, "status" | "guesses">): boolean {
  return status !== "playing" || guesses >= 2;
}
