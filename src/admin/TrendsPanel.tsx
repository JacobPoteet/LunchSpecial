import { Fragment } from "react";
import type { AnalyticsSummary, GameGrowth, GrowthTrend, PlayRhythm, WeekdayPlay } from "../../shared/types";
import { KIND_META, KindLegend, hourLabel, noRoundsNote, pct, shortDate, type SurfaceFilter } from "./analyticsUi";

/**
 * Everything that moves over *time*, and nothing else.
 *
 * This tab used to also carry the repeat-visit ladder and the country pie, on the
 * grounds that they're charts. They're now on Players, where the rest of the
 * audience lives — a tab defined by "has an x-axis" isn't a question anybody
 * asks. What's left is one question asked at four scales: the whole run (growth),
 * the last month (the spark), the week (weekday profile), and the day (the
 * heatmap's hour axis).
 */

/**
 * Inside ±15% of the all-time average pace, "gaining" and "stalling" are both
 * overclaims — a couple of good afternoons move a week's rate by more than that.
 */
const GROWTH_STEADY_BAND = 0.15;

/** Small numbers keep a decimal; past ~10 games a day the fraction is false precision. */
const games = (n: number) => (Math.abs(n) < 10 ? n.toFixed(1) : Math.round(n).toString());

/**
 * The growth chart's headline: gaining, steady, or stalling.
 *
 * A cumulative curve always rises, so "is it going up" is never the question —
 * whether it's *bending* is. This states that as two paces rather than as a
 * shape: what the last week actually ran at, against the average pace over the
 * whole run (the slope of the straight reference line). Ahead of it the curve is
 * pulling above the line; behind it, flattening off.
 *
 * Both are real measured rates — the recent one straight off the running total —
 * so neither is a forecast, and the sentence never claims where the curve goes
 * next.
 */
function growthNote(trend: GrowthTrend, since: string): string {
  const lately = `the last ${trend.recentDays} days`;
  const average = `${games(trend.slope)} a day average since ${shortDate(since)}`;

  // A flat tail is the one case where a ratio would be silly: nothing happened.
  if (trend.recentPerDay === 0) {
    return `■ Stalled — no games at all in ${lately}. The curve has gone flat against a ${average}.`;
  }
  // Cumulative series only rise, so a non-positive slope means the whole run is
  // one burst and there's no average worth dividing by.
  if (trend.slope <= 0) {
    return `${lately} ran about ${games(trend.recentPerDay)} games a day.`;
  }

  const ratio = trend.recentPerDay / trend.slope;
  const recent = `${lately} ran about ${games(trend.recentPerDay)} games a day`;
  if (ratio > 1 + GROWTH_STEADY_BAND) {
    return `▲ Gaining — ${recent}, ahead of the ${average}. The curve is pulling above its steady-pace line.`;
  }
  if (ratio < 1 - GROWTH_STEADY_BAND) {
    return `▼ Losing steam — ${recent}, behind the ${average}. The curve is flattening off.`;
  }
  return `Holding steady — ${recent}, in line with the ${average}. Growth is straight-line, not compounding.`;
}

/**
 * The running total of games played since the first round ever recorded, with
 * the constant-pace line through it (GitHub #90).
 *
 * All-time and every kind together, which is what makes it a growth chart rather
 * than a second copy of the 30-day spark below: growth is the thing a moving
 * window is least able to show, and splitting by mode would answer "what are they
 * playing" instead of "are more people playing".
 *
 * **Cumulative on purpose.** A per-day series is dominated by which day of the
 * week you're looking at; the running total absorbs that, so the shape is the
 * answer — steepening means the game is gaining, flattening means it's stalling.
 * The trade is that a cumulative curve can never fall, so "it's going up" stops
 * carrying information: everything here is built to make the *bend* legible.
 * (The day-of-week variation it absorbs isn't lost — it's the weekday profile
 * further down, which is where that noise turns back into a signal.)
 *
 * Three choices worth keeping:
 *
 * - **The straight dashed line is the reference the bend is read against.** It's
 *   the least-squares fit through the curve, i.e. what the run would look like at
 *   one constant pace; the curve above it at the right = gaining, below =
 *   stalling. Without it a cumulative chart is unreadable, because every such
 *   chart looks like success.
 * - **The fit is clipped, never clamped.** An accelerating run has its best-fit
 *   line crossing zero *before* day one, so the line legitimately leaves the plot
 *   at the bottom-left; pinning it to the axis would flatten the pace it exists
 *   to state. It's also the only dashed, uncoloured line on the dashboard — ink
 *   rather than a series hue, because it isn't a measurement.
 * - **Quiet days are flat steps, not skipped days.** The series is filled
 *   server-side (worker/growth.ts) so the x-axis is calendar time; closing the
 *   gap over a dead week would sell it as continuous play.
 */
function GrowthChart({ growth }: { growth: GameGrowth }) {
  const { days, trend } = growth;
  const W = 660;
  const H = 200;
  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const n = days.length;
  const x = (i: number) =>
    n <= 1 ? padL + (W - padL - padR) / 2 : padL + (i / (n - 1)) * (W - padL - padR);
  // The series only rises, so the last day is the maximum — and the top of the
  // axis is the all-time total, which is the number the chart is about.
  const total = days[n - 1].cumulative;
  const max = Math.max(1, total);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);

  const line = days
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.cumulative).toFixed(1)}`)
    .join(" ");
  // Closed back along the baseline so the run reads as accumulated mass — same
  // hue as the line, so it adds no second meaning.
  const area = `${line} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const xTickStep = Math.max(1, Math.ceil(n / 6));
  const yTicks = [...new Set([0, Math.round(max / 2), max])];

  return (
    <div className="gchart">
      <div className="gchart__legend">
        <span className="gchart__legend-item">
          <span className="gchart__swatch gchart__swatch--played" />
          Games played (running total)
        </span>
        {trend && (
          <span className="gchart__legend-item">
            <span className="gchart__swatch gchart__swatch--trend" />
            Steady pace
          </span>
        )}
      </div>
      <svg
        className="gchart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Running total of games played from ${days[0].date} to ${
          days[n - 1].date
        }, reaching ${total}${
          trend
            ? `. The last ${trend.recentDays} days ran at ${games(
                trend.recentPerDay,
              )} games a day against an all-time average of ${games(trend.slope)}`
            : ""
        }.`}
        preserveAspectRatio="none"
      >
        <defs>
          <clipPath id="gchart-plot">
            <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} />
          </clipPath>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="gchart__grid" x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} />
            <text className="gchart__axis" x={padL - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {v}
            </text>
          </g>
        ))}
        <path className="gchart__area" d={area} />
        <path className="gchart__line" d={line} fill="none" />
        {trend && (
          <line
            className="gchart__trend"
            clipPath="url(#gchart-plot)"
            x1={x(0)}
            y1={y(trend.first)}
            x2={x(n - 1)}
            y2={y(trend.last)}
          />
        )}
        {n <= 45 &&
          days.map((d, i) => (
            <circle className="gchart__dot" key={d.date} cx={x(i)} cy={y(d.cumulative)} r={2.6}>
              {/* The day's own count is only visible here: on the curve itself a
                  busy day and a dead one are both just "higher than yesterday". */}
              <title>{`${d.date} · ${d.cumulative} total (+${d.started} that day)`}</title>
            </circle>
          ))}
        {days.map((d, i) =>
          i % xTickStep === 0 || i === n - 1 ? (
            <text key={d.date} className="gchart__axis" x={x(i)} y={H - 6} textAnchor="middle">
              {shortDate(d.date)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * How many times a weekday has to have come around before its average is worth
 * quoting flat. Three weeks is the first point at which one freak Tuesday stops
 * setting the number.
 */
const WEEKDAY_MIN_OCCURRENCES = 3;

/**
 * The one sentence the weekday profile supports: which day the diner is busiest,
 * and by how much.
 *
 * Held back until both ends of the comparison have enough occurrences behind
 * them. Two Saturdays is not a pattern, and a launch that happened to land on a
 * weekend will otherwise announce that weekends are the game's big moment for
 * about a fortnight.
 */
function weekdayNote(byWeekday: WeekdayPlay[]): string | null {
  const eligible = byWeekday.filter((d) => d.days >= WEEKDAY_MIN_OCCURRENCES);
  if (eligible.length < 2) {
    return `Every weekday needs about ${WEEKDAY_MIN_OCCURRENCES} outings before its average means anything — check back in a couple of weeks.`;
  }
  const sorted = [...eligible].sort((a, b) => b.perDay - a.perDay);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best.perDay === 0) return null;
  const ratio = worst.perDay === 0 ? Infinity : best.perDay / worst.perDay;
  const lead = `${WEEKDAY_LABELS[best.weekday]} is the busiest day at ${best.perDay.toFixed(1)} games a time, ${WEEKDAY_LABELS[worst.weekday]} the quietest at ${worst.perDay.toFixed(1)}`;
  if (ratio < 1.25) {
    return `${lead} — close enough that the week is basically flat, so a dip on any one day is worth looking into rather than shrugging off.`;
  }
  return `${lead}, about ${ratio === Infinity ? "∞" : `${ratio.toFixed(1)}×`} the traffic. Worth scheduling the harder Specials into the busy days, where a low win rate is measured on enough people to mean something.`;
}

/**
 * Games started by weekday, as a per-occurrence average.
 *
 * **Averages, not totals** — the whole reason this exists as its own fold. A run
 * that started on a Friday has had one more Friday in it than Thursday, and at a
 * few weeks of history that head start alone invents a "big day". The occurrence
 * count rides on every bar so the thin ones can't hide.
 *
 * One hue, like the menu-mix bars: these are nominal categories, so bar length
 * already carries the value and seven colours would just re-encode it.
 */
function WeekdayProfile({ byWeekday }: { byWeekday: WeekdayPlay[] }) {
  const max = Math.max(1, ...byWeekday.map((d) => d.perDay));
  return (
    <div className="wprofile">
      {byWeekday.map((d) => (
        <div className="wprofile__row" key={d.weekday}>
          <span className="wprofile__key">{WEEKDAY_LABELS[d.weekday]}</span>
          <span className="wprofile__track">
            <span
              className={`wprofile__bar${d.days < WEEKDAY_MIN_OCCURRENCES ? " wprofile__bar--thin" : ""}`}
              style={{ width: `${d.perDay === 0 ? 0 : 4 + (d.perDay / max) * 96}%` }}
            />
          </span>
          <span className="wprofile__num">{d.perDay.toFixed(1)}</span>
          <span className="wprofile__of" title={`${d.started} games across ${d.days} ${WEEKDAY_LABELS[d.weekday]}s`}>
            {d.started} over {d.days}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * When people play, as a weekday × hour grid (GitHub: Phase 0 dashboard pass).
 *
 * This replaces the flat 24-hour bar chart that used to sit here. That chart and
 * the 30-day spark above it were **two one-dimensional shadows of the same
 * two-dimensional thing** — and the interaction between the axes, which is the
 * only part either of them couldn't show, is exactly the actionable bit: "Sunday
 * mornings are busy and Tuesday mornings are dead" is a scheduling decision, and
 * neither projection can state it.
 *
 * Two choices worth keeping:
 *
 * - **One hue, varying only in strength.** A heatmap's whole channel is
 *   intensity; a rainbow ramp over it would add a second, false, categorical
 *   reading — and mustard/teal/cherry already mean game mode everywhere else. The
 *   teal here is the same "activity" teal the growth curve uses.
 * - **Zero is drawn as an empty cell, not as the palest colour.** At this volume
 *   most cells are 0 or 1, and a ramp that starts at "faint" makes an empty 4am
 *   look like a measurement. The grid's texture should be where play *is*.
 */
function Heatmap({ rhythm }: { rhythm: PlayRhythm }) {
  const max = Math.max(1, ...rhythm.heat.flat());
  const rowTotals = rhythm.heat.map((row) => row.reduce((a, b) => a + b, 0));
  const rowMax = Math.max(1, ...rowTotals);
  const hourMax = Math.max(1, ...rhythm.byHour);

  return (
    <div className="heat">
      <div className="heat__grid">
        <span className="heat__corner" />
        {/* Hour ticks along the top, every three hours so they fit on a phone. */}
        {Array.from({ length: 24 }, (_, h) => (
          <span className="heat__htick" key={`h${h}`}>
            {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
          </span>
        ))}
        <span className="heat__corner" />

        {rhythm.heat.map((row, weekday) => (
          // A real Fragment, not <>: the grid is one flat row of cells, so each
          // weekday's run of them needs a key at this level.
          <Fragment key={`row${weekday}`}>
            <span className="heat__wtick">{WEEKDAY_LABELS[weekday]}</span>
            {row.map((n, hour) => (
              <span
                key={`${weekday}-${hour}`}
                className={`heat__cell${n === 0 ? " heat__cell--none" : ""}`}
                // Zero gets no fill at all — see the note above. Everything else
                // ramps from a floor so a single round is still visible.
                style={n === 0 ? undefined : { opacity: 0.22 + (n / max) * 0.78 }}
                title={`${WEEKDAY_LABELS[weekday]} ${hourLabel(hour)} ET — ${n} started`}
              />
            ))}
            {/* Row marginal: the weekday's total, as a bar rather than a number,
                so the grid keeps one reading direction. */}
            <span className="heat__margin" title={`${rowTotals[weekday]} started on a ${WEEKDAY_LABELS[weekday]}`}>
              <span className="heat__margin-bar" style={{ width: `${(rowTotals[weekday] / rowMax) * 100}%` }} />
            </span>
          </Fragment>
        ))}

        {/* Column marginal: the hour-of-day profile the old standalone chart was. */}
        <span className="heat__wtick heat__wtick--margin">All</span>
        {rhythm.byHour.map((n, hour) => (
          <span className="heat__hmargin" key={`hm${hour}`} title={`${hourLabel(hour)} ET — ${n} started all week`}>
            <span className="heat__hmargin-bar" style={{ height: `${n === 0 ? 0 : 8 + (n / hourMax) * 92}%` }} />
          </span>
        ))}
        <span className="heat__corner" />
      </div>
      <p className="dash-note heat__caption">
        Rounds started, by ET weekday and hour, all time. Bars on the right and along the bottom are the
        same grid summed each way — the row totals are the weekday counts (not the averages above, which
        divide by how often each day has come around).
      </p>
    </div>
  );
}

export default function TrendsPanel({
  data,
  error,
  surface,
}: {
  data: AnalyticsSummary | null;
  error: string | null;
  surface: SurfaceFilter;
}) {
  if (error) {
    return (
      <section className="panel">
        <h2>Trends</h2>
        <p className="dash-note">Couldn't load analytics: {error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="panel">
        <h2>Trends</h2>
        <p className="dash-note">Counting the receipts…</p>
      </section>
    );
  }

  const { totals, daily, growth, rhythm, playerTrackingStart } = data;
  if (totals.started === 0) {
    return (
      <section className="panel">
        <h2>Trends</h2>
        <p className="dash-note">{noRoundsNote(surface)}</p>
      </section>
    );
  }

  const dayMax = Math.max(1, ...daily.map((d) => d.started));
  // Label roughly 6 dates along the spark so they don't overlap; always tag the last day.
  const dayTickStep = Math.max(1, Math.ceil(daily.length / 6));
  // Most recent days first for the breakdown table.
  const recentDays = [...daily].reverse();
  const span = `last ${daily.length} day${daily.length === 1 ? "" : "s"}`;
  const weekday = weekdayNote(rhythm.byWeekday);

  return (
    <>
      {/* First, because it's the widest question on the tab: everything below it
          asks what happened lately, this asks whether the game is gaining. */}
      <section className="panel">
        <h2>Total games played · all time</h2>
        {growth.days.length === 0 ? (
          <p className="dash-note">No dated activity yet.</p>
        ) : (
          <>
            <p className="gchart__headline">
              <strong className="gchart__total">{growth.days.at(-1)!.cumulative.toLocaleString()}</strong> games
              played since {shortDate(growth.days[0].date)}.
              {growth.trend && ` ${growthNote(growth.trend, growth.days[0].date)}`}
            </p>
            <GrowthChart growth={growth} />
            <details className="dash-details">
              <summary>How to read it</summary>
              <p className="dash-note">
                A running total of every game started, all three kinds together, by the ET day it was
                started on — so it can only go up, and the reading is the <em>shape</em>: steepening means
                the game is gaining, flattening means it's stalling.{" "}
                {growth.trend
                  ? "The dashed line is the same run at one constant pace (a least-squares fit through the curve), there to make that bend visible. It's a reference, not a forecast."
                  : `The steady-pace line needs a longer run than ${growth.days.length} day${
                      growth.days.length === 1 ? "" : "s"
                    } — it'll appear once there's enough history to mean something.`}
              </p>
            </details>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Games started · {span}</h2>
        {daily.length === 0 ? (
          <p className="dash-note">No dated activity yet.</p>
        ) : (
          <>
            <KindLegend />
            <div className="spark">
              {daily.map((d, i) => {
                // Tag every Nth day plus the final one so the newest date is always labeled.
                const showTick = i % dayTickStep === 0 || i === daily.length - 1;
                const tip = KIND_META.map((k) => `${k.label}: ${d.startedByKind[k.key]}`).join(", ");
                return (
                  <div className="spark__col" key={d.date} title={`${d.date} · ${d.started} started (${tip})`}>
                    <span className="spark__num">{d.started}</span>
                    {/* Stacked: each column's total height is the day's games
                        started; the three segments split it by kind. */}
                    <span className="spark__bar" style={{ height: `${6 + (d.started / dayMax) * 94}%` }}>
                      {KIND_META.map((k) => {
                        const n = d.startedByKind[k.key];
                        if (n === 0) return null;
                        return (
                          <span
                            key={k.key}
                            className={`spark__seg spark__seg--${k.cls}`}
                            style={{ height: `${(n / d.started) * 100}%` }}
                          />
                        );
                      })}
                    </span>
                    {showTick && <span className="spark__tick">{shortDate(d.date)}</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* The weekly cycle the growth curve deliberately averages out. Above the
          heatmap because it's the summary the grid is the detail of. */}
      <section className="panel">
        <h2>Which day of the week</h2>
        {weekday && <p className="dish-report__headline">{weekday}</p>}
        <WeekdayProfile byWeekday={rhythm.byWeekday} />
        <p className="dash-note">
          Games started per <em>occurrence</em> of each weekday, not per weekday in total — the run started
          on a {WEEKDAY_LABELS[new Date(`${rhythm.since ?? "2026-07-17"}T00:00:00Z`).getUTCDay()]}, so some
          days have come around more often than others and raw totals would hand those a head start.
        </p>
      </section>

      <section className="panel">
        <h2>When people play · all time</h2>
        <Heatmap rhythm={rhythm} />
      </section>

      {/* Collapsed by default: eleven columns over thirty rows is the biggest
          block on the dashboard and it's a data dump, not a read. The charts
          above are what you'd look at; this is what you'd check a number in. */}
      <section className="panel">
        <details className="dash-details dash-details--table">
          <summary>
            <h2>Daily breakdown · {span}</h2>
          </summary>
          {recentDays.length === 0 ? (
            <p className="dash-note">No dated activity yet.</p>
          ) : (
            <div className="day-table-wrap">
              <table className="day-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Started</th>
                    <th title="Today's Special">Special</th>
                    <th>Leftovers</th>
                    <th title="Chef's Choice">Chef's</th>
                    <th title="Players first seen this day">New</th>
                    <th title="Players who first played earlier">Ret.</th>
                    <th>Completed</th>
                    <th>Solved</th>
                    <th>Win rate</th>
                    <th>Shared</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDays.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>{d.started}</td>
                      <td>{d.startedByKind.daily}</td>
                      <td>{d.startedByKind.leftover}</td>
                      <td>{d.startedByKind.random}</td>
                      {/* "—" = before tracking shipped. Not a zero. */}
                      <td title={d.newPlayers === null ? `Player tracking started ${playerTrackingStart}` : undefined}>
                        {d.newPlayers ?? "—"}
                      </td>
                      <td title={d.returningPlayers === null ? `Player tracking started ${playerTrackingStart}` : undefined}>
                        {d.returningPlayers ?? "—"}
                      </td>
                      <td>{d.completed}</td>
                      <td>{d.solved}</td>
                      <td>{pct(d.solved, d.completed)}%</td>
                      <td>{d.shared}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </section>
    </>
  );
}
