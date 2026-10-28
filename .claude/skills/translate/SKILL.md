---
name: translate
description: Draft a new language for Lunch Special's player-facing words, or bring an existing locale up to date with English, from the typed catalog in shared/i18n/locales/en.ts. Use when the user asks to add a language ("/translate fr", "add German", "draft a Portuguese catalog"), to fill in keys a locale is missing after English grew, or to redo one locale's wording. The draft ships picker-only (`autoDetect: false`) until a native speaker has read it. Content (dish and drink names, clues, coasters, ingredients, countries) is not this skill's job: it stays English until phase 2 of #269.
---

# Translating the catalog

The game's own words live in one typed catalog per language. English (`shared/i18n/locales/en.ts`)
is the source of truth; every other locale is a file named for its BCP 47 tag, typed `Messages`.
You write that file. **You do not turn on auto-detection.** A draft is reached by the footer's
picker or `?locale=<tag>` until a native speaker has read it and the user flips `autoDetect`.

Read before writing: `shared/i18n/locales/en.ts` (every key and its doc comment), the newest
non-English locale as a worked example (`es.ts`), `shared/i18n/format.ts` (`plural`, `list`), and
CLAUDE.md's "Languages" section.

## 1. Wire the locale

A new language is three edits and one file, nothing else:

1. `shared/i18n/locales/<tag>.ts`, `const xx: Messages = { … }; export default xx;`
2. `LOCALES` in `shared/locale.ts`: `{ tag, name, autoDetect: false }`. `name` is the language in
   its own words ("Deutsch", "Português (Brasil)"), as the picker prints it.
3. `CATALOGS` in `shared/i18n/catalogs.ts`: import it and add it under its tag.
4. `MAY_MATCH_ENGLISH` in `shared/i18n/catalog.test.ts`, for any key you leave identical to English
   on purpose (see the glossary). Add the key path, never the value.

The client loads the file as its own chunk (`src/i18n/store.ts` globs the folder); nothing there
changes. Decisions already made: Simplified Chinese only (`zh-Hans`), Brazilian Portuguese only
(`pt-BR`).

## 2. The glossary

These names carry the game. Keep them consistent across every key that uses them, and write the
choice into the file's header comment the way `es.ts` does.

| English | Rule |
|---|---|
| Lunch Special (the logo, share titles) | **English in every language.** Never translated. |
| After Dark (the marquee, share titles) | **English in every language.** |
| the Special (today's mystery dish) | Translate. A proper noun inside the game: capitalised wherever English capitalises it. |
| Leftovers (the archive of past Specials) | Translate, as the food word, not "archive". |
| Chef's Choice (a random dish) | Translate as the menu phrase a diner would print. |
| Kids' Menu (the opt-in short list) | Translate as a real restaurant's kids' menu. Never "cheat", "hint" or "help". |
| Nightcap (the night's drink) | Translate as the last drink of the night. |
| coaster (a night clue) | Translate as the bar object. |
| the check / your tab | Translate as the bill. One word may serve both. |
| clue / clue ticket | Translate. The ticket is a kitchen order slip. |
| hon | The counter's term of endearment, or drop it. Never formal. |

Brand words a language keeps as-is (a spirit like "vodka", "Halloween") go in `MAY_MATCH_ENGLISH`.

## 3. The voice

A 1950s American diner, translated, not localised away: a short-order cook calling orders, a
waitress who calls you "hon", a bar that closes at three. Warm, quick, a little corny. Pick the
register a counter would use with a regular (informal you: tú, du, tu), and keep it everywhere.

- Prefer the kitchen's own idiom where one exists ("¡Marchando!" for "Order up!").
- Short beats clever. A pill or a tile label has the room of the English word plus a little.
- Neutral over regional: a word both sides of an ocean read (Spanish: "bebida" over "trago"/"copa").
- No emoji in the chrome. Share text and occasion share lines keep theirs.

## 4. Mechanics

- **Plurals through `plural("<tag>", n, { one, few, many, other })`**, the forms the language
  uses (`Intl.PluralRules`). Never `n === 1 ? … : …`. English's `n === 0` special cases are
  sentences, not plurals; keep them as such.
- **Lists through `list("<tag>", items)`** for `and`.
- **Same keys, same kinds, same arities.** A string stays a string; a function takes the same
  arguments, even if the translation ignores one. `catalog.test.ts` checks it.
- **`**bold**`** inside a message stays inside one message, where the bold word sits in the target
  sentence (InlineMarkdown renders it). Never split a sentence into fragments.
- **Never name the dish or the drink** in share text, the score card, presence or the progress
  message. The tests run over every catalog in `CATALOGS`.
- **Typography:** the language's own quotes and spacing (` ` before `%`, `:`, `?` in French).
  Join a number and its noun with ` ` wherever English does (the guess row's count).
- **Score card pills** (`scorecard.winDay`, `winNight`): seven capitals at most (78px at 14px).
- **Interpolated content stays English**: `${name}`, `${family}`, `${slug}`, countries. Build the
  sentence so an English noun reads naturally in it.
- **Dates and numbers** come from `Intl` with the page's tag; never spell a date format by hand.

## 5. Check it

```bash
npm test && npm run check && npm run lint
```

Then, with `npm run dev` running:

1. `?locale=<tag>` on `/`, `/play`, `/?handoff=1` (the check, every pill) and
   `/?bar=1&handoff=1&nightcap=negroni` (the bar and the tab). Every word on screen is the new
   language except content, the logo and After Dark.
2. Play a miss whose country tile is near with the longest region, and the longest protein, at
   320, 360, 375, 390 and 430 px. No horizontal scroll, no word past its border.
3. Add `?locale=<tag>` states to `scripts/a11y-scan.mjs` beside the Spanish ones, then
   `npm run a11y` (set `A11Y_BASE_URL` if the server took another port).
4. Tell the user which strings you were least sure of. They go to the native speaker first.

## 6. Hand-off for review

The deliverable is a draft. Say so. List the glossary choices and every line you were unsure of,
so the reviewer starts there. Only after the user reports a native speaker's read does
`autoDetect` become `true` (one line in `LOCALES`), and only then do browser and Discord settings
pick the language on their own.
