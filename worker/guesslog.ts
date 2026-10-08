// What a player guessed, written by the guess routes themselves (migrations/0053).
//
// The decision of whether a guess is recorded lives here as a pure fold, so the
// rule is testable without a database: a round is recorded only when the client
// named it, and never when the request is a rehearsal.

export type GuessCatalogue = "dish" | "drink";

export interface GuessRecord {
  roundId: string;
  /** The device, when the client sent a usable one; null otherwise. */
  playerId: string | null;
  guessNumber: number;
  catalogue: GuessCatalogue;
  guessedId: number;
  targetId: number;
}

export interface GuessRecordInput {
  /** From the request body; absent or malformed means "not tracked". */
  roundId: unknown;
  /** From the request body; absent or malformed is stored as NULL. */
  playerId: unknown;
  guessNumber: number;
  catalogue: GuessCatalogue;
  guessedId: number;
  targetId: number;
  /**
   * The target resolver took a rehearsal branch: an admin preview, a showcase,
   * a pinned playtest. Nobody is playing for real. The client already omits
   * `roundId` in those modes; this is the server not trusting that.
   */
  rehearsal: boolean;
}

/**
 * The bounds every analytics id is held to: a round id, a device id. The round
 * beacons and the guess routes both read through this.
 */
export function isAnalyticsId(raw: unknown): raw is string {
  return typeof raw === "string" && raw.length >= 8 && raw.length <= 64;
}

export function guessRecord(input: GuessRecordInput): GuessRecord | null {
  if (!isAnalyticsId(input.roundId)) return null;
  if (input.rehearsal) return null;
  return {
    roundId: input.roundId,
    playerId: isAnalyticsId(input.playerId) ? input.playerId : null,
    guessNumber: input.guessNumber,
    catalogue: input.catalogue,
    guessedId: input.guessedId,
    targetId: input.targetId,
  };
}

/**
 * Write one guess. The last write for a guess number wins: the client only
 * retries a number whose response it never saw, and the dish it then sends is
 * the one on its board. The target cannot change within a round.
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
           (round_id, guess_number, player_id, guessed_dish_id, target_dish_id, guessed_drink_id, target_drink_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(round_id, guess_number) DO UPDATE SET
           player_id = COALESCE(excluded.player_id, player_id),
           guessed_dish_id = excluded.guessed_dish_id,
           guessed_drink_id = excluded.guessed_drink_id,
           created_at = datetime('now')`,
      )
      .bind(
        rec.roundId,
        rec.guessNumber,
        rec.playerId,
        dish ? rec.guessedId : null,
        dish ? rec.targetId : null,
        dish ? null : rec.guessedId,
        dish ? null : rec.targetId,
      )
      .run();
  } catch {
    // Swallowed on purpose; see above.
  }
}
