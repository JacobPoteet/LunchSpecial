// The footer's language picker, beside the build marker.
//
// A hand-drawn listbox, never a <select>: the native one draws the platform's
// own sheet, which on a phone covers the board and can't wear the diner's
// paper. Each language is printed in its own words ("Español", not "Spanish")
// and carries its own `lang`, so a screen reader says it in that voice and a
// player who can't read the page they landed on can still find their way out.
//
// A pick is stored (`setLocale`) and the page switches at once, no reload.
// Every shipped locale is listed, reviewed or not: a draft is picker-only
// (shared/locale.ts), so this is how a player reaches it.

import { useEffect, useId, useRef, useState } from "react";
import { LOCALES, type LocaleTag } from "../../shared/locale";
import { setLocale, useLocale } from "../i18n/store";
import { playSfx } from "../audio";
import { Icon } from "./Icon";

export function LanguagePicker() {
  const { speaking, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [said, setSaid] = useState<{ tag: LocaleTag; name: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const current = LOCALES.find((l) => l.tag === speaking);
  const currentIndex = Math.max(
    0,
    LOCALES.findIndex((l) => l.tag === speaking),
  );

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const show = () => {
    setActive(currentIndex);
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const choose = (index: number) => {
    const pick = LOCALES[index];
    close(true);
    if (pick.tag === speaking) return;
    playSfx("ui-click");
    setSaid({ tag: pick.tag, name: pick.name });
    void setLocale(pick.tag);
  };

  return (
    <div className="lang-picker" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="lang-picker__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t.language.button(current?.name ?? speaking)}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        <Icon name="globe" />
        <span lang={current?.tag}>{current?.name ?? speaking}</span>
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          className="lang-picker__list"
          role="listbox"
          tabIndex={-1}
          aria-label={t.language.list}
          aria-activedescendant={`${listId}-${LOCALES[active].tag}`}
          onKeyDown={(e) => {
            const last = LOCALES.length - 1;
            const move = (next: number) => {
              e.preventDefault();
              if (next !== active) playSfx("option-tick");
              setActive(next);
            };
            if (e.key === "ArrowDown") move(Math.min(active + 1, last));
            else if (e.key === "ArrowUp") move(Math.max(active - 1, 0));
            else if (e.key === "Home") move(0);
            else if (e.key === "End") move(last);
            else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              choose(active);
            } else if (e.key === "Escape") {
              // Only the list closes; a dialog behind it keeps its own Escape.
              e.stopPropagation();
              close(true);
            } else if (e.key === "Tab") close(false);
          }}
        >
          {LOCALES.map((l, i) => (
            <li
              key={l.tag}
              id={`${listId}-${l.tag}`}
              lang={l.tag}
              role="option"
              aria-selected={l.tag === speaking}
              className={i === active ? "lang-picker__option lang-picker__option--active" : "lang-picker__option"}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <span className="lang-picker__check" aria-hidden="true">
                {l.tag === speaking ? "✓" : ""}
              </span>
              {l.name}
            </li>
          ))}
        </ul>
      )}
      {/* The new language's name, in its own voice, once the page has switched. */}
      <span className="sr-only" role="status" aria-live="polite" lang={said?.tag}>
        {said && said.tag === speaking ? said.name : ""}
      </span>
    </div>
  );
}
