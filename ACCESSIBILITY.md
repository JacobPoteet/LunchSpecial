# Accessibility

Where Lunch Special stands, what it gets right, and what is still broken. Scoped to the **player-facing game**; `/admin` is a single-user back office behind a password and is not held to this.

Target is WCAG 2.1 AA. Open gaps are tracked with the [`accessibility`](../../labels/accessibility) label.

---

## What works today

### Reduced motion

The strongest area, and the one to protect when adding UI. `@media (prefers-reduced-motion: reduce)` in `src/styles/game.css` disables roughly forty animations, and one more place checks it in JavaScript:

- `Modal.requestClose()` skips the exit animation and unmounts immediately, because a disabled animation never fires `animationend`.

> **`playSfx()` used to check it too, and deliberately no longer does.** It was the *only* thing gating audio, which was wrong in both directions: it silenced people who had asked about motion, and left everyone else with no way to turn sound off at all. Reduced motion is a statement about vestibular comfort, not about volume. Sound is now governed by an explicit control — see [Sound](#sound) below.

Two things survive on purpose. Presses keep their colour change on `:active`, since that is the only confirmation a tap registered, and only the movement stops. The clue accordion still opens, it just snaps.

> `src/styles/admin.css` has no reduced-motion block and does not need one. It declares no animations at all.

### Sound

No audio ships yet — the files are being licensed — but the system is in place and the accessibility surface it needs is already built.

**There is one mute control**, in the menu card's toolbar (`SoundToggle`). It carries an `aria-label` that flips between "Mute sound" and "Unmute sound", plus `aria-pressed`, so its state is available without seeing the icon. The icon itself is a line-drawn speaker whose two states differ in **shape**, not just colour — waves versus a cross — so it is not carried by colour alone, unlike the hit/near/miss gap in #125.

**This is a WCAG requirement, not a courtesy.** SC 1.4.2 (Audio Control, Level A) says that any audio playing automatically for more than three seconds must have a mechanism to pause or stop it. The ambient bed does exactly that inside the Discord Activity, where it is on by default, so the toggle is what keeps that surface conformant. If the bed is ever switched on for the web too, this control is what makes that allowed.

The button hides itself when the build contains no audio files, so it never appears as a control that does nothing.

Two things to hold when sound lands:

- **Nothing may depend on hearing it.** Every sound marks something that is also visible — a row landing, a ticket printing, a modal opening. None of them carries information on its own.
- **The mute state is per-device and persists**, so a player never has to turn it off twice.

### Keyboard, in the guess flow

Type, <kbd>↓</kbd>/<kbd>↑</kbd> to move the autocomplete highlight, <kbd>Enter</kbd> to guess, <kbd>Esc</kbd> to dismiss the list. The Order button submits whatever is highlighted.

Focus returns to the input after a guess on desktop only, gated behind `(hover: hover) and (pointer: fine)`, because refocusing on touch pops the on-screen keyboard after every guess.

### Keyboard, in the modals

All of it lives in the one `Modal` in `components.tsx`, so every card — how-to, stats, archive, the check, notices — behaves the same way:

- **<kbd>Esc</kbd> closes**, through `requestClose()` rather than `onClose`, so the exit animation and the reduced-motion path both still apply.
- **Focus moves into the card on open** (the card itself, not its × — a dialog that opens with its dismiss control focused reads as a suggestion to leave) and **returns to whatever opened it on close**.
- **<kbd>Tab</kbd> is trapped** between the first and last focusable descendants. This is what `aria-modal="true"` was already claiming; before it, Tab walked straight out into the board behind the card.
- Each modal passes a `label`, so `role="dialog"` has a name to announce.

`GuessInput`'s own <kbd>Esc</kbd> stops propagating while its autocomplete list is open, so one press closes the list and never also the dialog around it.

### Focus indicators

`:focus-visible` is declared once, near the press-feedback block at the bottom of `game.css`, over every keyboard stop on the player-facing side — the toolbar, the share and replay buttons, the modal ×, the calendar cells and its month nav, the clue accordion, the mute button, the suggest-a-dish controls, the notice's OK, and the footer links. 3px mustard, offset 2px; the calendar's cells tuck the ring inside instead, since they sit 4px apart in a grid.

`:focus-visible` and not `:focus`, so a mouse click doesn't leave a ring behind. Mustard because `.guess-input input:focus` has used exactly that treatment since it was written, and it reads against cream paper, deep teal and cherry alike — the user-agent default does not. Declaring it also means a future `outline: none` has something left behind it, which was the second-order problem: while nothing declared a focus style, removing the UA ring removed the only indicator there was.

### Semantics in place

| Element | Treatment | Where |
|---|---|---|
| Modal | `role="dialog"` + `aria-label`, `aria-modal="true"`, focus trap, <kbd>Esc</kbd>, close button `aria-label` | `components.tsx` |
| Guess + clue announcements | Two hidden `role="status"` regions | `GamePage.tsx` |
| Attribute tile | `.attr-tile__mark` glyph + an `.sr-only` verdict | `components.tsx` |
| Win toast | `role="status"`, `aria-live="polite"` | `GamePage.tsx:97` |
| New-day banner | `role="status"`, `aria-live="polite"` | `GamePage.tsx:954` |
| Discord counter bar | `role="status"`, `aria-live="polite"` | `GamePage.tsx:977` |
| Load failure | `role="alert"` | `GamePage.tsx:331` |
| Autocomplete | `role="listbox"` / `role="option"` / `aria-selected` | `components.tsx:323` |
| Guess input | `aria-label="Guess a dish"` | `components.tsx:291` |
| Clue accordion | `aria-expanded` + `aria-controls` | `GamePage.tsx:184` |
| Archive calendar | Per-day `aria-label`, month `aria-live`, labelled nav | `ArchiveModal.tsx:163` |
| Decorative art | `alt=""` + `aria-hidden` on the cloche, leaders, bell | `GamePage.tsx:1009` |

### Document level

`<html lang="en">`, a viewport tag that does **not** set `user-scalable=no` or a `maximum-scale`, so pinch zoom works, and `viewport-fit=cover` to keep content clear of the notch.

`-webkit-text-size-adjust: 100%` in `base.css` stops Android Chrome font-boosting from inflating the guess column around the fourth guess. It does not affect user zoom.

### Colour contrast, measured

Most of the palette is comfortable:

| Pair | Ratio |
|---|---|
| `--ink` on `--paper` (body) | 14.02 |
| `--cream` on `--teal-dark` | 11.00 |
| `--cream` on `--teal` | 7.97 |
| `--ink-soft` on `--paper` | 7.22 |
| `--ink` on `--near` (tile) | 7.24 |
| `--ink-soft` on `--miss-soft` (tile) | 6.44 |
| `#fff` on `--hit` (tile) | 5.05 |

Two pairs did not, and one sat 0.09 under. All three are fixed, through two tokens in `base.css` rather than one-off hexes in a component — which is where both failures came from in the first place:

| Token | Where it prints | Was | Now |
|---|---|---|---|
| `--hit-ink` `#276843` | `--hit` on `--hit-soft`: `.chip--match`, `.archive-cal__day--won` | 4.20 | 5.56 |
| `--on-cherry` `#fdf8ee` | `--cream` on `--cherry`: the Order button, the primary share button, `.error-note`, the new-day button, the winning distribution bar, the notice's OK | 4.41 | 4.85 |

`.chip--matchless` — the more common chip, since most ingredients in most guesses miss — took `--miss` off the text and put it on the border, so the chip still *looks* muted while the ingredient name reads at 7.22 instead of 2.40. `.closed__detail` had the same pair and took the same fix.

---

<a id="guess-feedback"></a>

### Guess feedback

The result of a guess is the most important dynamic content on the page, and it used to be carried entirely by background colour and announced not at all. It now travels on three channels, off one table in `shared/announce.ts` so they cannot drift apart:

| Channel | What it is |
|---|---|
| Colour | `.attr-tile--hit`, `--near`, `--miss`, as before |
| Glyph | `✓` / `~` / `×` beside the tile's label, `aria-hidden` — a redundant channel, not a second reading |
| Words | An `.sr-only` verdict inside each tile, so it reads "Country, Italy, close" |

Plus two hidden `role="status"` regions on the page, written when feedback lands:

> Guess 3 of 6: Boeuf Bourguignon. 2 of 6 ingredients match. country close, course match, served match, protein no match. 3 guesses left.

and, about a second later, the clue. **Two regions rather than one**, because the ticket is deliberately staggered ~1.14s behind the row (`--ticket-start` in `game.css`, `TICKET_MS` in `shared/audio.ts`) and a single region written twice in quick succession drops the first message. Putting `aria-live` on `.guesses` itself was the other option, and would announce the whole row — four tiles and every chip — in a DOM order that is not a sentence.

The wording is a pure fold with unit tests, like every other fold in `shared/`. It never names the target dish, for the same reason the board doesn't.

---

## Known gaps

Nothing tracked right now. That is not the same as nothing left: none of the above has been verified with an actual screen reader or a colour-vision simulator, and the automated pass in CI only covers the third of WCAG a tool can see. Treat this as a floor rather than a clean bill of health.

---

## Conventions for new UI

Follow these and most of the above stays fixed once it is fixed.

**Never encode meaning in colour alone.** A hue can be the fast channel, but a glyph, a border style, or a hidden text node has to carry the same fact. `title` does not count: it is invisible on touch and unreliable in screen readers. The attribute tiles are the worked example — see [Guess feedback](#guess-feedback).

**Anything that changes after a user action needs an announcement.** The `role="status"` + `aria-live="polite"` pattern is already used in four places. Reuse it rather than inventing one.

**Do not remove a focus indicator without replacing it.** `.dish-request__input:focus` sets `outline: none` and swaps the border to `--ink`, which is a visible replacement and acceptable. Bare `outline: none` is not.

**Every animation goes in the reduced-motion block.** `game.css` keeps one list at the bottom of the file. Adding a keyframe means adding a selector there in the same commit.

**Check contrast before picking a colour**, not after. The tokens in `base.css` are the safe set; a one-off hex in a component is where the two failures came from.

**Touch and hover are different.** `:hover` never fires on touch, so any control whose only feedback is a hover state has no feedback on a phone, which is the game's main surface. The `:active` press rules exist for this.

---

## How to test

### Automated

`ci.yml`'s **a11y** job runs axe-core over the running game on every push and PR, and fails on `serious` and `critical` findings. Locally, with the dev server up in another terminal:

```bash
npm run a11y
```

It **plays a round before scanning**, which is the point: the guess column, the attribute tiles and the ingredient chips don't exist on a bare page load, so a scan of an empty board is a scan that passes because there's nothing on it. Five states get measured, at a 390px viewport: the how-to modal a first-timer lands in, the empty board, a board mid-round, the check, and the archive calendar. `scripts/a11y-scan.mjs` says why each one is there.

It asks the browser for `prefers-reduced-motion: reduce`. That's not incidental — axe samples the pixels actually painted, so a card caught mid-entrance reports the colour of a half-faded element, and cherry at 60% opacity over cream is a real 3.4:1 and a useless finding. It doubles as a check that the reduced-motion path renders what everyone else eventually sees.

**Automated checks catch roughly a third of WCAG**, so this is a floor. Of the five issues that produced this document, axe would have caught one outright (the contrast) and part of a second; the live region, the colour-only encoding and the missing focus trap it cannot see. It found two contrast failures a careful hand pass had missed, both because they only exist once composited — a 0.85 opacity on a tile label, and a `rgba()` footer over teal.

### By hand

```bash
npm run dev
```

Then, at minimum:

1. **Keyboard only.** Unplug the mouse. Play a full round, open each of the four modals, and try to close them.
2. **Reduced motion.** DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`. Play a round and confirm nothing moves and nothing gets stuck.
3. **375px, then 320px.** No horizontal scroll on any surface, including the check, which is the tallest.
4. **Zoom to 200%.** Text should reflow, not clip.

Worth adding, and not yet done: `@axe-core/cli` or Lighthouse against a running dev server, wired into `ci.yml`. It would have caught the two contrast failures without anyone measuring by hand.

---

## Not covered here

- `/admin`, a password-gated single-user tool.
- The Discord Activity's own chrome, which Discord owns. The game inside the iframe follows this document, including the picture-in-picture layout.
- The static `/privacy`, `/terms`, and `/press` pages in `public/`.
