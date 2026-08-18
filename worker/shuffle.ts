// Pure pick behind the Tomorrow's Special shuffle (admin Today tab): roll a dish
// that has never been the Special onto a day, so the shuffle can be clicked until
// something appealing turns up and then edited. DB-free so it stays unit-testable;
// the route in routes/admin.ts runs one query and hands the raw rows here.
//
// Three things are load-bearing:
//
// 1. **"Never been the Special" means never in the `schedule` table at all** —
//    past *or* future. A dish booked for next Tuesday has not been served yet, but
//    rolling it onto tomorrow would spend it twice and leave a hole where it was.
//    That rule is also what stops consecutive clicks from landing on the dish the
//    card is already showing: it is scheduled at the moment the pick is made.
//    (The dish a previous click displaced *does* come back — its row was
//    overwritten — so a long enough session can revisit it. That's the intent:
//    this is a shuffle, not a queue.)
// 2. **Only schedulable dishes are candidates.** PUT /schedule refuses a dish
//    without ≥3 ingredients and exactly 5 clues, so offering one here would be a
//    button that fails on press.
// 3. **The roll comes in from outside.** Randomness is the one thing a fold can't
//    have and stay a fold, so the route passes a number in [0, 1).

/** A dish as the shuffle query selects it (raw DB shape, ingredients still JSON). */
export interface ShuffleDishRow {
  id: number;
  name: string;
  ingredients: string;
  clue_count: number;
  /** 1 if this dish holds any schedule row, past or future. */
  ever_scheduled: number;
}

/** What the pick hands back — enough for the card to redraw without a refetch. */
export interface ShufflePick {
  id: number;
  name: string;
}

/** Every active, schedulable dish that has never held a schedule row, id-ordered. */
export function unservedDishes(rows: ShuffleDishRow[]): ShufflePick[] {
  return rows
    .filter((d) => {
      if (d.ever_scheduled) return false;
      if (d.clue_count !== 5) return false;
      let ingredients: unknown;
      try {
        ingredients = JSON.parse(d.ingredients);
      } catch {
        return false;
      }
      return Array.isArray(ingredients) && ingredients.length >= 3;
    })
    .map((d) => ({ id: d.id, name: d.name }))
    .sort((a, b) => a.id - b.id);
}

/**
 * One of them, chosen by a roll in [0, 1). Ordering the pool by id first means
 * the pick depends on the roll and not on whatever order D1 handed the rows back.
 */
export function pickUnserved(pool: ShufflePick[], roll: number): ShufflePick | null {
  if (pool.length === 0) return null;
  const clamped = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.999_999_999) : 0;
  return pool[Math.floor(clamped * pool.length)];
}
