// What a player guessed, written by the guess routes themselves (migrations/0053).
//
// The decision of whether a guess is recorded lives here as a pure fold, so the
// rule is testable without a database: a round is recorded only when the client
// named it, and never when the request is a rehearsal.

export type GuessCatalogue = "dish" | "drink";

export interface GuessRecord {
  roundId: string;
  guessNumber: number;
  catalogue: GuessCatalogue;
  guessedId: number;
  targetId: number;
  correct: boolean;
}

export interface GuessRecordInput {
  /** From the request body; absent or malformed means "not tracked". */
  roundId: unknown;
  guessNumber: number;
  catalogue: GuessCatalogue;
  guessedId: number;
  targetId: number;
  correct: boolean;
  /**
   * The rehearsal parameters this request carried: an admin preview token, a
   * pinned playtest slug. Any one of them means nobody is playing for real. The
   * client already omits `roundId` in those modes; this is the server not
   * trusting that.
   */
  rehearsal: ReadonlyArray<string | undefined>;
}

/** Same bounds the round beacons hold a round id to. */
function usableRoundId(raw: unknown): raw is string {
  return typeof raw === "string" && raw.length >= 8 && raw.length <= 64;
}

export function guessRecord(input: GuessRecordInput): GuessRecord | null {
  if (!usableRoundId(input.roundId)) return null;
  if (input.rehearsal.some((r) => r)) return null;
  return {
    roundId: input.roundId,
    guessNumber: input.guessNumber,
    catalogue: input.catalogue,
    guessedId: input.guessedId,
    targetId: input.targetId,
    correct: input.correct,
  };
}

/**
 * Write one guess. First write wins, so a replayed request cannot rewrite it.
 *
 * Never throws: analytics must not break gameplay, and the player's feedback
 * has already been computed by the time this runs.
 */
export async function recordGuess(db: D1Database, rec: GuessRecord): Promise<void> {
  const dish = rec.catalogue === "dish";
  try {
    await db
      .prepare(
        `INSERT INTO analytics_guesses
           (round_id, guess_number, guessed_dish_id, target_dish_id, guessed_drink_id, target_drink_id, correct)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(round_id, guess_number) DO NOTHING`,
      )
      .bind(
        rec.roundId,
        rec.guessNumber,
        dish ? rec.guessedId : null,
        dish ? rec.targetId : null,
        dish ? null : rec.guessedId,
        dish ? null : rec.targetId,
        rec.correct ? 1 : 0,
      )
      .run();
  } catch {
    // Swallowed on purpose; see above.
  }
}
