/**
 * The five beats and their budgets — the one copy.
 *
 * The full beat sheet is section 3 of `.claude/skills/create-dishes/SKILL.md`.
 * This is its per-beat table, and it used to exist twice: once as BEAT_BUDGET
 * in worker/data-integrity.test.ts (the gate that fails CI) and once as
 * CLUE_BEATS in src/admin/DishEditor.tsx (the live counter under each textarea
 * in /admin). Nothing checked that the two agreed, so re-tuning a band could
 * redden CI while the editor a person is typing into still showed green.
 *
 * Both import from here now. The skill's markdown table is prose restating
 * these numbers, which is fine; what mattered was that two pieces of *code*
 * held the same constant.
 */

export interface ClueBeat {
  /** `clues.order_index`, 1 to 5. Beat N prints after miss N. */
  readonly beat: number;
  /** The beat's name, as /admin and the case-study page print it. */
  readonly name: string;
  /** One line of guidance, shown under the textarea in /admin. */
  readonly job: string;
  /** Target band, in characters. Guidance rather than a gate. */
  readonly lo: number;
  readonly hi: number;
  /**
   * Hard ceiling. Over this fails the linter, and it is the only part of the
   * budget that does: a test that reddens over a well-written 55-character
   * clue gets muted inside a week, so being outside [lo, hi] prints a count
   * and passes.
   */
  readonly max: number;
  /** Beats 1, 4 and 5 are one sentence. 2 and 3 may take two. */
  readonly maxSentences: number;
}

export const CLUE_BEATS: readonly ClueBeat[] = [
  {
    beat: 1,
    name: "Broad geography",
    job: "The region. Never the country.",
    lo: 35,
    hi: 70,
    max: 85,
    maxSentences: 1,
  },
  {
    beat: 2,
    name: "Origin and history",
    job: "Who made it, when, why.",
    lo: 60,
    hi: 110,
    max: 130,
    maxSentences: 2,
  },
  {
    beat: 3,
    name: "What makes it unmistakable",
    job: "True of this dish and almost no other.",
    lo: 55,
    hi: 105,
    max: 120,
    maxSentences: 2,
  },
  {
    beat: 4,
    name: "A key ingredient or technique",
    job: "You or the cook doing the cooking.",
    lo: 60,
    hi: 120,
    max: 130,
    maxSentences: 1,
  },
  {
    beat: 5,
    name: "Near-giveaway",
    job: "The country, and what it looks like.",
    lo: 45,
    hi: 100,
    max: 115,
    maxSentences: 2,
  },
];

/** The beat table for `clues.order_index` N, or undefined outside 1..5. */
export function clueBeat(beat: number): ClueBeat | undefined {
  return CLUE_BEATS[beat - 1];
}

// ---- After Dark: the three coasters ----
//
// A Nightcap gives four guesses, so at most three misses, so three clues. That
// is not the five-beat sheet with two beats deleted: five beats compressed into
// three is a worse structure than three written as three, and the deletion
// would have to fall on beat 2 or beat 4, which are the two that carry the most
// weight.
//
// What the three do instead is fold origin and build into one middle beat. The
// bar's whole register is shorter than the kitchen's -- a cook has forty
// seconds, a bartender has the time it takes to pour -- so the middle coaster
// is the only one allowed two sentences.

export const COASTER_BEATS: readonly ClueBeat[] = [
  {
    beat: 1,
    name: "The room",
    job: "The region, and what kind of drink it is. Never the country.",
    lo: 35,
    hi: 70,
    max: 85,
    maxSentences: 1,
  },
  {
    beat: 2,
    name: "The pour",
    job: "Who mixed it and what goes in the glass.",
    lo: 65,
    hi: 125,
    max: 140,
    maxSentences: 2,
  },
  {
    beat: 3,
    name: "Last call",
    job: "The country, and what it looks like in front of you.",
    lo: 45,
    hi: 100,
    max: 115,
    maxSentences: 2,
  },
];

/** The coaster table for `drink_clues.order_index` N, or undefined outside 1..3. */
export function coasterBeat(beat: number): ClueBeat | undefined {
  return COASTER_BEATS[beat - 1];
}
