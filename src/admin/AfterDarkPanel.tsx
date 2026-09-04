// The After Dark tab: how the night service is doing.
//
// A seventh tab rather than night figures sprinkled through the other six,
// because each tab holds one question and the other six ask theirs about the
// diner. Two of them would have been actively wrong to extend: Today counts an
// ET day, and the bar's unit is a local night; Menu's guess distribution is six
// wide, and the bar's is four.

import { useEffect, useState } from "react";
import type { AfterDarkReport, NightDrinkRow } from "../../shared/types";
import { DRINK_MAX_GUESSES } from "../../shared/types";
import type { Rate } from "../../shared/sample";
import * as api from "./api";
import { hourLabel, RangeHint, SAMPLE_NOTE, shortDate, type SurfaceFilter } from "./analyticsUi";

/**
 * A percentage with its interval underneath, which is the only way a rate is
 * ever printed on this dashboard. `null` is "not measured", and says so rather
 * than rendering 0%.
 */
function RateStat({ label, rate, note }: { label: string; rate: Rate | null; note?: string }) {
  return (
    <div className="night-stat">
      <span className="night-stat__num">{rate ? `${rate.pct}%` : "—"}</span>
      <span className="night-stat__label">{label}</span>
      {rate ? (
        <RangeHint n={Math.round((rate.pct / 100) * rate.of)} of={rate.of} />
      ) : (
        <span className="night-stat__hint">not measured yet</span>
      )}
      {note && <span className="night-stat__hint">{note}</span>}
    </div>
  );
}

function CountStat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="night-stat">
      <span className="night-stat__num">{value}</span>
      <span className="night-stat__label">{label}</span>
      {hint && <span className="night-stat__hint">{hint}</span>}
    </div>
  );
}

/**
 * When people actually drink, on their own clocks.
 *
 * Local hour, not ET, and that is the whole reason `tz_offset` exists: the
 * window is defined on local time, so in ET every player's nine o'clock would
 * land in a different bucket and the shape would be noise. Rounds with no
 * offset are printed as a count beside the chart rather than placed at
 * midnight.
 */
function HourProfile({ hours, untracked }: { hours: number[]; untracked: number }) {
  const peak = Math.max(1, ...hours);
  const total = hours.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <p className="dash-note">No Nightcaps recorded yet, so there is no shape to read.</p>;
  }
  return (
    <>
      <div className="night-hours" role="img" aria-label="Nightcaps started per local hour of day">
        {hours.map((n, h) => (
          <div className="night-hours__col" key={h} title={`${hourLabel(h)} — ${n}`}>
            <div className="night-hours__bar" style={{ height: `${(n / peak) * 100}%` }} />
            {/* Every fourth hour, or the axis is unreadable at 320px. */}
            <span className="night-hours__tick">{h % 4 === 0 ? h : ""}</span>
          </div>
        ))}
      </div>
      <p className="dash-note">
        Local hour, from the device's own clock — the window is local, so an ET axis would scatter
        every player's nine o'clock into a different bucket.
        {untracked > 0 && (
          <>
            {" "}
            <b>{untracked}</b> {untracked === 1 ? "round carries" : "rounds carry"} no offset and{" "}
            {untracked === 1 ? "is" : "are"} not placed above.
          </>
        )}
      </p>
    </>
  );
}

/** The bar's guess distribution. Four wide, and never merged with the diner's. */
function NightGuessBars({ dist, fails }: { dist: number[]; fails: number }) {
  const max = Math.max(1, ...dist, fails);
  return (
    <div className="dist">
      {dist.map((n, i) => (
        <div className="dist__row" key={i} style={{ "--w": `${8 + (n / max) * 80}%` } as React.CSSProperties}>
          <span>{i + 1}</span>
          <span className="dist__bar">{n}</span>
        </div>
      ))}
      <div className="dist__row" style={{ "--w": `${8 + (fails / max) * 80}%` } as React.CSSProperties}>
        <span>X</span>
        <span className="dist__bar">{fails}</span>
      </div>
    </div>
  );
}

function DrinkRow({ row }: { row: NightDrinkRow }) {
  return (
    <tr>
      <td>
        {row.name}
        {!row.isAlcoholic && <span className="badge badge--soft"> alcohol-free</span>}
      </td>
      <td>{row.started}</td>
      <td>{row.completed}</td>
      <td>
        {row.winRate ? (
          <>
            {row.winRate.pct}%<RangeHint n={row.solved} of={row.completed} />
          </>
        ) : (
          <span className="dash-note">—</span>
        )}
      </td>
      <td>{row.avgGuesses === null ? <span className="dash-note">—</span> : row.avgGuesses.toFixed(1)}</td>
      <td>{row.shared}</td>
    </tr>
  );
}

export default function AfterDarkPanel({ surface }: { surface: SurfaceFilter }) {
  const [data, setData] = useState<AfterDarkReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    api.getNightReport(surface === "all" ? undefined : surface).then(
      (d) => live && setData(d),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [surface]);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="dash-note">Reading the till…</p>;

  const { board, report, crossover } = data;
  const fails = report.totals.completed - report.totals.solved;

  return (
    <>
      <section className="panel">
        <h2>Tonight at the bar</h2>
        <div className="night-board">
          <div>
            <p className="night-board__label">Tonight</p>
            <p className="night-board__drink">
              {board.tonight.drinkName ?? <span className="dash-note">unbooked — runs on the fallback pour</span>}
            </p>
          </div>
          <div>
            <p className="night-board__label">Tomorrow</p>
            <p className="night-board__drink">
              {board.tomorrow.drinkName ?? <span className="dash-note">unbooked — runs on the fallback pour</span>}
            </p>
          </div>
        </div>
        <p className="dash-note">
          {board.bookedAhead} {board.bookedAhead === 1 ? "night" : "nights"} booked from tonight ·{" "}
          {board.neverPoured} {board.neverPoured === 1 ? "drink has" : "drinks have"} never been on.
          {board.neverPoured === 0 && " The shuffle has nothing left to roll."}
        </p>
      </section>

      <section className="panel">
        <h2>Did anyone come back for a drink?</h2>
        <div className="night-stats">
          <RateStat label="Stayed for a Nightcap" rate={crossover.rate} />
          <CountStat label="Finished a Special" value={crossover.finishedLunch} hint="devices" />
          <CountStat label="Then came to the bar" value={crossover.cameToBar} hint="devices" />
        </div>
        <p className="dash-note">
          The denominator is devices that <b>finished today's Special</b>, not devices that visited —
          finishing lunch is the door, so everyone counted here could have walked through it. Devices,
          not rounds: someone who poured twice came back once.
        </p>
        {crossover.rate?.small && <p className="dash-note">{SAMPLE_NOTE}</p>}
      </section>

      <section className="panel">
        <h2>Night service</h2>
        <div className="night-stats">
          <CountStat label="Nightcaps started" value={report.totals.started} />
          <RateStat label="Finished" rate={report.totals.finishRate} />
          <RateStat label="Solved" rate={report.totals.winRate} />
          <RateStat label="Shared" rate={report.totals.shareRate} />
        </div>
        <p className="dash-note">
          Rates are pooled over the whole period, never averaged across nights — one quiet Tuesday
          must not outvote a busy Saturday.
        </p>
        <h3>Guesses used</h3>
        <NightGuessBars dist={report.guessDistribution} fails={fails} />
        <p className="dash-note">
          Out of {DRINK_MAX_GUESSES}. Deliberately its own chart: a win in four here and a win in four
          on the Menu tab are different achievements, and one x-axis cannot hold both.
        </p>
      </section>

      <section className="panel">
        <h2>When the bar is busy</h2>
        <HourProfile hours={report.hours} untracked={report.untrackedHour} />
      </section>

      <section className="panel">
        <h2>Boozy or not</h2>
        <div className="night-stats">
          <RateStat
            label="With alcohol"
            rate={report.alcohol.boozy.winRate}
            note={`${report.alcohol.boozy.completed} finished`}
          />
          <RateStat
            label="Alcohol-free"
            rate={report.alcohol.sober.winRate}
            note={`${report.alcohol.sober.completed} finished`}
          />
        </div>
        <p className="dash-note">
          Split on the drink's stored flag, never inferred from its base spirit — a beer has no base
          spirit. This is the read that says whether the pool is balanced, not whether one is harder.
        </p>
      </section>

      <section className="panel">
        <h2>Every pour</h2>
        {report.drinks.length === 0 ? (
          <p className="dash-note">Nothing poured yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Drink</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Win rate</th>
                  <th>Avg guesses</th>
                  <th>Shares</th>
                </tr>
              </thead>
              <tbody>
                {report.drinks.map((d) => (
                  <DrinkRow key={d.drinkId} row={d} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="dash-note">
          Hardest first. A drink nobody has finished sorts last rather than showing a 0% it never
          earned.
          {report.untrackedDrink > 0 && (
            <>
              {" "}
              <b>{report.untrackedDrink}</b> rounds could not be tied to a drink and are counted
              nowhere above.
            </>
          )}
        </p>
      </section>

      {report.days.length > 0 && (
        <section className="panel">
          <h2>Night by night</h2>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Night</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Solved</th>
                  <th>Shared</th>
                </tr>
              </thead>
              <tbody>
                {[...report.days].reverse().map((d) => (
                  <tr key={d.night}>
                    <td>{shortDate(d.night)}</td>
                    <td>{d.started}</td>
                    <td>{d.completed}</td>
                    <td>{d.solved}</td>
                    <td>{d.shared}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dash-note">
            Nights with nothing recorded are absent rather than zero-filled — before the bar opened
            there was nothing to report, and a flat zero would claim a quiet night that never happened.
          </p>
        </section>
      )}
    </>
  );
}
