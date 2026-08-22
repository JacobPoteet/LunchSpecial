# Accessibility

Where Lunch Special stands, what it gets right, and what is still broken. Scoped to the **player-facing game**; `/admin` is a single-user back office behind a password and is not held to this.

Target is WCAG 2.1 AA. The game does not meet it yet. Open gaps are tracked with the [`accessibility`](../../labels/accessibility) label.

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

### Semantics in place

| Element | Treatment | Where |
|---|---|---|
| Modal | `role="dialog"`, `aria-modal="true"`, close button `aria-label` | `components.tsx:86` |
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

Three pairs do not. See [#126](../../issues/126).

---

## Known gaps

| Gap | Criterion | Issue |
|---|---|---|
| Modal has no focus trap and no <kbd>Esc</kbd> to close, despite `aria-modal` | 2.1.1, 2.4.3 | [#124](../../issues/124) |
| Hit / near / miss is carried by background colour alone | 1.4.1 | [#125](../../issues/125) |
| Two ingredient chip styles fail AA contrast (2.40:1, 4.20:1) | 1.4.3 | [#126](../../issues/126) |
| Guess results are never announced to screen readers | 4.1.3 | [#127](../../issues/127) |
| No explicit `:focus-visible` styling on buttons | 2.4.7 | [#129](../../issues/129) |

None of the above has been verified with an actual screen reader or colour-vision simulator. They were found by reading the source, so treat them as a floor rather than the full list.

---

## Conventions for new UI

Follow these and most of the above stays fixed once it is fixed.

**Never encode meaning in colour alone.** A hue can be the fast channel, but a glyph, a border style, or a hidden text node has to carry the same fact. `title` does not count: it is invisible on touch and unreliable in screen readers.

**Anything that changes after a user action needs an announcement.** The `role="status"` + `aria-live="polite"` pattern is already used in four places. Reuse it rather than inventing one.

**Do not remove a focus indicator without replacing it.** `.dish-request__input:focus` sets `outline: none` and swaps the border to `--ink`, which is a visible replacement and acceptable. Bare `outline: none` is not.

**Every animation goes in the reduced-motion block.** `game.css` keeps one list at the bottom of the file. Adding a keyframe means adding a selector there in the same commit.

**Check contrast before picking a colour**, not after. The tokens in `base.css` are the safe set; a one-off hex in a component is where the two failures came from.

**Touch and hover are different.** `:hover` never fires on touch, so any control whose only feedback is a hover state has no feedback on a phone, which is the game's main surface. The `:active` press rules exist for this.

---

## How to test

No automated accessibility checks run in CI today, which is why the list above was assembled by hand.

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
