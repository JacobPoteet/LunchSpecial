import { useState } from "react";
import type { AnalyticsSummary } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";
import DayPicker from "./DayPicker";
import {
  GuessBars,
  RatesRow,
  SolveTimeRead,
  StartedByKindRow,
  avgGuesses,
  difficultyNote,
  noRoundsNote,
  shortDate,
  sumKinds,
  type SurfaceFilter,
} from "./analyticsUi";
import { Icon } from "../game/Icon";

/**
 * How one day's Special played, and how hard the puzzle runs overall. Moved
 * here from Players: difficulty is a question about the dish, and it belongs
 * beside the dish report that asks the same thing one dish at a time.
 *
 * The day picker lives here and nowhere else. It re-points the shared
 * /analytics fetch, so the dashboard resets it to today when you leave Menu;
 * otherwise Today's "At a glance" would quietly show the picked day.
 */
export default function SpecialDayPanel({
  data,
  error,
  surface,
  date,
  onPickDate,
}: {
  data: AnalyticsSummary | null;
  error: string | null;
  surface: SurfaceFilter;
  /** null = follow today, so the panel keeps tracking the midnight-ET rollover. */
  date: string | null;
  onPickDate: (date: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const title = "How the Special played";

  if (error) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="dash-note">Couldn't load analytics: {error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="dash-note">Counting the receipts…</p>
      </section>
    );
  }
  if (data.totals.started === 0) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="dash-note">{noRoundsNote(surface)}</p>
      </section>
    );
  }

  const { day, today, activeDates, guessDistribution, fails, solveTimes } = data;
  // The server settles what day we're actually looking at, so trust `day.date`
  // over the requested one (a future/garbage date falls back to today).
  const isToday = day.date === today;
  const allTimeAvg = avgGuesses(guessDistribution);
  const dayAvg = avgGuesses(day.guessDistribution);
  // How this day's Special played against the average, worded once in
  // analyticsUi so the Overview's copy of this read can't drift from it.
  const difficulty = difficultyNote(day.guessDistribution, guessDistribution, isToday);
  const dayStartedAny = sumKinds(day.startedByKind);

  return (
    <>
      <section className="panel">
        <div className="analytics-head">
          <h2>
            {isToday ? "Today's Special" : "The Special"} · {day.dishName ?? day.date}
            {day.dishName && ` · ${day.date}`}
          </h2>
          <div className="analytics-head__tools">
            <button className="btn btn--ghost btn--small" onClick={() => setPicking(true)}>
              <Icon name="calendar" /> {isToday ? "Today" : day.date}
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
            {date !== null && (
              <>
                {" "}
                <button className="link-btn" onClick={() => onPickDate(null)}>
                  Back to today
                </button>
              </>
            )}
          </p>
        ) : (
          <>
            <StartedByKindRow startedByKind={day.startedByKind} />
            {day.totals.started === 0 ? (
              <p className="dash-note">
                Only leftovers and chef's specials {isToday ? "so far today" : "that day"} — the Special
                itself went unplayed.
              </p>
            ) : (
              <RatesRow totals={day.totals} />
            )}
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
        <h2>How hard the puzzle runs · all time</h2>
        <div className="analytics-split">
          <div>
            <h3 className="analytics-sub">Guess distribution</h3>
            <GuessBars dist={guessDistribution} fails={fails} />
          </div>
          <div>
            {/* The other half of difficulty. Two dishes can share a guess
                distribution and be nothing alike if one of them took people ten
                minutes of staring. */}
            <h3 className="analytics-sub">Time to solve</h3>
            <SolveTimeRead times={solveTimes} />
            <p className="dash-note" style={{ marginTop: 8 }}>
              Measured from the first guess to game over, so a round left open in a tab counts the whole
              time it was open — which is why this is a median and a p90, never an average.
            </p>
          </div>
        </div>
        <p className="dash-note" style={{ marginTop: 10 }}>
          Every diner mode, {MAX_GUESSES} guesses max. Nightcaps are left out: four guesses is a different
          scale.
        </p>
      </section>
    </>
  );
}
