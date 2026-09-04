---
name: create-drinks
description: Add drinks to the Lunch Special After Dark catalogue, following the coaster sheet in section 3. Use when the user says "add drinks: Negroni (Italy), Pisco Sour (Peru)", asks for a new drink batch, asks to stock the bar, or asks to rewrite the coasters on drinks that already exist. For dishes rather than drinks use create-dishes; for clue options the user will paste into /admin themselves, with no file written, use suggest-clue.
---

# Adding drinks to Lunch Special

One drink is one `drinks` row plus exactly three `drink_clues` rows. A drink is only pourable with
three or more ingredients and exactly three coasters, so always produce both.

This is the bar's half of `create-dishes`, and it is a separate skill for the same reason the
tables are separate: two of the four attributes differ, the clue count differs, and the pools must
never meet. **Section 3 is the coaster sheet** — the voice, the three beats, the character budgets,
the hard rules and the two tests. The mechanizable half is enforced by
`worker/data-integrity.test.ts`, which fails in CI.

## 1. Get the inputs

The user gives a name and usually a country. Infer region, spirit, temperature, profile,
ingredients and the alcohol flag from the drink.

**Ask, don't guess, when a field is genuinely ambiguous.** The usual case is a drink that exists in
a spirited and a spiritless version, or one whose base varies by country. One question covering the
whole batch beats five questions one at a time.

If the drinks came from players, tag them: `is_fan_submission = 1`, set by an
`UPDATE drinks SET ... WHERE slug IN (…)` keyed by slug in both the seed and the migration. Never
touch the `INSERT INTO drinks` column lists for it; the column defaults to 0.

## 2. Fill the row

Enums are CHECK-constrained in `migrations/0039_add_drinks.sql` and mirrored in `shared/types.ts`.

| Field | Rule |
|---|---|
| `name` | Unique across drinks. Escape apostrophes as `''` in SQL |
| `slug` | lowercase-kebab, unique, ASCII. Strip accents: `Piña Colada` → `pina-colada` |
| `country` | Real country, free text. Use the spelling the catalogue already uses (`Türkiye`, `United Kingdom`) |
| `region` | One of the same nine as dishes. **This drives the yellow near-match, so bucket it carefully** |
| `spirit` | gin \| whiskey \| rum \| tequila \| vodka \| brandy \| wine \| beer \| none \| other |
| `temperature` | hot \| cold, as served |
| `profile` | sweet \| sour \| bitter \| strong \| creamy — how it *drinks*, not what is in it |
| `ingredients` | JSON array, lowercase singular, 3 minimum, 4–6 in practice |
| `is_alcoholic` | 0 or 1. **Stored, never derived** — see below |

**`spirit: 'none'` means no base spirit, not "no alcohol".** A mocktail is `none`; so is a coffee
and so is a tea. Beer and wine have their own values and are very much alcoholic, and arak is
`other` and alcoholic while kava is `other` and not. That pairing has a test pinning it, because
"simplify this to `spirit != 'none'`" is the obvious wrong idea and someone will have it.

**`profile` is how it drinks.** A drink with lemon in it is not automatically `sour`; a Sidecar is,
a Kir Royale is not. Pick what a person would say after the first mouthful.

**Grep `seed/seed.sql` for an ingredient before coining a new spelling.** The vocabulary is pooled
with the kitchen's, because a bar and a kitchen share a pantry — `lime`, `sugar`, `cinnamon` and
`cream` are all already in there. Two spellings of one ingredient means two ingredients, and the
feedback silently under-reports for every row holding either.

**Keep the pool between 55% and 75% alcoholic.** `worker/data-integrity.test.ts` enforces the band,
because the mix is a design decision rather than an accident of what got written. A batch of nothing
but cocktails will fail CI, and correctly. Check where the pool sits before you start:

```bash
npx wrangler d1 execute lunch-special-db --local --command \
  "SELECT COUNT(*) n, SUM(is_alcoholic) boozy FROM drinks WHERE is_active = 1"
```

## 3. The coaster sheet

Three coasters per drink, slid across the bar one at a time after each wrong guess. A Nightcap
gives four guesses, so at most three misses, so three coasters — a fourth could never be printed
and the writer would still have to fill it.

**This is not the five-beat sheet with two beats deleted.** Five compressed into three is a worse
structure than three written as three, and the deletion would have to fall on the origin or the
build, which are the two that carry the most weight. What the three do instead is fold origin and
build into one middle beat.

### 3.1 Who is talking

The same diner, later. A bartender at the end of a shift, talking to the one person still at the
bar.

The cook in `create-dishes` has forty seconds before the next order lands. The bartender has the
time it takes to pour, and a room that has gone quiet. Slightly drier, slightly more willing to
tell you something odd, never chatty.

- **Second person**, like the kitchen. "You crush lime wedges with sugar and pour raw cane spirit
  over the lot."
- **Present tense**, except when the clue is history.
- **Somebody is always doing something.** Distillers, bartenders, farmers, drinkers, a named
  person, or you.
- **Dry, not jokey.** The bartender can be wry. The bartender does not do bits.

Already in the catalogue and getting it right:

> Half a dozen bartenders claim they poured the first. *(Margarita)*
>
> Two Los Angeles men with unsellable stock, one of vodka and one of ginger beer, put them together
> in a copper mug in 1941. *(Moscow Mule)*
>
> Brooklyn candy stores built it from syrup, cold milk and a hard spray of seltzer, and the name
> lies about both of its halves. *(Egg Cream)*

### 3.2 The three beats

Each beat hands over one kind of handle, and no beat reuses an earlier one's. The names, jobs and
budgets live once in `COASTER_BEATS` in `shared/clues.ts`, imported by both the linter and the live
counter under each textarea in the admin's Bar editor.

| # | Beat | The handle it hands over |
|---|---|---|
| 1 | **The room** | The region, and what kind of drink is in the glass. Never the country |
| 2 | **The pour** | Who mixed it and what goes in. Two sentences allowed; it is the only one |
| 3 | **Last call** | The country, and what it looks like in front of you |

#### Coaster 1 — The room

Region and form. Nothing else, and it should read as short as it is.

**Never name the country, and never riddle your way to it.** The country tile is the middle game's
work.

> A blood-red aperitivo from southern Europe, stirred and never shaken. *(Negroni)*
>
> A clear anise spirit from southern Europe that clouds with water. *(Ouzo)*
>
> A salty yogurt drink from the Middle East, served ice cold. *(Ayran)*

The United States is the one exemption, exactly as in the kitchen: its region-level answer is a
part of the country. Say "the American bar canon" or "North America", never the state or the city.

Say what *kind* of drink it is. "A cocktail from Europe" is not a clue; "a bright orange patio
drink from southern Europe, mostly bubbles" is.

#### Coaster 2 — The pour

Who made it, when, why, and what goes in the glass. This is the beat carrying two of the kitchen's,
which is why it gets two sentences and the widest budget.

A person or a group has to be the subject, and the build has to be specific enough to act on.

> A count in Florence asked for his aperitivo stiffened with gin in 1919, and got equal parts of
> three bottles poured over ice. *(Negroni)*
>
> A model asked a Soho bartender in 1983 for something to wake her up and knock her out, so he
> shook vodka with coffee and its liqueur. *(Espresso Martini)*
>
> A soldier arrived at a Paris bar in a motorcycle's passenger seat, and the barman shook cognac
> with orange liqueur and lemon for him. *(Sidecar)*

Contested origins are good material. State the fight plainly rather than hedging it. If you can't
source a date, leave the date out.

Name the ingredients the feedback tiles score on. Three or four is plenty.

#### Coaster 3 — Last call

Everything but the name. Missing here should feel unlucky, never unfair.

Two jobs, and they don't conflict. As a clue it is the last thing read before the final guess. As a
caption it is the one-line definition printed under the answer on the tab, because `NightPage`
takes `reveal.coasters.at(-1)` and prints it there.

Both want the same sentence: **name the country, then say what the thing looks and feels like in
front of you.**

> Mexico's pale green sour, served up or on the rocks with a crust along the lip. *(Margarita)*
>
> Korea's green bottle poured into shot glasses, and you fill a neighbour's before your own.
> *(Soju)*
>
> America's copper-mug cooler, frosted on the outside with a spent lime shell in it. *(Moscow Mule)*

Test it by covering coaster 2. If coaster 3 still tells you something, it's a beat. If it doesn't,
it's a summary.

### 3.3 Budgets

The ceiling is the useful half. It forces you to pick which fact belongs on this coaster, which is
the choice a long clue avoids.

| Beat | Target | Hard max | Sentences |
|---|---|---|---|
| 1 The room | 35–70 | 85 | 1 |
| 2 The pour | 65–125 | 140 | 1–2 |
| 3 Last call | 45–100 | 115 | 1–2 |

A finished set runs 180–300 characters, against the kitchen's 300–500. The bar's whole register is
shorter, and the board it prints on holds four guesses rather than six.

**The table above is prose. The numbers live once, in `shared/clues.ts`**, which both the linter and
the admin's live counter import. Re-tune a band there and both move together — and change it here
too, since a sheet that disagrees with the gate is worse than one with no numbers in it.

### 3.4 Hard rules

Every hard rule from the dish beat sheet applies unchanged, because `lintClue` reads both
catalogues and takes the sheet as an argument rather than being forked. A forked copy is how the
drinks catalogue would quietly stop enforcing the banned-praise list six months from now.

Rules 1–7 and 9–13 are **machine-checked** and will fail CI. Rules **8 and 14 are not** — no linter
can tell whether a sentence has someone doing something in it, or whether a coaster reads as an
invitation. Those two are yours, like the swap test.

1. **Never the drink's name.** A word from the name is barred when it is distinctive, measured
   against the *drinks* catalogue's own names and ingredient lists. The frequency map is per-table:
   a word generic across 400 dishes can be perfectly distinctive across 40 drinks.
2. **A clue may carry at most one word of its drink's name.**
3. **When a barred word is also an ingredient, leave it out. Don't describe your way around it.**
   Root Beer Float can't say root or beer, so it says "a dark sassafras soda" — a real synonym, not
   a riddle. If the clue collapses without the word, the name was doing all the work and coaster 2
   needs a better fact.
4. **Coaster 1 never names the country. Coaster 3 always does.** The US is the one exemption.
5. **No em dashes.** A comma or a full stop keeps the beat to a single idea.
6. **Coaster 3 must add vocabulary coaster 2 didn't have.** Ceiling is 70% shared.
7. **No phrase of five or more words appears on two different drinks.**
8. **Every clue has a subject that acts**, on coasters 2 and 3. Coaster 1 is exempt: it is a label.
9. **Banned openers:** *It is the, It's the, It is now, It's now, It remains, It has become, This
   dish, Known as, Considered.*
10. **Banned praise:** *beloved, iconic, legendary, quintessential, must-try, delicious,
    mouthwatering, renowned, celebrated, revered, world-famous, the ultimate, a staple, a fixture,
    the go-to.*
11. **Banned hedges:** *often, usually, typically, generally, commonly, arguably, widely,
    reportedly, perhaps, somewhat, quite, very.*
12. **No -ly adverbs** unless the adverb changes a fact.
13. **No lazy extremes**: *every, always, never, everyone, nobody, worldwide, nationwide.*
14. **Nothing that reads as a recommendation to drink.** The bartender describes; the bartender
    does not press. "You'll want one after the week you've had" is not a clue, it is an advert. This
    is the one rule the kitchen doesn't have, it is not machine-checked, and it is why the fine
    print on the board says "please drink responsibly" — the coasters shouldn't be undoing that.

The ingredient list in coaster 2 and the garnishes in coaster 3 are exempt from the rhythm rules
and can run to three or four items.

### 3.5 Two tests before you commit a drink

Answer both out loud, per coaster. Neither is mechanizable, which is why they're written down.

**The swap test.** Could this sentence sit on a different drink in this catalogue without looking
wrong? If yes, rewrite it. The bar is small, so this bites harder than it does in the kitchen:
there are four sours with lime in them and a coaster that says "shaken with lime and sugar" fits
all four.

**The new-constraint test.** Name what a player can rule out after reading this that they couldn't
before. If the answer is "nothing", rewrite it.

### 3.6 Facts

The game asserts things about other people's national drinks to an audience that includes people
who grew up drinking them.

- If you can't confirm a date, a name or a number, write the coaster without it.
- Origin stories are contested more often than not, and cocktail history is worse than food
  history for this — the Margarita has half a dozen claimants and the Martini's descent is
  genuinely unresolved. Say so plainly rather than laundering it through "is said to have been".

### 3.7 Reference sets

These five are the standard. When a beat isn't working, read the same beat across all five.

`negroni` · `moscow-mule` · `egg-cream` · `ayran` · `pisco-sour`

Two of the five are alcohol-free on purpose. The sober half of the pool is the half most likely to
get thin writing, because it has no origin myth to lean on.

## 4. Write the rows to both places

**`seed/seed.sql`** — the canonical catalogue. Append to the `INSERT INTO drinks` block and add
three rows to `INSERT INTO drink_clues`.

**`migrations/000N_add_<batch>.sql`** — how it reaches production. INSERTs only, no `DELETE`s, and
the drink keyed by slug rather than a hardcoded id:

```sql
INSERT INTO drink_clues (drink_id, order_index, text) VALUES
  ((SELECT id FROM drinks WHERE slug='negroni'), 1, '…');
```

CI applies the migration on the next `v*` release. **Never re-run the seed against prod** — it
DELETEs the hand-booked nights and every admin edit, which exist nowhere else.

**Pool only. Never write `INSERT INTO drink_schedule` rows.** New drinks land in the active pool
and the admin's nightly board assigns nights. An unbooked night runs on the deterministic fallback
pour and never 404s.

When you add a country the catalogue has never used, add it to `COUNTRY_ALIASES` in
`worker/data-integrity.test.ts` too, or coaster 3 will be unable to satisfy the rule that it name
the country.

## 5. Run the linter

```bash
npx vitest run worker/data-integrity.test.ts
```

Two describe blocks cover the bar. **`back bar data integrity`** checks the pool size, the 55–75%
alcohol band, regions, spirits, profiles, slugs, ingredient counts, exactly three coasters, the
beer/wine alcohol pairing, and that no night is booked with an unpourable drink.
**`the coaster sheet`** runs every rule in section 3.4 over every drink.

Only the ceilings fail. Being outside a target band prints a count and passes, because a test that
reddens over a well-written 55-character coaster gets muted inside a week. Watch that count.

It cannot judge whether a coaster is any good. The swap test and the new-constraint test are yours.

## 6. Finish

```bash
npm test && npm run check
```

Then look at one of them on a real board, which is the part the linter can't do:

```bash
npm run negroni          # or add an npm script for the drink you just wrote
```

Confirm each new drink has three coasters and three or more ingredients before committing.

---

## Rewriting an existing drink

An admin edit lives in prod D1 only, so the linter never sees it. If the user is going to paste the
text into `/admin` themselves, hand back options and write nothing — that is `suggest-clue`'s job,
and the mechanizable checks have to be done by hand.

If the rewrite belongs in the repo, it goes in both places like a new drink: the seed updated in
place, and an additive migration of `UPDATE drink_clues` keyed by slug. **A rename regenerates the
slug**, so a migration written against the old one matches nothing and fails silently — re-aim the
text at the new slug rather than renaming the drink back.
