import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminDishRow, ScheduleEntry } from "../../shared/types";
import { addDays, daysBetween, gameToday } from "../../shared/time";
import { buildBoard, matchDishes, resolveDishName, summarizeBoard, type BoardRow } from "../../shared/schedule";
import * as api from "./api";

/** How far ◀ / ▶ move the window. Roughly a month, so two presses clear the default view. */
const PAGE_DAYS = 30;

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function monthDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "rested 84 days" / "never served", for the picker's option labels. */
function restLabel(dish: AdminDishRow, today: string): string {
  if (!dish.lastServed) return "never served";
  const days = daysBetween(dish.lastServed, today);
  return `rested ${days} day${days === 1 ? "" : "s"}`;
}

/** A message pinned to the row that caused it, or to the panel when no row did. */
interface Flash {
  date: string | null;
  ok: boolean;
  text: string;
}

/**
 * The specials board. One row per day, and every unlocked row carries the same
 * four ways to change it, because which one you reach for depends on how much
 * you already know:
 *
 * - the **picker**, when you have a dish in mind. Type any part of a name and the
 *   matches drop down under the field. Not a `<select>` per row: the catalogue is
 *   several hundred dishes and forty-odd unlocked days, so a select per row put
 *   tens of thousands of options in the DOM to let you choose one, and gave you
 *   no way to search them. Not a `<datalist>` either — see {@link Row}.
 * - **🎲**, when you don't. It rolls a dish that has never been the Special onto
 *   that day, and is meant to be pressed repeatedly until something appealing
 *   turns up. See worker/shuffle.ts for what "never" means and why consecutive
 *   clicks can't land on the dish already showing.
 * - **Clear**, when the answer is "not this one". It deletes the schedule row,
 *   which is a booking decision and not a hole: the day falls to the
 *   deterministic fallback pick and still serves a Special.
 * - **Edit**, on past rows too. Only the *booking* is locked once a day is
 *   served; the dish is still a dish, and going to the Dishes page to find one
 *   you served last week is a trip the board can save you.
 *
 * The row states what it knows about the booking — where the dish is from, what
 * course it is, and how close the nearest other serving of it sits. Autofill
 * skips a dish used inside sixty days and the shuffle only rolls dishes that
 * have never been scheduled; hand-booking is the path where you might *want* the
 * repeat, so `shared/schedule.ts` measures the gap and the row says it rather
 * than refusing the write.
 */
export default function ScheduleView({ onOpenDish }: { onOpenDish: (id: number | null) => void }) {
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null);
  const [dishes, setDishes] = useState<AdminDishRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  /** Half-typed dish names, per date. Absent means "showing what's booked". */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** The one row whose suggestion list is open. Only ever one. */
  const [openDate, setOpenDate] = useState<string | null>(null);
  /** The window to ask for. Null leaves the route's own default (today-7 → today+45). */
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const today = gameToday();

  const reload = useCallback(() => {
    api.getSchedule(range?.from, range?.to).then(
      (rows) => {
        setEntries(rows);
        setDrafts({});
        setOpenDate(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [range]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    api.getDishes().then(setDishes, () => {});
  }, []);

  const schedulable = useMemo(() => dishes.filter((d) => d.isActive && d.schedulable), [dishes]);
  const rows = useMemo(() => (entries ? buildBoard(entries, dishes, today) : []), [entries, dishes, today]);
  const summary = useMemo(() => summarizeBoard(rows), [rows]);

  const say = (date: string | null, ok: boolean, text: string) => setFlash({ date, ok, text });

  const write = async (date: string, run: () => Promise<string>) => {
    setBusyDate(date);
    setError(null);
    setFlash(null);
    try {
      say(date, true, await run());
      reload();
    } catch (e) {
      say(date, false, (e as Error).message);
    } finally {
      setBusyDate(null);
    }
  };

  const book = (date: string, dish: AdminDishRow) =>
    write(date, async () => {
      await api.setSchedule(date, dish.id);
      return `${monthDay(date)} → ${dish.name}.`;
    });

  // The roll reports the pool it drew from. That count is the only place the
  // unserved catalogue is visible, and it says when clicking again has stopped
  // paying.
  const shuffleDay = (date: string) =>
    write(date, async () => {
      const picked = await api.shuffleSchedule(date);
      return `${monthDay(date)} → ${picked.dishName}. Rolled from ${picked.remaining} dish${
        picked.remaining === 1 ? "" : "es"
      } that have never been the Special.`;
    });

  const clearDay = (date: string) =>
    write(date, async () => {
      await api.setSchedule(date, null);
      return `${monthDay(date)} cleared — it will run on the automatic fallback pick.`;
    });

  /** Drop a half-typed name, putting the field back to what the day is booked with. */
  const discardDraft = (date: string) =>
    setDrafts((d) => {
      const { [date]: _dropped, ...rest } = d;
      return rest;
    });

  /**
   * Leaving the field. A name that resolves outright is booked — typing a dish
   * in full and tabbing away should do what it looks like it does. Anything else
   * is put back, in silence: the suggestion list was open under the cursor, so a
   * half-typed name that went nowhere needs no explanation.
   */
  const commitDraft = (date: string, text: string) => {
    const typed = text.trim();
    const current = rows.find((r) => r.date === date)?.dishName ?? "";
    if (typed !== "" && typed.toLowerCase() !== current.toLowerCase()) {
      const dish = resolveDishName(typed, dishes);
      if (dish?.isActive && dish.schedulable) {
        void book(date, dish);
        return;
      }
    }
    discardDraft(date);
  };

  const autofill = async () => {
    setError(null);
    setFlash(null);
    try {
      const { filled } = await api.autofillSchedule();
      say(null, true, filled === 0 ? "Nothing to fill — the board is full." : `Filled ${filled} empty day${filled === 1 ? "" : "s"}.`);
      reload();
    } catch (e) {
      say(null, false, (e as Error).message);
    }
  };

  const testPlay = async (dishId: number) => {
    try {
      const { url } = await api.createPreview(dishId);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      say(null, false, (e as Error).message);
    }
  };

  // Shift relative to what actually came back, so the route keeps owning the
  // default window and this only ever moves away from it.
  const shift = (days: number) => {
    if (!entries || entries.length === 0) return;
    setRange({ from: addDays(entries[0].date, days), to: addDays(entries[entries.length - 1].date, days) });
  };

  const jumpTo = (date: string) => {
    document.getElementById(`sched-${date}`)?.scrollIntoView({ block: "center" });
  };

  if (error && !entries) return <p className="form-error">{error}</p>;
  if (!entries) return <p style={{ color: "var(--cream)" }}>Checking the specials board…</p>;

  const first = entries[0]?.date;
  const last = entries[entries.length - 1]?.date;

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Specials board</h2>
        <button className="btn" onClick={() => void autofill()}>
          Auto-fill next 30 days
        </button>
      </div>

      {/* The same read the Today tab's Schedule health card makes, on the page
          that acts on it — with the first gap as a button rather than a fact. */}
      <p className="sched-summary">
        <strong>{summary.bookedAhead}</strong> day{summary.bookedAhead === 1 ? "" : "s"} booked ahead
        {summary.firstGap ? (
          <>
            {" · "}
            <strong>{summary.emptyAhead}</strong> empty
            {" · first gap "}
            <button className="btn btn--link" onClick={() => jumpTo(summary.firstGap!)}>
              {monthDay(summary.firstGap)}
            </button>
          </>
        ) : (
          " · no gaps in view"
        )}
      </p>

      <div className="btn-row sched-window">
        <button className="btn btn--ghost" onClick={() => shift(-PAGE_DAYS)}>
          ◀ Earlier
        </button>
        <span className="sched-window__span">
          {first && last ? `${monthDay(first)} – ${monthDay(last)}` : "—"}
        </span>
        <button className="btn btn--ghost" onClick={() => shift(PAGE_DAYS)}>
          Later ▶
        </button>
        {range && (
          <button className="btn btn--ghost" onClick={() => setRange(null)}>
            Back to today
          </button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}
      {flash && flash.date === null && <p className={flash.ok ? "form-ok" : "form-error"}>{flash.text}</p>}

      <p className="dash-note" style={{ marginBottom: 10 }}>
        Past days are locked. Only dishes marked <span className="badge">ready</span> can be booked. 🎲 rolls a dish
        that has never been the Special; Clear hands the day back to the automatic fallback pick. Dates roll over at
        midnight Eastern Time (America/New_York).
      </p>

      <ul className="sched-list">
        {rows.map((row) => (
          <Row
            key={row.date}
            row={row}
            today={today}
            busy={busyDate === row.date}
            draft={drafts[row.date]}
            open={openDate === row.date}
            matches={
              openDate === row.date ? matchDishes(drafts[row.date] ?? row.dishName ?? "", schedulable) : []
            }
            flash={flash && flash.date === row.date ? flash : null}
            onOpen={() => setOpenDate(row.date)}
            onClose={() => setOpenDate(null)}
            onDraft={(text) => setDrafts((d) => ({ ...d, [row.date]: text }))}
            onPick={(dish) => {
              setOpenDate(null);
              void book(row.date, dish);
            }}
            onCommit={(text) => commitDraft(row.date, text)}
            onShuffle={() => void shuffleDay(row.date)}
            onClear={() => void clearDay(row.date)}
            onOpenDish={onOpenDish}
            onTestPlay={(id) => void testPlay(id)}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * The picker is a listbox this file draws, not a native `<datalist>`. A datalist
 * searches every scrap of text in an option, so listing the country beside a
 * dish meant typing a few letters matched a country and the list filled with
 * dishes whose names had nothing to do with what you typed. Drawing the list
 * means `matchDishes` decides what appears and the country stays visible without
 * being searchable.
 */
function Row({
  row,
  today,
  busy,
  draft,
  open,
  matches,
  flash,
  onOpen,
  onClose,
  onDraft,
  onPick,
  onCommit,
  onShuffle,
  onClear,
  onOpenDish,
  onTestPlay,
}: {
  row: BoardRow;
  today: string;
  busy: boolean;
  draft: string | undefined;
  open: boolean;
  matches: AdminDishRow[];
  flash: Flash | null;
  onOpen: () => void;
  onClose: () => void;
  onDraft: (text: string) => void;
  onPick: (dish: AdminDishRow) => void;
  onCommit: (text: string) => void;
  onShuffle: () => void;
  onClear: () => void;
  onOpenDish: (id: number | null) => void;
  onTestPlay: (dishId: number) => void;
}) {
  const [active, setActive] = useState(0);
  const classes = [
    "sched-row",
    row.isPast ? "sched-row--past" : "",
    row.isToday ? "sched-row--today" : "",
    row.dishId === null ? "sched-row--empty" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const value = draft ?? row.dishName ?? "";
  const index = Math.min(active, Math.max(matches.length - 1, 0));

  return (
    <>
      <li id={`sched-${row.date}`} className={classes}>
        <span className="sched-date">{weekday(row.date)}</span>

        {row.isPast ? (
          <span className="sched-dish sched-dish--locked">{row.dishName ?? "— fallback pick —"}</span>
        ) : (
          <span className="sched-picker">
            <input
              className="sched-dish"
              type="text"
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls={`sched-options-${row.date}`}
              value={value}
              disabled={busy}
              placeholder="— fallback pick —"
              aria-label={`Special for ${weekday(row.date)}`}
              // Select what's there so the first keystroke replaces the booking
              // rather than appending to it.
              onFocus={(e) => {
                setActive(0);
                onOpen();
                e.target.select();
              }}
              onChange={(e) => {
                setActive(0);
                onOpen();
                onDraft(e.target.value);
              }}
              onBlur={(e) => {
                onClose();
                onCommit(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  if (matches.length === 0) return;
                  const step = e.key === "ArrowDown" ? 1 : -1;
                  setActive((i) => (Math.min(i, matches.length - 1) + step + matches.length) % matches.length);
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (open && matches[index]) onPick(matches[index]);
                  else onCommit(e.currentTarget.value);
                  return;
                }
                if (e.key === "Escape") {
                  onClose();
                  onDraft(row.dishName ?? "");
                }
              }}
            />
            {open && matches.length > 0 && (
              <ul className="sched-options" id={`sched-options-${row.date}`} role="listbox">
                {matches.map((d, i) => (
                  <li key={d.id}>
                    {/* mousedown, not click: the input's blur would otherwise fire
                        first and put the field back before the pick lands. */}
                    <button
                      type="button"
                      className={i === index ? "sched-option sched-option--active" : "sched-option"}
                      role="option"
                      aria-selected={i === index}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onPick(d);
                      }}
                      onMouseEnter={() => setActive(i)}
                    >
                      <span className="sched-option__name">{d.name}</span>
                      <span className="sched-option__meta">
                        {d.country} · {restLabel(d, today)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </span>
        )}

        <span className="sched-meta">
          {row.dish && (
            <>
              <span className="sched-tag">{row.dish.country}</span>
              <span className="sched-tag sched-tag--course">{row.dish.course}</span>
            </>
          )}
          {row.restDays !== null && (
            <span className={row.tooSoon ? "sched-rest sched-rest--soon" : "sched-rest"}>
              {row.restSide === "before" ? "served" : "also booked"} {row.restDays} day
              {row.restDays === 1 ? "" : "s"} {row.restSide === "before" ? "earlier" : "later"}
            </span>
          )}
        </span>

        <span className="btn-row">
          {!row.isPast && (
            // Offered on an empty day too, where it is the fastest way to fill
            // the gap. Same pool either way.
            <button
              className="btn btn--ghost"
              disabled={busy}
              title="Roll a dish that has never been the Special onto this day"
              aria-label={`Shuffle ${weekday(row.date)}`}
              onClick={onShuffle}
            >
              🎲
            </button>
          )}
          {!row.isPast && row.dishId !== null && (
            <button
              className="btn btn--ghost"
              disabled={busy}
              title="Unbook this day — it runs on the automatic fallback pick"
              aria-label={`Clear ${weekday(row.date)}`}
              onClick={onClear}
            >
              Clear
            </button>
          )}
          {row.dishId !== null && (
            <>
              <button className="btn btn--ghost" onClick={() => onOpenDish(row.dishId)}>
                Edit
              </button>
              <button className="btn btn--ghost" onClick={() => onTestPlay(row.dishId!)}>
                Test ▶
              </button>
            </>
          )}
        </span>

        {/* Pinned to the row that caused it. A board is fifty rows long, and a
            confirmation at the top of the panel is offscreen from most of them. */}
        {flash && <span className={flash.ok ? "sched-flash" : "sched-flash sched-flash--bad"}>{flash.text}</span>}
      </li>
    </>
  );
}
