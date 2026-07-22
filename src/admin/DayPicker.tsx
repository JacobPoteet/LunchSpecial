// Admin day picker: a calendar dialog that moves the engagement panel's day
// slice off "today" and onto an earlier service. Only days that actually
// recorded activity are pickable — an empty day has nothing to show, and the
// greyed-out cells double as an at-a-glance map of when the diner was busy.

import { useMemo } from "react";
import { Modal } from "../game/components";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** Every calendar month between the first and last active day, newest first. */
function monthsSpanned(first: string, last: string): { year: number; month: number }[] {
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  const months: { year: number; month: number }[] = [];
  for (let y = fy, m = fm - 1; y < ly || (y === ly && m <= lm - 1); ) {
    months.push({ year: y, month: m });
    if (++m > 11) {
      m = 0;
      y++;
    }
  }
  return months.reverse();
}

function MonthGrid({
  year,
  month,
  active,
  selected,
  today,
  onPick,
}: {
  year: number;
  month: number;
  active: Set<string>;
  selected: string;
  today: string;
  onPick: (date: string) => void;
}) {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= daysInMonth(year, month); d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);

  return (
    <div className="daypick__month">
      <h3 className="daypick__month-name">{monthLabel(year, month)}</h3>
      <div className="daypick__grid">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="daypick__dow">
            {w}
          </span>
        ))}
        {cells.map((date, i) => {
          // Blank leading cells and quiet days both render inert; the quiet ones
          // still show their number so the month stays readable as a calendar.
          if (!date) return <span key={i} className="daypick__day daypick__day--blank" />;
          const dayNum = Number(date.slice(8));
          if (!active.has(date)) {
            return (
              <span key={i} className="daypick__day daypick__day--quiet" title={`${date} · no activity`}>
                {dayNum}
              </span>
            );
          }
          const isToday = date === today;
          const cls = [
            "daypick__day",
            "daypick__day--active",
            date === selected ? "daypick__day--selected" : "",
            isToday ? "daypick__day--today" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const label = `${date}${isToday ? " (today)" : ""} — has activity`;
          return (
            <button key={i} className={cls} onClick={() => onPick(date)} title={label} aria-label={label}>
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DayPicker({
  activeDates,
  selected,
  today,
  onPick,
  onClose,
}: {
  /** ET days with recorded activity, oldest first (from the analytics summary). */
  activeDates: string[];
  selected: string;
  today: string;
  onPick: (date: string) => void;
  onClose: () => void;
}) {
  const active = useMemo(() => new Set(activeDates), [activeDates]);
  // Always span through today, so "today" is reachable even before anyone has
  // played — it's the default the panel returns to.
  const months = useMemo(
    () => (activeDates.length === 0 ? monthsSpanned(today, today) : monthsSpanned(activeDates[0], today)),
    [activeDates, today],
  );

  return (
    <Modal onClose={onClose}>
      <h2 className="daypick__title">Pick a service</h2>
      <p className="daypick__lede">
        Only days with recorded activity can be opened. Everything else is a quiet day.
      </p>
      <div className="daypick__legend">
        <span>
          <span className="daypick__swatch daypick__swatch--active" /> has activity
        </span>
        <span>
          <span className="daypick__swatch daypick__swatch--selected" /> showing
        </span>
        <span>
          <span className="daypick__swatch daypick__swatch--quiet" /> quiet
        </span>
      </div>
      {selected !== today && (
        <button className="btn btn--ghost daypick__jump" onClick={() => onPick(today)}>
          Jump to today
        </button>
      )}
      {months.map(({ year, month }) => (
        <MonthGrid
          key={`${year}-${month}`}
          year={year}
          month={month}
          active={active}
          selected={selected}
          today={today}
          onPick={onPick}
        />
      ))}
    </Modal>
  );
}
