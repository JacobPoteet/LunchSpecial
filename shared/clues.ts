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
