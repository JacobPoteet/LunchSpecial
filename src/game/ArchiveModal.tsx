// The "Leftovers": a calendar of every past Special, plus a random-recipe
// shortcut. Unlocked once today's Special is done — replay any day you missed.

import { useMemo, useState } from "react";
import { Modal } from "./components";
import { archiveStatuses } from "./storage";
import type { GameStatus } from "./storage";
import { isPuzzleDate, puzzleNumberFor } from "./archive";
import { EPOCH_DATE } from "../../shared/types";
import { playSfx } from "../audio";

/** Status of a single puzzle date, for the calendar cells. */
type DayStatus = GameStatus | "unplayed";

const STATUS_GLYPH: Record<DayStatus, string> = {
  won: "🛎️",
  lost: "✗",
  playing: "…",
  unplayed: "",
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Never render fewer rows than this — a two-row card reads as broken, not tidy. */
const MIN_CAL_ROWS = 3;

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

/**
 * The slice of calendar rows a month actually needs: first through last row
 * containing a playable date. Both ends matter and for different reasons — the
 * epoch month is blank at the top (the archive starts on the 17th), the current
 * month is blank at the bottom (the rest of the month hasn't happened). August
 * 2026 on launch+17 renders two useful rows; a fixed six-row grid spent 171px
 * on four rows of nothing, which is what pushed the Chef's Choice band off the
 * bottom of a phone screen. Returns null for a month with no playable dates at
 * all (unreachable via the nav, but the caller shouldn't have to assume that).
 */
function rowSpan(year: number, month: number, today: string): { start: number; end: number } | null {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const total = daysInMonth(year, month);
  let start = -1;
  let end = -1;
  for (let d = 1; d <= total; d++) {
    if (!isPuzzleDate(`${year}-${pad(month + 1)}-${pad(d)}`, today)) continue;
    const row = Math.floor((firstWeekday + d - 1) / 7);
    if (start < 0) start = row;
    end = row;
  }
  return start < 0 ? null : { start, end };
}

/**
 * Rows to reserve in the grid: the tallest month in the reachable range. The
 * modal must not resize as you page between months — that was the whole point
 * of the old hardcoded six — so every month renders into the same box. The
 * difference is that this height is earned: it's what the biggest real month
 * needs, not the worst case a Gregorian month could theoretically hit. Grows
 * on its own as the archive fills out, and by the time it reaches six, six
 * rows of dates is honest space rather than padding.
 */
function reservedRows(first: Month, last: Month, today: string): number {
  let max = MIN_CAL_ROWS;
  for (let i = monthIndex(first); i <= monthIndex(last); i++) {
    const span = rowSpan(Math.floor(i / 12), ((i % 12) + 12) % 12, today);
    if (span) max = Math.max(max, span.end - span.start + 1);
  }
  return max;
}

function MonthGrid({
  year,
  month,
  today,
  rows,
  statusFor,
  onPick,
}: {
  year: number;
  month: number;
  today: string;
  /** Rows to reserve, shared by every month so the card can't change height. */
  rows: number;
  statusFor: (date: string) => DayStatus;
  onPick: (date: string) => void;
}) {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const total = daysInMonth(year, month);
  const all: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= total; d++) all.push(`${year}-${pad(month + 1)}-${pad(d)}`);

  // Drop the leading/trailing rows that hold no playable date, then pad back up
  // to the shared reserve. Trimming first is what makes the reserve small; the
  // pad is what keeps it constant. A span can never exceed `rows` (the reserve
  // is the max over every reachable month), so nothing is ever clipped.
  const span = rowSpan(year, month, today);
  const cells = span ? all.slice(span.start * 7, (span.end + 1) * 7) : [];
  while (cells.length < rows * 7) cells.push(null);

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
              onClick={() => { playSfx("ui-click"); onPick(date); }}
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
  const rows = useMemo(() => reservedRows(first, last, today), [first, last, today]);

  // Pinned to the card's bottom edge rather than sitting at the end of the
  // scroll: on a phone this band was below the fold at every size we render at
  // (fully off-card at 320px), and an alternative you have to scroll to find
  // isn't an alternative.
  const chefsChoice = (
    <div className="chefs-choice">
      <h3 className="chefs-choice__title">Chef's Choice</h3>
      <p className="chefs-choice__note">A dish at random — won't touch your streak.</p>
      <button className="share-btn chefs-choice__btn" onClick={() => { playSfx("ui-click"); onRandom(); }}>
        🎲 Cook me something
      </button>
    </div>
  );

  return (
    <Modal onClose={onClose} variant="archive" footer={chefsChoice} label="Menu archive">
      <h2 className="archive-cal__title">Leftovers</h2>
      <p className="archive-cal__lede">Replay any Special you missed.</p>
      <div className="archive-cal__legend">
        <span><span className="archive-cal__swatch archive-cal__swatch--won" /> solved</span>
        <span><span className="archive-cal__swatch archive-cal__swatch--lost" /> missed</span>
        <span><span className="archive-cal__swatch archive-cal__swatch--playing" /> in progress</span>
        <span><span className="archive-cal__swatch archive-cal__swatch--unplayed" /> not played</span>
      </div>
      <div className="archive-cal__nav">
        <button
          className="archive-cal__nav-btn"
          onClick={() => { playSfx("option-tick"); setCursor((c) => shiftMonth(c, -1)); }}
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
          onClick={() => { playSfx("option-tick"); setCursor((c) => shiftMonth(c, 1)); }}
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
        rows={rows}
        statusFor={statusFor}
        onPick={onPick}
      />
    </Modal>
  );
}
