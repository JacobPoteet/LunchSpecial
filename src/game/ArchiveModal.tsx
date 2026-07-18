// The "Menu Archive": a calendar of every past Special, plus a random-recipe
// shortcut. Unlocked once today's Special is done — replay any day you missed.

import { useMemo } from "react";
import { Modal } from "./components";
import { archiveStatuses } from "./storage";
import type { GameStatus } from "./storage";
import { isPuzzleDate, puzzleNumberFor } from "./archive";
import { EPOCH_DATE } from "../../shared/types";

/** Status of a single puzzle date, for the calendar cells. */
type DayStatus = GameStatus | "unplayed";

const STATUS_GLYPH: Record<DayStatus, string> = {
  won: "🛎️",
  lost: "✗",
  playing: "…",
  unplayed: "",
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** Every calendar month spanned by the archive, newest first. */
function monthsInRange(today: string): { year: number; month: number }[] {
  const [ey, em] = EPOCH_DATE.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  const months: { year: number; month: number }[] = [];
  for (let y = ey, m = em - 1; y < ty || (y === ty && m <= tm - 1); ) {
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
  today,
  statusFor,
  onPick,
}: {
  year: number;
  month: number;
  today: string;
  statusFor: (date: string) => DayStatus;
  onPick: (date: string) => void;
}) {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const total = daysInMonth(year, month);
  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= total; d++) cells.push(`${year}-${pad(month + 1)}-${pad(d)}`);

  return (
    <div className="archive-cal__month">
      <h3 className="archive-cal__month-name">{monthLabel(year, month)}</h3>
      <div className="archive-cal__grid">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="archive-cal__dow">
            {w}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date || !isPuzzleDate(date, today)) {
            return <span key={i} className="archive-cal__day archive-cal__day--empty" />;
          }
          const status = statusFor(date);
          const isToday = date === today;
          const dayNum = Number(date.slice(8));
          const cls = [
            "archive-cal__day",
            `archive-cal__day--${status}`,
            isToday ? "archive-cal__day--today" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const label = `Special No. ${puzzleNumberFor(date)}${isToday ? " (today)" : ""}, ${status}`;
          return (
            <button key={i} className={cls} onClick={() => onPick(date)} title={label} aria-label={label}>
              <span className="archive-cal__num">{dayNum}</span>
              <span className="archive-cal__mark" aria-hidden="true">
                {STATUS_GLYPH[status]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ArchiveModal({
  today,
  todayStatus,
  onPick,
  onRandom,
  onClose,
}: {
  today: string;
  todayStatus: DayStatus;
  onPick: (date: string) => void;
  onRandom: () => void;
  onClose: () => void;
}) {
  const statuses = useMemo(() => archiveStatuses(), []);
  const statusFor = (date: string): DayStatus =>
    date === today ? todayStatus : statuses[date] ?? "unplayed";
  const months = useMemo(() => monthsInRange(today), [today]);

  return (
    <Modal onClose={onClose}>
      <h2 className="archive-cal__title">Menu Archive</h2>
      <p className="archive-cal__lede">Missed a day? Pull up an old Special and give it a shot.</p>
      <button className="share-btn" onClick={onRandom}>
        🎲 Cook's choice — random recipe
      </button>
      <div className="archive-cal__legend">
        <span><span className="archive-cal__swatch archive-cal__swatch--won" /> solved</span>
        <span><span className="archive-cal__swatch archive-cal__swatch--lost" /> missed</span>
        <span><span className="archive-cal__swatch archive-cal__swatch--playing" /> in progress</span>
        <span><span className="archive-cal__swatch archive-cal__swatch--unplayed" /> not played</span>
      </div>
      {months.map(({ year, month }) => (
        <MonthGrid
          key={`${year}-${month}`}
          year={year}
          month={month}
          today={today}
          statusFor={statusFor}
          onPick={onPick}
        />
      ))}
    </Modal>
  );
}
