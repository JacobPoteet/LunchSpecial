---
name: create-dishes
description: Add dishes to the Lunch Special catalogue, or rewrite an existing dish's clues, following the beat sheet in section 3. Use when the user says "add dishes: Pho (Vietnam), Bibimbap (South Korea)", asks for a new dish batch, pastes suggestions from the admin Requests tab, or asks to rewrite/fix/backfill the clues on dishes that already exist. For clue options the user will paste into /admin themselves, with no file written, use suggest-clue instead.
---

# Adding dishes to Lunch Special

One dish is one `dishes` row plus exactly five `clues` rows. A dish is only schedulable with
three or more ingredients and exactly five clues, so always produce both.

**Section 3 is the beat sheet** — the voice, the five beats, the character budgets, the fourteen
hard rules and the two tests. It is the brief every clue in the catalogue was written against.
Read it before writing one. The mechanizable half is enforced by
`worker/data-integrity.test.ts`, which fails in CI.

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

## 3. The beat sheet

Five clues per dish, printed one at a time on a clue ticket after each wrong guess. Five beats,
the same sequence for every dish, running from a map to a near-giveaway. Each beat states what its
clue has to accomplish and what it must not give away, which is the difference between a brief and
a blank page.

This exists because 26 batches drifted a long way apart: the first fifty dishes average 315
characters across their five clues, the last fifteen average 784, and about half the catalogue
had a fifth clue that only repeated the fourth.

### 3.1 Who is talking

A short-order cook, mid-shift, talking to you across the counter.

The cook knows the food cold and has no interest in impressing you. Says what's in it, who eats
it, what happened the year it was invented. Never says a dish is beloved. Has forty seconds before
the next order lands.

- **Second person.** "The dip you scoop with warm pita." "Bite a hole in it first or you'll wear
  the broth."
- **Present tense**, except when the clue is history.
- **Somebody is always doing something.** Cooks, eaters, immigrants, a named person, or you.
  Never "its bright color makes it the most photographed dish" — nobody is in that sentence.
- **Dry, not jokey.** The cook can be wry. The cook does not do bits.

Already in the catalogue and getting it right:

> Purists riot when you add cream; the internet riots when chefs add peas. *(Carbonara)*
>
> The beige dip you scoop with warm pita. *(Hummus)*
>
> Spain's cold soup, basically a salad you drink. *(Gazpacho)*

Not getting it right:

> Its smoky char and red hue have made it a curry-house menu fixture worldwide.
>
> It's a staple on nearly every traditional pub menu in the country.
>
> Its bright color makes it the dish most photographed on Indian restaurant menus.

### 3.2 The five beats

Each beat hands over one kind of handle, and no beat reuses an earlier beat's kind. A clue that
restates something already given is a wasted guess, and the player paid for it.

| # | Beat | The handle it hands over |
|---|---|---|
| 1 | **Broad geography** | Which of the nine regions, and what kind of thing is on the plate |
| 2 | **Origin and history** | Who made it, when, and why |
| 3 | **What makes it unmistakable** | The one thing true of this dish and almost nothing else |
| 4 | **A key ingredient or technique** | What goes in it and how it's cooked |
| 5 | **Near-giveaway** | The country, and what it looks like sitting in front of you |

Beat 3 changed name. It was "What made it famous", and that name is what produced the filler:
when a dish has no cultural moment, "fame" leaves the writer nothing to do but praise it. Fame is
now one route to an unmistakable fact rather than the requirement. The other four names are
unchanged from the beat sheet in `docs/index.html`.

#### Beat 1 — Broad geography

Region and form. Nothing else.

**Never name the country, and never riddle your way to it.** The country tile is the middle game's
work. Beat 1 used to give the country outright for 90 dishes, and did it from a template: six
clues contained "a very large south asian country", six more "an east asian island nation", four
"a country south of the United States". A player who does this daily learns the decoder ring in a
fortnight.

Say the region the way a person would, then say what sort of dish it is.

> A noodle soup from Southeast Asia, eaten for breakfast. *(Pho)*
>
> A cold summer soup from southern Europe. *(Gazpacho)*
>
> A fried snack sold on East Asian street corners. *(Takoyaki)*

Don't add the temperature, the technique, or a second identifying hook. Beat 1 is the smallest
clue in the set and should read that way.

**The one exception** is the United States, where the region-level answer is a part of the country:
"the American South", "the Gulf Coast", "New England". Say the part, never the state or the city.
Those belong to beat 2.

#### Beat 2 — Origin and history

Who made it, when, why. A person or a group has to be the subject. This is the first beat with a
voice, where the dish becomes a place rather than a puzzle token.

> Roman legend ties it to charcoal workers, or to American rations after the war. *(Carbonara)*
>
> Andalusian field workers blended it long before anyone had a refrigerator. *(Gazpacho)*
>
> Osaka vendors started filling batter balls with diced seafood in the 1930s. *(Takoyaki)*

Contested origins are good material. State the fight plainly rather than hedging it: "Two towns
still claim it" beats "it is said to have been invented by". If you can't source a date, leave the
date out.

#### Beat 3 — What makes it unmistakable

The beat that carries the round, and the one the spec is strictest about. It lands on the third
miss, when someone needs a reason to stay in, and it's the beat a player who loses still repeats
to somebody at lunch.

It should name something true of this dish and almost no other one. It is also the beat most
likely to go soft: 77 beat-3 clues once opened "It is the…" or "It's the…", and 52 combined praise
words with no fact at all.

The bar is the **swap test**. If the sentence could sit on a different dish in the catalogue
without looking wrong, it isn't a clue.

Working:

> Sichuan peppercorn makes your tongue buzz, and it isn't a pepper at all. *(Dan Dan Noodles)*
>
> A flat-pack furniture store sells about a billion a year. *(Swedish Meatballs)*
>
> A 2007 animated rat made it fine-dining famous. *(Ratatouille)*

Not working, and all three would fit a dozen other dishes:

> Chiang Mai locals debate fiercely whose bowl is the city's best.
>
> It's considered the ultimate hangover cure.
>
> It's a fixture on traditional pub menus.

When a dish has no cultural moment, reach for something physical and strange: how it arrives, how
you eat it, what burns you, what it's cooked in, what it's traditionally served beside.

#### Beat 4 — A key ingredient or technique

Turns knowing about the dish into being able to name it. **The cook is cooking, or you are.**
Beat 4 drifts passive if you let it ("Fried tortilla chips are smothered with…", "A tin of
condensed milk is boiled…"), which is both flat and long. Put a subject in front.

> You blend chickpeas smooth with tahini, lemon and garlic. *(Hummus)*
>
> Beef and rice noodles sit in a broth perfumed with star anise and charred ginger. *(Pho)*

Name the ingredients the feedback tiles score on. Three or four is plenty; a full recipe is not a
clue.

#### Beat 5 — Near-giveaway

Everything but the name. Missing here should feel unlucky, never unfair.

Two jobs, and they don't conflict once you know about the second one. As a clue it's the last
thing a player reads before their final guess. As a caption it's the one-line definition printed
under the answer on the check, because `GamePage.tsx` takes `reveal.clues.at(-1)` and prints it
there.

Both jobs want the same sentence: **name the country, then say what the thing looks and feels like
in front of you.** Neither wants a shorter version of beat 4, which is what 186 dishes had before
the backfill.

Working:

> Vietnam's noodle soup under a pile of herbs, with lime and sprouts on the side. *(Pho)*
>
> The beige Lebanese dip you scoop with warm pita. *(Hummus)*
>
> Britain's chip-shop dinner, best with malt vinegar and mushy peas. *(Fish and Chips)*

Not working, because beat 4 already said it:

> 4. Fried eggs sit on tortillas under a warm tomato-chili salsa with beans.
> 5. Fried eggs on tortillas with salsa and beans.

Test it by covering beat 4. If beat 5 still tells you something, it's a beat. If it doesn't, it's
a summary.

### 3.3 Budgets

The ceiling is the useful half. It forces you to pick which fact belongs on this beat, which is
the choice a long clue avoids.

| Beat | Target | Hard max | Sentences |
|---|---|---|---|
| 1 Broad geography | 35–70 | 85 | 1 |
| 2 Origin and history | 60–110 | 130 | 1–2 |
| 3 What makes it unmistakable | 55–105 | 120 | 1–2 |
| 4 Key ingredient or technique | 60–120 | 130 | 1 |
| 5 Near-giveaway | 45–100 | 115 | 1 |

A finished set runs 300–500 characters. Anything over 565 is broken regardless of how good the
sentences are, because the player reads all five on a 375px board between guesses.

Two bands were widened by the backfill rather than guessed at. Beat 5 carries the country *and* a
picture of the plate, which costs about 90 characters: the first seven dishes written against this
spec all landed at 89–100. Beat 4 names three or four ingredients *and* a technique, and 16 of the
first 78 rewrites landed at 116–120 with none of them reading long.

**The table above is prose. The numbers themselves live once, in `shared/clues.ts`**, which both
`worker/data-integrity.test.ts` (the gate that fails CI) and `src/admin/DishEditor.tsx` (the live
counter under each textarea in `/admin`) import. Re-tune a band there and both move together. If
you change a number, change it here too, since a beat sheet that disagrees with the gate is worse
than one with no numbers in it.

### 3.4 Hard rules

Breaking one of these is a bug, not a style disagreement. Everything here is checked by
`worker/data-integrity.test.ts`, for every dish in the catalogue.

1. **Never the dish's name.** What that means in practice took a pass over the whole catalogue to
   settle. The first version banned *every* word of the name, and checking it against all 381
   dishes returned 454 violations that were almost entirely noise: "beef" in Beef Bourguignon,
   "salad" in Caprese Salad. Those give nothing away — the catalogue has 50 beef dishes and 9
   salads — and banning them is what produced "a warm brown bark spice" for cinnamon. Two rules
   replaced it:
   - **A word from the name is barred when it is distinctive**, measured against the catalogue's
     own names and ingredient lists. Under 8 dishes makes a word rare; category words (*fried,
     baked, sweet, green, cake, soup, salad, tart, roll, bread, pudding* and the rest of the list
     in `data-integrity.test.ts`) are generic however rarely they appear, because frequency counts
     ingredients and those are not ingredients.
   - **A clue may carry at most one word of its dish's name.** Butter Tart can say "butter";
     Cinnamon Rolls cannot say cinnamon *and* rolls in the same sentence, which is the name.
2. **Portmanteau names count as whole words only.** "Banoffee" bars *banoffee*, not *banana* and
   not *toffee* as separate words — though toffee is what the dish is made of, so judgment still
   applies. The rule stops the tokenizer banning half the pantry; it doesn't license spelling the
   name out in parts.
3. **When a barred word is also an ingredient, leave it out. Don't describe your way around it.**
   Cinnamon Rolls said "a warm brown bark spice" while Cream of Wheat said "cinnamon" two dishes
   away, and Banoffee Pie said "sliced yellow tropical fruit" twice. Omit the ingredient and lean
   harder on beat 3. If the clue collapses without it, the dish name was doing all the work and
   beat 3 needs a better fact.
4. **A translation of the name is allowed at beat 5 and nowhere else.** "Rancher's eggs" is not
   the dish's name, but it lands like one for anyone who speaks the language, so it belongs on the
   beat that gives the country away anyway.
5. **Beat 1 never names the country. Beat 5 always does.** The United States is the one exemption,
   because a US regional dish's region-level answer *is* "the American South" or "the Gulf Coast",
   and the alternative is the decoder-ring template this rule exists to kill. Name the part, never
   the state or the city.
6. **No em dashes.** They're how two clues get welded into one. A comma or a full stop keeps the
   beat to a single idea.
7. **Beat 5 must add vocabulary beat 4 didn't have.** Ceiling is 70% shared.
8. **No phrase of five or more words appears on two different dishes.**
9. **Every clue has a subject that acts**, on beats 2 through 5. A person, a group, or you.
   Beat 1 is exempt: it is a label, and the good ones already read as one ("A cold summer soup
   from southern Europe").
10. **Banned openers:** *It is the, It's the, It is now, It's now, It remains, It has become,
    This dish, Known as, Considered.*
11. **Banned praise:** *beloved, iconic, legendary, quintessential, must-try, delicious,
    mouthwatering, renowned, celebrated, revered, world-famous, the ultimate, a staple, a fixture,
    the go-to.* Calling a dish important is not a clue. Say who eats it and when.
12. **Banned hedges:** *often, usually, typically, generally, commonly, arguably, widely,
    reportedly, perhaps, somewhat, quite, very.* If it's true, say it. If you can't confirm it,
    cut it.
13. **No -ly adverbs** unless the adverb changes a fact. "Roasted for six hours" beats "slowly
    roasted". Bangers and Mash beat 2 keeps *loudly*, because the noise is where the nickname
    comes from.
14. **No lazy extremes**: *every, always, never, everyone, nobody, worldwide, nationwide.* "Nearly
    every pub" is a sentence with no information in it.

Two lists are exempt from the rhythm rules: the ingredients in beat 4 and the garnishes in beat 5
can run to three or four items.

### 3.5 Two tests before you commit a dish

Answer both out loud, per clue. Neither is mechanizable, which is why they're written down.

**The swap test.** Could this sentence sit on a different dish in this catalogue without looking
wrong? If yes, rewrite it. This catches every filler beat 3.

**The new-constraint test.** Name what a player can rule out after reading this that they couldn't
before. If the answer is "nothing", rewrite it. This catches every beat 5 that paraphrases beat 4.

### 3.6 Facts

The game asserts things about other people's national dishes to an audience that includes people
who grew up eating them.

- If you can't confirm a date, a name or a number, write the clue without it. A clue works fine
  with no year in it.
- Origin stories are contested more often than not. Say so in the clue rather than laundering it
  through "is said to have been". Falafel's Coptic origin, Beef Wellington's Duke and Poutine's
  Québec diner are all disputed, and saying they're disputed is more interesting than pretending
  they aren't.

51 clues assert a specific year and nothing checks any of them.

### 3.7 Reference sets

These five are the standard. When a beat isn't working, read the same beat across all five.

`pho` · `hummus` · `gazpacho` · `fish-and-chips` · `spaghetti-carbonara`

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

When you add a country to the catalogue, add it to `COUNTRY_ALIASES` in
`worker/data-integrity.test.ts` too, or beat 5 will be unable to satisfy the rule that it name the
country.

## 5. Run the linter

```bash
npx vitest run worker/data-integrity.test.ts
```

It checks every dish in the catalogue against the mechanizable half of section 3: length
ceilings, sentence counts, em dashes, banned openers and praise and hedges, the dish's own
name-words, beat 1 naming the country, beat 5 failing to, beat 5 overlapping beat 4 past 70%, and
five-word phrases shared across dishes. Fix what it reports and run it again.

Only the ceilings fail. Being outside a target band prints a count and passes, because a test that
reddens over a well-written 55-character clue gets muted inside a week. Watch that count: a slow
climb is the inflation section 3 exists to stop.

A second test, `backfill migrations and the seed agree`, reads every `UPDATE clues` in
`migrations/` as text and requires the **last** write to each `(slug, beat)` to match what the seed
says that clue is now. Last-write-wins, because a later migration legitimately overrides an earlier
one. It exists because `buildDb()` applies migrations and *then* the seed on top, so the seed
always wins and a migration missing rows is invisible to every other test in the file.

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
