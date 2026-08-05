import { useState } from "react";
import type { AnalyticsSummary } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";
import DayPicker from "./DayPicker";
import {
  GuessBars,
  PlayersRow,
  RatesRow,
  StartedByKindRow,
  avgGuesses,
  difficultyNote,
  noRoundsNote,
  shortDate,
  sumKinds,
  type SurfaceFilter,
} from "./analyticsUi";

/**
 * The "how did players do" tab: one service in detail (today by default, or any
 * earlier day the calendar offers), then the same shape for all time. The
 * time-series charts live in Trends; the raw beacons live in Activity.
 */
export default function PlayersPanel({
  data,
  error,
  surface,
  date,
  onPickDate,
}: {
  data: AnalyticsSummary | null;
  error: string | null;
  surface: SurfaceFilter;
  /** null = follow today (so the panel keeps tracking the midnight-ET rollover). */
  date: string | null;
  onPickDate: (date: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);

  if (error) {
    return (
      <section className="panel">
        <h2>Players</h2>
        <p className="dash-note">Couldn't load analytics: {error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="panel">
        <h2>Players</h2>
        <p className="dash-note">Counting the receipts…</p>
      </section>
    );
  }

  const { totals, startedByKind, guessDistribution, fails, day, today, activeDates, playerTrackingStart } =
    data;
  // The server settles what day we're actually looking at, so trust `day.date`
  // over the requested one (a future/garbage date falls back to today).
  const isToday = day.date === today;

  if (totals.started === 0) {
    return (
      <section className="panel">
        <h2>Players</h2>
        <p className="dash-note">
          {noRoundsNote(surface)}
          {date !== null && (
            <>
              {" "}
              <button className="link-btn" onClick={() => onPickDate(null)}>
                Back to today
              </button>
            </>
          )}
        </p>
      </section>
    );
  }

  const allTimeAvg = avgGuesses(guessDistribution);
  const dayAvg = avgGuesses(day.guessDistribution);
  // How this day's Special played against the average, worded once in
  // analyticsUi so the Overview's copy of this read can't drift from it.
  const difficulty = difficultyNote(day.guessDistribution, guessDistribution, isToday);

  // Any game started that day (across all three kinds), vs. its Special alone.
  const dayStartedAny = sumKinds(day.startedByKind);

  return (
    <>
      {/* Day slice. Defaults to today; the calendar swaps in an earlier service
          (only days that recorded activity are offered). */}
      <section className="panel">
        <div className="analytics-head">
          <h2>
            {isToday ? "Today's Special" : "The Special"} · {day.dishName ?? day.date}
            {day.dishName && ` · ${day.date}`}
          </h2>
          <div className="analytics-head__tools">
            <button className="btn btn--ghost btn--small" onClick={() => setPicking(true)}>
              📅 {isToday ? "Today" : day.date}
            </button>
            {!isToday && (
              <button className="link-btn" onClick={() => onPickDate(null)}>
                Back to today
              </button>
            )}
          </div>
        </div>
        {picking && (
          <DayPicker
            activeDates={activeDates}
            selected={day.date}
            today={today}
            onPick={(d) => {
              onPickDate(d === today ? null : d);
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}
        {dayStartedAny === 0 ? (
          <p className="dash-note">
            {isToday
              ? "No plays recorded for today yet — check back once the diner fills up."
              : `Nobody played on ${day.date}.`}
          </p>
        ) : (
          <>
            {/* Games started that day, split by kind — the Special leads. */}
            <StartedByKindRow startedByKind={day.startedByKind} />
            {day.totals.started === 0 ? (
              <p className="dash-note">
                Only leftovers and chef's specials {isToday ? "so far today" : "that day"} — the Special
                itself went unplayed.
              </p>
            ) : (
              <RatesRow totals={day.totals} />
            )}
            {/* New vs returning players that day (all kinds, one count per device).
                Null — a day before tracking shipped — shows as "—", not 0. */}
            <PlayersRow players={day.players} trackingStart={playerTrackingStart} />
            <div className="analytics-split">
              <div>
                <h3 className="analytics-sub">
                  Guess distribution · {isToday ? "today's" : "that day's"} Special
                </h3>
                <GuessBars dist={day.guessDistribution} fails={day.fails} />
              </div>
              <div>
                <h3 className="analytics-sub">Average guesses</h3>
                <div className="metric-row" style={{ marginBottom: 0 }}>
                  <div className="metric">
                    <span className="metric__num">{dayAvg === null ? "—" : dayAvg.toFixed(2)}</span>
                    <span className="metric__label">{isToday ? "Today" : shortDate(day.date)}</span>
                  </div>
                  <div className="metric">
                    <span className="metric__num">{allTimeAvg === null ? "—" : allTimeAvg.toFixed(2)}</span>
                    <span className="metric__label">All time</span>
                  </div>
                </div>
                {difficulty && (
                  <p className="dash-note" style={{ marginTop: 8 }}>
                    {difficulty}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>All time</h2>
        {/* Games started across the game's life, Today's Special first. */}
        <StartedByKindRow startedByKind={startedByKind} />
        <RatesRow totals={totals} />
        <PlayersRow players={data.players} trackingStart={playerTrackingStart} />

        <div className="analytics-block">
          <h3 className="analytics-sub">Guess distribution</h3>
          <GuessBars dist={guessDistribution} fails={fails} />
        </div>

        <p className="dash-note" style={{ marginTop: 10 }}>
          Anonymous counts only — {MAX_GUESSES} guesses max, no record of which dishes players ordered. A
          “player” is an anonymous device (localStorage), counted once regardless of game kind.
          {playerTrackingStart && (
            <>
              {" "}
              Player counts start {playerTrackingStart}, when tracking shipped — earlier games are in the
              totals above but their devices aren't, so “new” is really “first seen since {playerTrackingStart}
              ”.
            </>
          )}
        </p>
      </section>
    </>
  );
}
