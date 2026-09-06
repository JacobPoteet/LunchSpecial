// The After Dark tab: how the night service is doing.
//
// A seventh tab rather than night figures sprinkled through the other six,
// because each tab holds one question and the other six ask theirs about the
// diner. Two of them would have been actively wrong to extend: Today counts an
// ET day, and the bar's unit is a local night; Menu's guess distribution is six
// wide, and the bar's is four.

import { useEffect, useState } from "react";
import type { AfterDarkReport, CrossoverDay, NightDrinkRow, NightServiceDay } from "../../shared/types";
import { DRINK_MAX_GUESSES, NIGHT_EPOCH_DATE } from "../../shared/types";
import { BAR_CLOSE_HOUR, BAR_OPEN_HOUR } from "../../shared/night";
import { rangeLabel, type Rate } from "../../shared/sample";
import * as api from "./api";
import { hourLabel, RangeHint, SAMPLE_NOTE, shortDate, type SurfaceFilter } from "./analyticsUi";

/**
 * A percentage with its interval underneath, which is the only way a rate is
 * ever printed on this dashboard. `null` is "not measured", and says so rather
 * than rendering 0%.
 */
function RateStat({ label, rate, note }: { label: string; rate: Rate | null; note?: string }) {
  // The interval comes off the Rate itself. Reconstructing the numerator from
  // the rounded percentage (round(pct/100 * of)) was landing on the wrong
  // integer at small denominators and printing an interval belonging to a
  // measurement nobody made — and small denominators are all this tab has.
  const range = rangeLabel(rate);
  return (
    <div className="night-stat">
      <span className="night-stat__num">{rate ? `${rate.pct}%` : "—"}</span>
      <span className="night-stat__label">{label}</span>
      {rate ? (
        range && (
          <span className="rate-range" title={SAMPLE_NOTE}>
            {range}
          </span>
        )
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
 *
 * The axis starts at opening time rather than at 00:00. All 24 hours are still
 * drawn — nothing is hidden — but a midnight-first axis cut the bar's own seven
 * hours in half and parked the two pieces at opposite ends of the chart, which
 * is the one shape this panel exists to show. Opening-first, an evening reads
 * left to right, and the hours the door is shut are shaded so a stray round
 * outside them is visibly outside rather than part of the curve.
 */
function HourProfile({
  hours,
  untracked,
  outside,
}: {
  hours: number[];
  untracked: number;
  outside: number;
}) {
  const peak = Math.max(1, ...hours);
  const total = hours.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <p className="dash-note">No Nightcaps recorded yet, so there is no shape to read.</p>;
  }
  // Rotated so column 0 is opening time. Still every hour, still in clock order.
  const axis = Array.from({ length: 24 }, (_, i) => (BAR_OPEN_HOUR + i) % 24);
  return (
    <>
      <div className="night-hours" role="img" aria-label="Nightcaps started per local hour of day">
        {axis.map((h) => {
          const n = hours[h];
          const shut = h < BAR_OPEN_HOUR && h >= BAR_CLOSE_HOUR;
          return (
            <div
              className={`night-hours__col${shut ? " night-hours__col--shut" : ""}`}
              key={h}
              title={`${hourLabel(h)} local — ${n}${shut ? " (doors shut)" : ""}`}
            >
              {/* Absolutely placed, both of these: in the flow they competed
                  with the bar for the column's fixed height, so a column
                  carrying a tick drew a visibly shorter bar than its neighbour
                  holding the same number. */}
              {n > 0 && <span className="night-hours__num">{n}</span>}
              <div className="night-hours__bar" style={{ height: n === 0 ? 0 : `${(n / peak) * 100}%` }} />
              {/* Every third hour, or the axis is unreadable at 320px. */}
              {h % 3 === 0 && <span className="night-hours__tick">{String(h).padStart(2, "0")}</span>}
            </div>
          );
        })}
      </div>
      <p className="dash-note">
        Local hour, from the device's own clock — the window is local, so an ET axis would scatter
        every player's nine o'clock into a different bucket. The axis opens at{" "}
        {hourLabel(BAR_OPEN_HOUR)} and the shaded columns are hours the door is shut.
        {untracked > 0 && (
          <>
            {" "}
            <b>{untracked}</b> {untracked === 1 ? "round carries" : "rounds carry"} no offset and{" "}
            {untracked === 1 ? "is" : "are"} not placed above.
          </>
        )}
        {outside > 0 && (
          <>
            {" "}
            <b>{outside}</b> started with the doors shut, which is a wound-forward clock rather than
            a late drinker — drawn where they landed, not tidied away.
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

/**
 * One night, both halves.
 *
 * `report.days` covers nights the bar recorded something; `crossover.days`
 * covers nights the diner did, which since the bar opened is very nearly the
 * same set and never exactly it — a night where four people finished lunch and
 * nobody came down has a crossover row and no service row. Merging on the key
 * keeps both facts on one line and leaves a dash where a half is genuinely
 * missing, rather than pairing two lists by position and quietly sliding one.
 */
interface MergedNight {
  night: string;
  service: NightServiceDay | null;
  cross: CrossoverDay | null;
}

function mergeNights(service: NightServiceDay[], cross: CrossoverDay[]): MergedNight[] {
  const byService = new Map(service.map((d) => [d.night, d]));
  const byCross = new Map(cross.map((d) => [d.day, d]));
  const keys = [...new Set([...byService.keys(), ...byCross.keys()])];
  // Newest first: the night you want is almost always the last one.
  keys.sort((a, b) => b.localeCompare(a));
  return keys.map((night) => ({
    night,
    service: byService.get(night) ?? null,
    cross: byCross.get(night) ?? null,
  }));
}

function DrinkRow({ row }: { row: NightDrinkRow }) {
  return (
    <tr>
      <td>
        {row.name}
        {!row.isAlcoholic && <span className="badge badge--soft"> alcohol-free</span>}
      </td>
      <td>{row.spirit === "none" ? <span className="dash-note">—</span> : row.spirit}</td>
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
  // One row per night, the lunch half beside the bar half. Merged on the key
  // rather than on position: the bar records nights the diner did not and the
  // other way round.
  const nights = mergeNights(report.days, crossover.days);

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

      {/* Volume before rates, deliberately. Every percentage below is a fraction
          of these counts, and a reader who meets the rate first has no way of
          knowing whether it came off four rounds or four hundred. */}
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
        <h2>Did anyone come back for a drink?</h2>
        <div className="night-stats">
          <RateStat label="Stayed for a Nightcap" rate={crossover.rate} />
          <CountStat label="Could have" value={crossover.finishedLunch} hint="devices, settled nights" />
          <CountStat label="Did" value={crossover.cameToBar} hint="devices" />
        </div>
        <p className="dash-note">
          The denominator is devices that <b>finished that day&apos;s Special</b>, on a night the bar
          was open and is now over — finishing lunch is the door, so everyone counted here could have
          walked through it. Devices, not rounds: someone who poured twice came back once.
        </p>
        <p className="dash-note">
          Two things it leaves out on purpose. Every Special finished before the bar&apos;s first
          night ({shortDate(NIGHT_EPOCH_DATE)}) — nobody could have walked into a bar that did not
          exist, and counting them read eligibility as refusal.{" "}
          {crossover.pending ? (
            <>
              And {crossover.pending.nights === 1 ? "tonight" : `${crossover.pending.nights} nights`}{" "}
              still being played: <b>{crossover.pending.finishedLunch}</b>{" "}
              {crossover.pending.finishedLunch === 1 ? "device has" : "devices have"} finished lunch so
              far and <b>{crossover.pending.cameToBar}</b>{" "}
              {crossover.pending.cameToBar === 1 ? "has" : "have"} come down — a denominator still
              filling, which is not a rate.
            </>
          ) : (
            <>And any night still being played, of which there is none right now.</>
          )}
        </p>
        {crossover.barOnly > 0 && (
          <p className="dash-note">
            <b>{crossover.barOnly}</b> {crossover.barOnly === 1 ? "device" : "devices"} reached the bar
            without finishing a Special on the same key — impossible through the front door, ordinary
            across two devices (lunch on a phone, a drink on a laptop). Counted here and in neither
            half of the rate above, which is what keeps that rate under 100%.
          </p>
        )}
        {crossover.rate?.small && <p className="dash-note">{SAMPLE_NOTE}</p>}
      </section>

      <section className="panel">
        <h2>When the bar is busy</h2>
        <HourProfile hours={report.hours} untracked={report.untrackedHour} outside={report.outsideHours} />
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
                  <th>Base</th>
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
              <b>{report.untrackedDrink}</b> rounds could not be tied to a drink. They are in the
              service totals above, because they were played, and in no row of this table.
            </>
          )}
        </p>
        <h3>Boozy or not</h3>
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
          Split on the drink&apos;s stored flag, never inferred from its base spirit — a beer has no
          base spirit. Two win rates differ only when their intervals stop overlapping, and at these
          denominators they will overlap for a long time.
        </p>
      </section>

      {nights.length > 0 && (
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
                  <th title="Devices that finished that day&apos;s Special">Could have</th>
                  <th title="Of those, how many came to the bar">Stayed</th>
                </tr>
              </thead>
              <tbody>
                {nights.map((n) => (
                  <tr key={n.night}>
                    <td>
                      {shortDate(n.night)}
                      {n.cross && !n.cross.settled && (
                        <>
                          {" "}
                          <span className="badge badge--soft">open</span>
                        </>
                      )}
                    </td>
                    <td>{n.service?.started ?? 0}</td>
                    <td>{n.service?.completed ?? 0}</td>
                    <td>{n.service?.solved ?? 0}</td>
                    <td>{n.service?.shared ?? 0}</td>
                    <td>{n.cross ? n.cross.finishedLunch : <span className="dash-note">—</span>}</td>
                    <td>
                      {n.cross === null ? (
                        <span className="dash-note">—</span>
                      ) : n.cross.rate ? (
                        <>
                          {n.cross.cameToBar} ({n.cross.rate.pct}%)
                        </>
                      ) : (
                        <>
                          {n.cross.cameToBar}
                          {!n.cross.settled && <span className="dash-note"> so far</span>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dash-note">
            Newest first. Nights with nothing recorded at all are absent rather than zero-filled —
            before the bar opened there was nothing to report, and a flat zero would claim a quiet
            night that never happened. A night still being played quotes counts but no rate.
          </p>
        </section>
      )}
    </>
  );
}
