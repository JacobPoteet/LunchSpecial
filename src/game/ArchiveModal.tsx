// The "Leftovers": a calendar of every past Special, plus a random-recipe
// shortcut. Unlocked once today's Special is done — replay any day you missed.

import { useMemo, useState } from "react";
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

/** Fixed grid height, so paging between months doesn't resize the modal. */
const CAL_ROWS = 6;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Local-midnight, NOT `Date.UTC` — formatting is local, so a UTC-midnight
 *  date renders as the previous month anywhere west of Greenwich (July → June
 *  in ET). Build the date in the same frame it gets formatted in. */
function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** A calendar month, as a single comparable integer. */
type Month = { year: number; month: number };

function monthOf(date: string): Month {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 };
}

function monthIndex({ year, month }: Month): number {
  return year * 12 + month;
}

function shiftMonth({ year, month }: Month, delta: number): Month {
  const i = year * 12 + month + delta;
  return { year: Math.floor(i / 12), month: ((i % 12) + 12) % 12 };
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
  // Always CAL_ROWS rows, padded with blanks: a month that fits in five rows
  // would otherwise render a shorter grid and the modal would jump height as
  // you page. Six rows is the worst case (31 days starting Saturday), so the
  // padding only ever adds — no month is ever clipped.
  while (cells.length < CAL_ROWS * 7) cells.push(null);

  return (
    <div className="archive-cal__month">
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
          // Stagger by calendar ROW, not by cell: seven cells landing together
          // reads as a sheet unrolling, where 30 individual pops read as noise.
          return (
            <button
              key={i}
              className={cls}
              style={{ "--r": Math.floor(i / 7) } as React.CSSProperties}
              onClick={() => onPick(date)}
              title={label}
              aria-label={label}
            >
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

  // One month at a time, opening on the current one — the archive grows a page
  // every 30 days, and stacking them all made the modal a scroll tunnel.
  const first = useMemo(() => monthOf(EPOCH_DATE), []);
  const last = useMemo(() => monthOf(today), [today]);
  const [cursor, setCursor] = useState<Month>(last);
  const canPrev = monthIndex(cursor) > monthIndex(first);
  const canNext = monthIndex(cursor) < monthIndex(last);

  return (
    <Modal onClose={onClose}>
      <h2 className="archive-cal__title">Leftovers</h2>
      <p className="archive-cal__lede">Missed a day? Pull up an old Special and give it a shot.</p>
      <div className="archive-cal__legend">
        <span><span className="archive-cal__swatch archive-cal__swatch--won" /> solved</span>
        <span><span className="archive-cal__swatch archive-cal__swatch--lost" /> missed</span>
        <span><span className="archive-cal__swatch archive-cal__swatch--playing" /> in progress</span>
        <span><span className="archive-cal__swatch archive-cal__swatch--unplayed" /> not played</span>
      </div>
      <div className="archive-cal__nav">
        <button
          className="archive-cal__nav-btn"
          onClick={() => setCursor((c) => shiftMonth(c, -1))}
          disabled={!canPrev}
          aria-label="Previous month"
        >
          ‹
        </button>
        <h3 className="archive-cal__month-name" aria-live="polite">
          {monthLabel(cursor.year, cursor.month)}
        </h3>
        <button
          className="archive-cal__nav-btn"
          onClick={() => setCursor((c) => shiftMonth(c, 1))}
          disabled={!canNext}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      {/* Keyed by month so the cells remount and the unroll animation replays. */}
      <MonthGrid
        key={`${cursor.year}-${cursor.month}`}
        year={cursor.year}
        month={cursor.month}
        today={today}
        statusFor={statusFor}
        onPick={onPick}
      />
      <div className="chefs-choice">
        <h3 className="chefs-choice__title">Chef's Choice</h3>
        <p className="chefs-choice__note">
          Nothing on the calendar? The kitchen will pick a dish at random. Doesn't touch your
          streak or stats.
        </p>
        <button className="share-btn chefs-choice__btn" onClick={onRandom}>
          🎲 Cook me something
        </button>
      </div>
    </Modal>
  );
}
