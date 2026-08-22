// Presentational pieces of the game screen: guess rows, clue tickets,
// autocomplete input, modal shell, countdown.

import { useEffect, useMemo, useRef, useState } from "react";
import type { DishSummary, GuessFeedback, MatchLevel } from "../../shared/types";
import { MATCH_MARKS, MATCH_WORDS } from "../../shared/announce";
import { gameToday, hms, msUntilGameMidnight } from "../../shared/time";
import { playSfx, setMuffled } from "../audio";

// Strip diacritics so accented dish names (Crème Brûlée) are searchable from an
// English keyboard ("creme brulee"). NFD splits a letter from its combining
// accent, then we drop the accent marks.
function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// How long the modal's slide-down exit runs — keep in sync with the
// `modal-out` / `backdrop-out` keyframe durations in game.css.
const MODAL_EXIT_MS = 220;

// Everything the browser will hand a Tab to, in document order. Used to find
// the two ends of the loop the dialog keeps focus inside; `[tabindex="-1"]` is
// excluded because that's the card itself, which is a focus *target* on open
// but never a stop on the way round.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  onClose,
  label,
  variant,
  footer,
  children,
}: {
  onClose?: () => void;
  /**
   * The dialog's accessible name. `role="dialog"` with nothing to call it is
   * announced as an unnamed group, which is most of the way to not announcing
   * it at all — and the card's own heading isn't always the first thing in it.
   */
  label?: string;
  /**
   * Cosmetic skin only — the three-zone layout comes from `footer`. `notice`
   * also swaps the enter/exit animation (it swings down from the top instead of
   * sliding up), so an announcement never reads as the check.
   */
  variant?: "receipt" | "archive" | "notice";
  /**
   * Actions pinned to the bottom edge of the card. When present the body
   * becomes its own scroll container, so a long body can never push the
   * buttons off a phone screen. Modals without a footer keep the old shape
   * (the card itself scrolls).
   */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Slides up from the bottom on mount, and the sound matches the motion: the
  // check prints rather than sliding, and a notice drops in from *above* and
  // bounces. That opposition is how a player tells the three apart at a glance
  // (see the notice variant's note in CLAUDE.md), so the audio has to agree
  // with it or it argues with the picture.
  //
  // The bed is low-passed for as long as any card is open — the music carries
  // on in the next room. Unmuffling is the cleanup, so a modal torn down
  // without its exit animation (a mode switch, a tab restore) still puts the
  // music back.
  useEffect(() => {
    playSfx(variant === "receipt" ? "receipt-print" : variant === "notice" ? "notice-drop" : "modal-open");
    setMuffled(true);
    return () => setMuffled(false);
  }, [variant]);

  // Play the exit animation, then actually unmount. With reduced motion (or if
  // there's nothing to close to) we skip straight to unmounting so nothing gets
  // stuck open waiting on an animation that never runs.
  const requestClose = () => {
    if (!onClose || closing) return;
    playSfx("modal-close");
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
  };

  useEffect(() => {
    if (!closing) return;
    // Fallback in case animationend doesn't fire (e.g. tab backgrounded).
    const t = setTimeout(() => onClose?.(), MODAL_EXIT_MS + 80);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  // The keyboard half of `aria-modal="true"`. That attribute tells a screen
  // reader the rest of the page is inert; without the two effects below it was
  // an assertion the implementation didn't keep — Tab walked straight out into
  // the board behind, and the check, which opens itself at game over, couldn't
  // be dismissed from the keyboard at all.
  //
  // Held in a ref rather than the dependency list so the listener is bound once
  // per open: `requestClose` is rebuilt every render, and re-subscribing on each
  // one is noise on the one path that has to be reliable.
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  useEffect(() => {
    // Whatever opened this — restored on unmount so a keyboard user lands back
    // on the button they pressed rather than at the top of the document. The
    // auto-opened check has no opener, in which case this is <body> and putting
    // focus back is a no-op.
    const opener = document.activeElement as HTMLElement | null;
    // The card, not the close button: a dialog that steals focus onto its own
    // dismiss control reads as "you probably want to leave".
    cardRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const card = cardRef.current;
      if (!card) return;
      if (e.key === "Escape") {
        // GuessInput's own Escape (which closes the autocomplete) stops
        // propagating while its list is open, so the list closes first and the
        // dialog second — never both on one press.
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const stops = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (stops.length === 0) {
        // Nothing to land on: keep the ring inside the card rather than letting
        // it escape to the page underneath.
        e.preventDefault();
        card.focus();
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === card)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className={closing ? "modal-backdrop modal-backdrop--closing" : "modal-backdrop"}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={cardRef}
        className={
          "modal" +
          (footer ? " modal--paneled" : "") +
          (variant ? ` modal--${variant}` : "") +
          (closing ? " modal--closing" : "")
        }
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose?.();
        }}
      >
        {onClose && (
          <button className="modal__close" onClick={requestClose} aria-label="Close">
            ×
          </button>
        )}
        {footer ? (
          <>
            <div className="modal__scroll">{children}</div>
            <div className="modal__footer">{footer}</div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// `index` only drives the reveal stagger (--i). The `--revealed` class is what
// the flip animation hangs off: it marks a tile carrying real feedback, so the
// placeholder tiles of the optimistic row can't cascade too.
function AttrTile({
  label,
  value,
  match,
  index,
}: {
  label: string;
  value: string;
  match: MatchLevel;
  index: number;
}) {
  return (
    <div
      className={`attr-tile attr-tile--revealed attr-tile--${match}`}
      style={{ "--i": index } as React.CSSProperties}
      title={`${label}: ${value} (${match})`}
    >
      {/* Hit / near / miss used to be background colour and nothing else, which
          left a player who can't separate the green from the mustard with no
          way to read a guess at all (WCAG 1.4.1) — the tile's text is the
          *value*, never the verdict. Two redundant channels, from one table in
          shared/announce.ts: a glyph for the eye, a hidden word for the
          screen reader. `title` is neither — it never appears on touch. */}
      <span className="attr-tile__label">
        <span className="attr-tile__mark" aria-hidden="true">
          {MATCH_MARKS[match]}
        </span>
        <span className="attr-tile__label-text">{label}</span>
      </span>
      <span className="attr-tile__value">{value}</span>
      <span className="sr-only">{MATCH_WORDS[match]}</span>
    </div>
  );
}

const ATTR_LABELS = ["Country", "Course", "Served", "Protein"];

export function GuessRow({
  guess,
  dish,
  ingredientCount,
}: {
  guess?: GuessFeedback;
  dish?: DishSummary;
  ingredientCount: number;
}) {
  // Optimistic "pending" row: the order's been fired to the kitchen but the
  // feedback hasn't come back yet. It drops in immediately (so the animation
  // never waits on the network) showing just the dish name and placeholder
  // tiles; when the feedback lands the parent swaps in the filled `guess` on
  // the SAME element, so the drop-in doesn't replay.
  if (!guess) {
    return (
      <div className="guess-row guess-row--pending">
        <p className="guess-row__name">
          <span className="guess-row__dish">{dish?.name}</span>
          <span className="leader" aria-hidden="true" />
          <span className="guess-row__count">asking the kitchen…</span>
        </p>
        <div className="attr-tiles">
          {ATTR_LABELS.map((label) => (
            <div key={label} className="attr-tile attr-tile--pending">
              <span className="attr-tile__label">{label}</span>
              <span className="attr-tile__value">·&nbsp;·&nbsp;·</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const a = guess.attributes;
  return (
    <div className={guess.correct ? "guess-row guess-row--correct" : "guess-row"}>
      <p className="guess-row__name">
        <span className="guess-row__dish">
          {guess.correct ? "🛎️ " : ""}
          {guess.dish.name}
        </span>
        <span className="leader" aria-hidden="true" />
        <span className="guess-row__count">
          {guess.matchedIngredients.length}/{ingredientCount} ingredients
        </span>
      </p>
      <div className="attr-tiles">
        <AttrTile label="Country" value={a.country.value} match={a.country.match} index={0} />
        <AttrTile label="Course" value={a.course.value} match={a.course.match} index={1} />
        <AttrTile label="Served" value={a.temperature.value} match={a.temperature.match} index={2} />
        <AttrTile label="Protein" value={a.protein.value} match={a.protein.match} index={3} />
      </div>
      {/* Matched chips pop first, then the misses — one continuous stagger
          across both lists, so `--i` counts through matched and keeps going. */}
      <div className="chips">
        {guess.matchedIngredients.map((ing, i) => (
          <span key={ing} className="chip chip--match" style={{ "--i": i } as React.CSSProperties}>
            ✓ {ing}
          </span>
        ))}
        {guess.unmatchedIngredients.map((ing, i) => (
          <span
            key={ing}
            className="chip chip--matchless"
            style={{ "--i": guess.matchedIngredients.length + i } as React.CSSProperties}
          >
            {ing}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ClueTicket({ index, text }: { index: number; text: string }) {
  return (
    <div className="ticket">
      <p className="ticket__head">Order up — clue #{index}</p>
      <p className="ticket__text">{text}</p>
    </div>
  );
}

export function GuessInput({
  dishes,
  excludeIds,
  disabled,
  onGuess,
}: {
  dishes: DishSummary[];
  excludeIds: Set<number>;
  disabled: boolean;
  onGuess: (dish: DishSummary) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Only pull focus back on desktop (mouse + hover). On touch, auto-focusing
  // would pop the on-screen keyboard up after every guess.
  const interacted = useRef(false);

  const options = useMemo(() => {
    const q = foldAccents(text.trim().toLowerCase());
    if (!q) return [];
    return dishes
      .filter((d) => !excludeIds.has(d.id) && foldAccents(d.name.toLowerCase()).includes(q))
      .slice(0, 8);
  }, [text, dishes, excludeIds]);

  useEffect(() => {
    setHighlight(0);
  }, [text]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Submitting a guess flips `disabled` on (parent goes busy) then off again,
  // which drops the input's focus. On desktop, put the cursor back so you can
  // keep typing your next order without re-clicking the bar.
  useEffect(() => {
    if (disabled || !interacted.current) return;
    if (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  const pick = (dish: DishSummary) => {
    setText("");
    setOpen(false);
    interacted.current = true;
    onGuess(dish);
  };

  return (
    <div className="guess-input" ref={rootRef}>
      <div className="guess-input__row">
        <input
          ref={inputRef}
          type="text"
          value={text}
          disabled={disabled}
          placeholder="Order a dish… (type to search)"
          aria-label="Guess a dish"
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            // The tick is on the arrow keys and deliberately not on
            // `onMouseEnter` below: hovering the list fires that on every
            // mouse move across it, which is a stream of clicks nobody asked
            // for. Keyboard navigation is discrete, so it can be sounded.
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const next =
                e.key === "ArrowDown"
                  ? Math.min(highlight + 1, options.length - 1)
                  : Math.max(highlight - 1, 0);
              // Computed out here rather than inside the updater: a state
              // updater must stay pure, and StrictMode runs it twice in dev —
              // which would double every tick. Silent at the ends of the list,
              // where nothing actually moved.
              if (next !== highlight) playSfx("option-tick");
              setHighlight(next);
            } else if (e.key === "Enter" && options[highlight]) {
              e.preventDefault();
              pick(options[highlight]);
            } else if (e.key === "Escape") {
              // Swallowed only while there's a list to close. Inside a dialog
              // the two Escape handlers would otherwise both fire on one press
              // — the list should close first, the dialog second.
              if (open && text.trim()) e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        <button
          className="guess-input__submit"
          disabled={disabled || options.length === 0}
          onClick={() => options[highlight] && pick(options[highlight])}
        >
          Order
        </button>
      </div>
      {open && text.trim() && (
        <ul className="guess-input__list" role="listbox">
          {options.length === 0 && <li className="guess-input__empty">Not on the menu — try another dish</li>}
          {options.map((d, i) => (
            <li
              key={d.id}
              className="guess-input__option"
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(d)}
            >
              {d.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * True once the game date has rolled past `mountedToday` — i.e. midnight ET
 * arrived while this tab sat open.
 *
 * The page resolves "today" once at mount and keys the round, the board and
 * localStorage off it, so a tab left open overnight keeps serving yesterday's
 * Special while the countdown quietly restarts at 23:59:59. Nothing is broken,
 * but the player has no way to tell — hence a banner rather than a silent swap
 * (yanking the board out from under an unfinished round would be worse).
 *
 * Two triggers, because neither alone is enough: a timer aimed at the next ET
 * midnight catches a tab that's genuinely sat open and visible, and a
 * visibility/focus check catches the far more common case of a backgrounded tab
 * whose timers the browser throttled or froze overnight.
 */
export function useNewDayAvailable(mountedToday: string): boolean {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (stale) return;
    let timer = 0;

    const rolledOver = () => gameToday() !== mountedToday;
    const check = () => {
      if (!rolledOver()) return false;
      setStale(true);
      window.clearTimeout(timer);
      return true;
    };
    // +1s of slack so we land *after* the boundary, never a tick short of it;
    // if we somehow wake early, re-arm rather than reporting a new day that
    // hasn't started yet.
    const arm = () => {
      timer = window.setTimeout(() => {
        if (!check()) arm();
      }, msUntilGameMidnight() + 1000);
    };
    arm();

    const onWake = () => check();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [mountedToday, stale]);

  return stale;
}

export function Countdown({ compact }: { compact?: boolean }) {
  const [ms, setMs] = useState(() => msUntilGameMidnight());
  useEffect(() => {
    const t = setInterval(() => setMs(msUntilGameMidnight()), 1000);
    return () => clearInterval(t);
  }, []);
  const { h, m, s } = hms(ms);
  // Keying the seconds on their own value remounts just that span every tick,
  // which is what re-runs the CSS pulse — a clock that visibly moves reads as
  // live rather than as a static string that happens to change.
  const secs = (
    <span className="countdown__sec" key={s}>
      {s}
    </span>
  );
  // Compact stacks the label over the clock so it can sit beside the share
  // button in the check's action bar instead of eating its own full-width line.
  if (compact) {
    return (
      <div className="countdown countdown--compact">
        <span className="countdown__label">Next Special</span>
        <strong className="countdown__time">
          {h}:{m}:{secs}
        </strong>
      </div>
    );
  }
  return (
    <p className="countdown">
      Next Special in{" "}
      <strong>
        {h}:{m}:{secs}
      </strong>
    </p>
  );
}
