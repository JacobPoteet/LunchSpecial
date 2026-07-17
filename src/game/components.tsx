// Presentational pieces of the game screen: guess rows, clue tickets,
// autocomplete input, modal shell, countdown.

import { useEffect, useMemo, useRef, useState } from "react";
import type { DishSummary, GuessFeedback, MatchLevel } from "../../shared/types";

export function Modal({
  onClose,
  receipt,
  children,
}: {
  onClose?: () => void;
  receipt?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={receipt ? "modal modal--receipt" : "modal"} role="dialog" aria-modal="true">
        {onClose && (
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

function AttrTile({ label, value, match }: { label: string; value: string; match: MatchLevel }) {
  return (
    <div className={`attr-tile attr-tile--${match}`} title={`${label}: ${value} (${match})`}>
      <span className="attr-tile__label">{label}</span>
      <span className="attr-tile__value">{value}</span>
    </div>
  );
}

export function GuessRow({ guess, ingredientCount }: { guess: GuessFeedback; ingredientCount: number }) {
  const a = guess.attributes;
  return (
    <div className={guess.correct ? "guess-row guess-row--correct" : "guess-row"}>
      <p className="guess-row__name">
        {guess.correct ? "🛎️ " : ""}
        {guess.dish.name}
        <span className="guess-row__count">
          {guess.matchedIngredients.length}/{ingredientCount} ingredients
        </span>
      </p>
      <div className="attr-tiles">
        <AttrTile label="Country" value={a.country.value} match={a.country.match} />
        <AttrTile label="Course" value={a.course.value} match={a.course.match} />
        <AttrTile label="Served" value={a.temperature.value} match={a.temperature.match} />
        <AttrTile label="Protein" value={a.protein.value} match={a.protein.match} />
      </div>
      <div className="chips">
        {guess.matchedIngredients.map((ing) => (
          <span key={ing} className="chip chip--match">
            ✓ {ing}
          </span>
        ))}
        {guess.unmatchedIngredients.map((ing) => (
          <span key={ing} className="chip chip--matchless">
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

  const options = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return dishes.filter((d) => !excludeIds.has(d.id) && d.name.toLowerCase().includes(q)).slice(0, 8);
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

  const pick = (dish: DishSummary) => {
    setText("");
    setOpen(false);
    onGuess(dish);
  };

  return (
    <div className="guess-input" ref={rootRef}>
      <div className="guess-input__row">
        <input
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
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && options[highlight]) {
              e.preventDefault();
              pick(options[highlight]);
            } else if (e.key === "Escape") {
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

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function Countdown() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const ms = midnight.getTime() - now.getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return (
    <p className="countdown">
      Next Special in{" "}
      <strong>
        {pad(h)}:{pad(m)}:{pad(s)}
      </strong>
    </p>
  );
}
