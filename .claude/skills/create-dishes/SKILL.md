---
name: create-dishes
description: Add dishes to the Lunch Special catalogue, or rewrite an existing dish's clues, following the beat sheet in CLUES.md. Use when the user says "add dishes: Pho (Vietnam), Bibimbap (South Korea)", asks for a new dish batch, pastes suggestions from the admin Requests tab, or asks to rewrite/fix/backfill the clues on dishes that already exist.
---

# Adding dishes to Lunch Special

One dish is one `dishes` row plus exactly five `clues` rows. A dish is only schedulable with
three or more ingredients and exactly five clues, so always produce both.

**Read `CLUES.md` before writing a single clue.** It is the beat sheet: the voice, the five beats,
the character budgets, fourteen hard rules and the two tests. This file is the workflow around it
and deliberately does not restate it, because two copies of a spec become two different specs.

## 1. Get the inputs

The user gives a name and usually a country. Infer region, course, temperature, protein and
ingredients from the dish.

**Ask, don't guess, when a field is genuinely ambiguous.** Regional protein variants are the usual
case: a Vietnamese dish that exists in beef and chicken versions needs a decision, not a coin
flip. One question covering the whole batch beats five questions one at a time.

If the user says the dishes came from players, tag them: `is_fan_submission = 1`, set by an
`UPDATE ... WHERE slug IN (…)` keyed by slug in both the seed and the migration. Never touch the
`INSERT INTO dishes` column lists for it; the column defaults to 0.

## 2. Fill the row

Enums are CHECK-constrained in `migrations/0001_init.sql` and mirrored in `shared/types.ts`.

| Field | Rule |
|---|---|
| `name` | Unique. Escape apostrophes as `''` in SQL |
| `slug` | lowercase-kebab, unique, ASCII. Strip accents: `Crème Brûlée` → `creme-brulee` |
| `country` | Real country, free text |
| `region` | One of nine. **This drives the yellow near-match, so bucket it carefully** |
| `course` | breakfast \| appetizer \| entree \| dessert \| drink |
| `temperature` | hot \| cold, as served |
| `protein` | The dominant one; `vegetarian` if none |
| `ingredients` | JSON array, lowercase singular, 3 minimum, 5–8 in practice |

**Grep `seed/seed.sql` for an ingredient before coining a new spelling.** Two spellings of one
ingredient means two ingredients, and the ingredient feedback silently under-reports for every
dish holding either. `tomato`, not `tomatoes`.

## 3. Write the five clues

Follow `CLUES.md`. Two things that catch people out every time:

- **Beat 1 gives the region, never the country**, and never a riddle that decodes to one. The
  backfill removed 135 clues doing exactly that, half of them naming the country outright and half
  riddling it ("a country south of the United States").
- **Beat 5 must not be a shorter beat 4.** Cover beat 4 and read beat 5 alone. If it tells you
  nothing new, it is a summary, not a clue.

Before moving on, run the swap test and the new-constraint test on all five out loud.

## 4. Write the rows to both places

**`seed/seed.sql`** — the canonical catalogue. Append with the next sequential dish `id`, same
`INSERT INTO dishes (...) VALUES` format, and five clue rows in the `INSERT INTO clues` block.

**`migrations/000N_add_<batch>.sql`** — how it reaches production. INSERTs only, no `DELETE`s,
and the dish keyed by slug rather than a hardcoded id:

```sql
INSERT INTO clues (dish_id, order_index, text) VALUES
  ((SELECT id FROM dishes WHERE slug='pho'), 1, '…');
```

CI applies the migration on the next `v*` release. **Never re-run the seed against prod** — it
DELETEs the hand-booked schedule and every admin edit, which exist nowhere else.

**Pool only. Never write `INSERT INTO schedule` rows.** New dishes land in the active pool and the
admin autofill assigns dates.

## 5. Run the linter

```bash
npx vitest run worker/data-integrity.test.ts
```

It checks every dish in the catalogue against the mechanizable half of the beat sheet: length
ceilings, sentence counts, em dashes, banned openers and praise and hedges, the dish's own
name-words, beat 1 naming the country, beat 5 failing to, beat 5 overlapping beat 4 past 70%, and
five-word phrases shared across dishes. Fix what it reports and run it again.

It cannot judge whether a clue is any good. The swap test and the new-constraint test are yours.

## 6. Finish

```bash
npm test && npm run check
```

Confirm each new dish has five clues and three or more ingredients before committing.

---

## Rewriting an existing dish

Use `scripts/patch-clues.mjs`. Write a JSON patch and let it edit both places at once:

```json
{ "pho": { "1": "A noodle soup from Southeast Asia.", "5": "…" } }
```

```bash
node scripts/patch-clues.mjs patch.json backfill_<name>
```

It rewrites the rows in `seed/seed.sql` and writes `migrations/00NN_backfill_<name>.sql` as
`UPDATE`s keyed by slug. Re-running with the same migration name merges rather than replacing, and
it refuses a slug it cannot find or a clue whose text did not change.

Three things worth knowing:

1. **Work a beat at a time, not a dish at a time.** The whole 1,905-clue backfill went beat by
   beat, which makes each pass one kind of judgment repeated instead of 381 separate creative
   problems. Beat 4 has to land before beat 5, since the overlap check measures against it.
2. **A beat-5 rewrite needs beat 4 in front of you.** Otherwise you write the summary the rule
   exists to prevent.
3. **Check the seed and the migration agree** (`npm test` covers it). A patcher bug once dropped
   66 of 88 rewrites out of a migration while leaving them in the seed; only prod would have
   noticed.
