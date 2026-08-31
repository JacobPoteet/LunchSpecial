---
name: suggest-clue
description: Suggest replacement clue text for a dish already in the Lunch Special catalogue, as options to read and choose from, without editing any file. Use when the user asks for a new or better clue on one dish ("new clue 3 for borscht", "beat 5 on pho is weak", "give me options for the gazpacho opener", "suggest a clue"), and they intend to paste the winner into /admin themselves. If they ask you to write the change into seed.sql and a migration, that is create-dishes instead.
---

# Suggesting a clue

The user wants options for one clue on one dish. They will paste the one they like into the dish
editor at `/admin`. **You change nothing.** No `seed/seed.sql` edit, no migration, no
`patch-clues.mjs`, no `npm test`. The deliverable is text in the reply.

## What this costs if you get it wrong

An admin edit lands in prod D1 and nowhere else, which is correct and expected (CLAUDE.md, "Prod
D1 is the only copy of half the data"). The consequence for this skill is that
**`worker/data-integrity.test.ts` will never see the clue.** CI lints `seed/seed.sql`; the live
clue came from a textarea. So the mechanizable rules that CI would have caught are yours to check
here, by hand, before you hand the line over. A suggestion that would have failed the linter ships
silently.

The one gate that still fires is the live character counter under the textarea in
`src/admin/DishEditor.tsx`, which reads the same `shared/clues.ts` budgets. Give the count in your
reply so the user knows what it will say before they paste.

## 1. Read the dish

The dish id, its row and all five clues, in one command (`borscht` → the row shows id 22):

```bash
grep -n "'borscht'" seed/seed.sql
```

```bash
grep -n "^(22," seed/seed.sql
```

Read **all five**, always, even when only one beat is being replaced. Beats hand over one handle
each and no beat may repeat an earlier one's; you cannot tell what is left to say without the
other four in front of you. A beat 5 rewrite additionally needs beat 4 measured against it (70%
vocabulary ceiling).

`seed/seed.sql` is the baseline, not necessarily what is live. Admin edits and earlier runs of
this skill are in prod D1 only. **If the user pastes the current text, that wins over the seed** —
say so plainly rather than silently reconciling, and don't go fix the seed to match.

## 2. Write the options

The brief is section 3 of `.claude/skills/create-dishes/SKILL.md`: the voice, the five beats, the
budgets, the fourteen hard rules, the swap test and the new-constraint test. Read that section
before writing a line. Do not restate it here and do not work from memory of it.

Three options is the right number. One is a decision you made for them; five is a list nobody
reads. Each option should reach for a **different kind of handle**, so the choice is between
angles and not between phrasings of one angle:

- what happened to it (history, a fight, a ruling)
- what it does to you or how you eat it
- where it turns up that nothing else does
- how it arrives, what it is cooked in, what burns you

When a dish has no cultural moment, the physical and strange routes are the ones that work. That
is the whole reason beat 3 stopped being called "What made it famous".

## 3. Check each one before you print it

Per option, not per batch:

- **Budget.** Count characters. `shared/clues.ts` holds the bands; beat 3 is 55–105 target, 120
  hard max. Print the count.
- **Sentences.** Beats 1, 4 and 5 take one. Beats 2 and 3 may take two.
- **No em dash.** No banned opener, praise word, hedge, `-ly` adverb that changes nothing, or lazy
  extreme. The lists are in section 3.4.
- **The dish's own name.** At most one word of it, and only if that word is generic across the
  catalogue.
- **Beat 1 never names the country. Beat 5 always does.**
- **Collision.** No five-word phrase shared with another dish, and no fact another dish already
  owns. Grep a distinctive span of the candidate, and grep the fact's subject:

```bash
grep -rn -i "cosmonaut\|space station" seed/seed.sql
```

  Near-duplicate dishes are the trap. `borscht` and `borsch-ukrainian-style` are both Ukrainian
  beet soup, and the UNESCO listing is already spent on both.
- **The swap test.** Could this sentence sit on another dish in the catalogue without looking
  wrong? Then it is not a clue.
- **The new-constraint test.** Name what a player can rule out after reading it. "Nothing" means
  rewrite.

Anything failing a check does not get printed with a caveat. It gets replaced.

## 4. Reply

Per option: the line, its character count, and one clause on the handle it hands over. Then the
collisions you checked and what the replacement displaces from the existing set. Keep it short
enough to read in the terminal; this is a menu, not a report.

Close by naming where it goes: `/admin` → Dishes → the dish → clue N. Do not offer to make the
edit, and do not open a PR. If the user then asks you to write it into the repo, that is
`create-dishes` and its `scripts/patch-clues.mjs` route, which does touch both files and does run
the linter.
