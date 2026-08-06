import type { AnalyticsDay, AnalyticsSummary, PlayerRetention, RetentionStep } from "../../shared/types";
import {
  KIND_META,
  KindLegend,
  noRoundsNote,
  pct,
  shortDate,
  untrackedNote,
  type SurfaceFilter,
} from "./analyticsUi";

/**
 * Below this many players a rung's percentage is one person's mood, so it's
 * flagged rather than quoted flat. Not hidden: "how many of my three-timers came
 * back" is the whole question, and a blank row answers it worse than a caveat.
 */
const RETENTION_MIN_COHORT = 10;

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

/**
 * The headline read, in the one sentence a restaurant owner would want: how
 * often does a first-timer come back, and how much better does that get once
 * they already have?
 *
 * Null until **both** rungs clear {@link RETENTION_MIN_COHORT}, following the
 * same rule `paceNote` uses for a baseline under one game. The rungs themselves
 * can quote a thin cohort because each one prints its own "1 of 1" denominator
 * beside the percentage; a prose sentence can't carry that, and "once they've
 * come twice, 100%" off a single player is a claim the data hasn't earned.
 */
function retentionNote(steps: RetentionStep[], windowDays: number): string | null {
  const first = steps.find((s) => s.visits === 1);
  const second = steps.find((s) => s.visits === 2);
  if (!first || !second) return null;
  if (first.atRisk < RETENTION_MIN_COHORT || second.atRisk < RETENTION_MIN_COHORT) return null;
  const a = pct(first.returned, first.atRisk);
  const b = pct(second.returned, second.atRisk);
  const lead = `A first-timer comes back within ${windowDays} days ${a}% of the time; once they've come twice, ${b}%.`;
  if (b > a + 5) return `${lead} The second visit is where regulars are made — the earlier you can earn it, the better every later number gets.`;
  if (a > b + 5) return `${lead} Repeat visits are getting less likely rather than more — worth checking whether the later days are landing.`;
  return `${lead} The odds barely move with familiarity, so what wins a second visit is winning a first.`;
}

/**
 * The repeat-visit curve: of the players who have visited N times, how many came
 * back for an N+1th? A visit is a *day* the device played on, which is the unit
 * that means "came back" in a game that resets at midnight.
 *
 * Built as tracks rather than a funnel, for the same reason `FinishRate` is: each
 * rung has its **own** denominator (the players who reached that many visits), so
 * the track is the cohort and the fill is the answer, and no row is the
 * always-full first bar a funnel wastes. Cohorts do shrink down the ladder, but
 * that's what the "17 of 50" reads say — encoding it as bar width too would
 * spend the axis on a number already written twice.
 *
 * The fill is **teal**, which already means "returning player" on the line chart
 * above and the player tiles. Not the kind palette (game mode) and not the event
 * palette (start/finish/share) — a third meaning on borrowed colours is how a
 * dashboard stops being readable.
 */
function RetentionCurve({ retention }: { retention: PlayerRetention }) {
  const { steps, windowDays } = retention;
  const lateTotal = steps.reduce((n, s) => n + s.lateReturned, 0);

  return (
    <div className="retention">
      {steps.map((s) => {
        // Everyone at this rung is still inside their window: there is no rate to
        // draw yet, and 0% would be an answer we haven't earned.
        const unanswered = s.atRisk === 0;
        const rest = [
          s.lateReturned > 0 ? `+${s.lateReturned} came back later` : null,
          s.pending > 0 ? `${s.pending} still in window` : null,
          !unanswered && s.atRisk < RETENTION_MIN_COHORT ? "small sample" : null,
        ].filter(Boolean) as string[];

        return (
          <div className="retention__row" key={s.visits}>
            <span className="retention__key">
              after {ordinal(s.visits)} visit
            </span>
            <div className="retention__body">
              <div className="retention__track">
                <span
                  className="retention__fill"
                  style={{ width: `${unanswered ? 0 : pct(s.returned, s.atRisk)}%` }}
                />
              </div>
              <p className="retention__legend">
                {unanswered ? (
                  <span className="retention__of">
                    Nobody's {windowDays} days are up yet — no rate to report.
                  </span>
                ) : (
                  <>
                    <span className="retention__dot" />
                    <strong className="retention__num">{pct(s.returned, s.atRisk)}%</strong> came back
                    <span className="retention__of">
                      {s.returned} of {s.atRisk} player{s.atRisk === 1 ? "" : "s"}
                    </span>
                  </>
                )}
                {rest.length > 0 && <span className="retention__rest">{rest.join(" · ")}</span>}
              </p>
            </div>
          </div>
        );
      })}
      <p className="dash-note">
        A “visit” is an ET day this device played on — any game kind, so four leftovers in one sitting is
        one visit, the way a diner counts covers and not courses. Each rung counts only players whose{" "}
        {windowDays} days are already up, so today's arrivals sit out rather than counting as no-shows
        {lateTotal > 0 &&
          `, and the ${lateTotal} who came back after their window closed are listed beside the rung they lapsed on`}
        .
      </p>
    </div>
  );
}

/** The two lines' colours for the new-vs-returning chart, matching admin.css. */
const PLAYER_SERIES: { key: "newPlayers" | "returningPlayers"; cls: string; label: string }[] = [
  { key: "newPlayers", cls: "new", label: "New players" },
  { key: "returningPlayers", cls: "returning", label: "Returning players" },
];

/**
 * Two-line SVG chart of new vs returning players per ET day.
 *
 * `player_id` shipped after launch (migrations/0008), so the earliest days here
 * recorded rounds but no players. Those days are **not** drawn as zeros — that
 * would assert "nobody new played" when the truth is "nobody was counting". They
 * get a hatched "not tracked" band instead, and the lines start at the boundary.
 *
 * The band rather than a shorter x-axis is deliberate: the Games-started spark
 * directly above spans the full range at the same width, so a series that quietly
 * began later would line up with it and read as the same days.
 */
function PlayerLineChart({ days, trackingStart }: { days: AnalyticsDay[]; trackingStart: string | null }) {
  const W = 660;
  const H = 190;
  const padL = 26;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const n = days.length;
  // Days carry null player counts until tracking started; everything from the
  // first non-null onward is measured (a measured day can legitimately be 0).
  const firstIdx = days.findIndex((d) => d.newPlayers !== null);
  const x = (i: number) =>
    n <= 1 ? padL + (W - padL - padR) / 2 : padL + (i / (n - 1)) * (W - padL - padR);

  if (firstIdx === -1) {
    return <p className="dash-note">{untrackedNote(trackingStart)}</p>;
  }

  const tracked = days.slice(firstIdx);
  const max = Math.max(1, ...tracked.map((d) => Math.max(d.newPlayers ?? 0, d.returningPlayers ?? 0)));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const path = (key: "newPlayers" | "returningPlayers") =>
    tracked
      .map((d, j) => `${j === 0 ? "M" : "L"}${x(j + firstIdx).toFixed(1)},${y(d[key] ?? 0).toFixed(1)}`)
      .join(" ");
  const xTickStep = Math.max(1, Math.ceil(n / 6));
  const yTicks = [...new Set([0, Math.round(max / 2), max])];
  // Where measurement begins. firstIdx 0 means the whole window is tracked.
  const boundaryX = x(firstIdx);
  const bandW = boundaryX - padL;
  const hasBand = firstIdx > 0 && bandW > 0;

  return (
    <div className="pchart">
      <div className="pchart__legend">
        {PLAYER_SERIES.map((s) => (
          <span className="pchart__legend-item" key={s.key}>
            <span className={`pchart__swatch pchart__swatch--${s.cls}`} />
            {s.label}
          </span>
        ))}
        {hasBand && (
          <span className="pchart__legend-item">
            <span className="pchart__swatch pchart__swatch--untracked" />
            Not tracked
          </span>
        )}
      </div>
      <svg
        className="pchart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          hasBand
            ? `New vs returning players per day. Not tracked before ${days[firstIdx].date}.`
            : "New vs returning players per day"
        }
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="pchart-hatch" width="6" height="6" patternUnits="userSpaceOnUse">
            <path className="pchart__hatch" d="M0,6 l6,-6" />
          </pattern>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="pchart__grid" x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} />
            <text className="pchart__axis" x={padL - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {v}
            </text>
          </g>
        ))}
        {hasBand && (
          <>
            {/* No line is drawn over this span — the metric didn't exist yet. */}
            <rect
              className="pchart__untracked"
              x={padL}
              y={padT}
              width={bandW}
              height={H - padT - padB}
              fill="url(#pchart-hatch)"
            >
              <title>{untrackedNote(trackingStart)}</title>
            </rect>
            <line className="pchart__boundary" x1={boundaryX} y1={padT} x2={boundaryX} y2={H - padB} />
            {bandW >= 70 && (
              <text className="pchart__untracked-label" x={padL + bandW / 2} y={padT + 14} textAnchor="middle">
                not tracked
              </text>
            )}
          </>
        )}
        {PLAYER_SERIES.map((s) => (
          <path key={s.key} className={`pchart__line pchart__line--${s.cls}`} d={path(s.key)} fill="none" />
        ))}
        {n <= 45 &&
          PLAYER_SERIES.map((s) =>
            tracked.map((d, j) => (
              <circle
                key={`${s.key}-${d.date}`}
                className={`pchart__dot pchart__dot--${s.cls}`}
                cx={x(j + firstIdx)}
                cy={y(d[s.key] ?? 0)}
                r={2.6}
              >
                <title>{`${d.date} · ${d[s.key]} ${s.label.toLowerCase()}`}</title>
              </circle>
            )),
          )}
        {days.map((d, i) =>
          i % xTickStep === 0 || i === n - 1 ? (
            <text key={d.date} className="pchart__axis" x={x(i)} y={H - 6} textAnchor="middle">
              {shortDate(d.date)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/**
 * Everything that moves over time: games started per day (stacked by kind), new
 * vs returning players, the hour-of-day profile, and the day-by-day table the
 * charts summarise. Single-service detail lives in the Players tab.
 */
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

  const { totals, players, daily, hourly, playerTrackingStart, retention } = data;
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
  const hourMax = Math.max(1, ...hourly);
  const peakHour = hourly.indexOf(Math.max(...hourly));
  // Most recent days first for the breakdown table.
  const recentDays = [...daily].reverse();
  const span = `last ${daily.length} day${daily.length === 1 ? "" : "s"}`;
  const headline = retention && retentionNote(retention.steps, retention.windowDays);

  return (
    <>
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

      <section className="panel">
        <h2>New vs returning players · {span}</h2>
        {daily.length === 0 ? (
          <p className="dash-note">No dated activity yet.</p>
        ) : (
          <>
            <PlayerLineChart days={daily} trackingStart={playerTrackingStart} />
            <p className="dash-note" style={{ marginTop: 8 }}>
              {players === null ? (
                untrackedNote(playerTrackingStart)
              ) : (
                <>
                  {players.new} player{players.new === 1 ? "" : "s"} all time · {players.returning} ha
                  {players.returning === 1 ? "s" : "ve"} come back on a later day. A “player” is an anonymous
                  device (localStorage), counted once regardless of game kind.
                </>
              )}
            </p>
            {/* The instrument switched on mid-life, so the first tracked days are
                biased as well as the untracked ones are missing: anyone who had
                already played reappears as "new". Say so rather than let the
                boundary spike read as a launch. */}
            {playerTrackingStart && daily.length > 0 && daily[0].newPlayers === null && (
              <p className="dash-note">
                Player tracking started {playerTrackingStart}; the shaded span ran before it and wasn't
                measured. Devices that had already played count as “new” on their first tracked day, so
                “new” is overstated and “returning” understated around {playerTrackingStart}.
              </p>
            )}
          </>
        )}
      </section>

      {/* Sits under new-vs-returning because it's the same question asked
          deeper: that chart counts how many came back, this one asks how likely
          it was — and unlike the chart, it's all-time, not the last 30 days. */}
      <section className="panel">
        <h2>Repeat visits</h2>
        {retention === null || retention.steps.length === 0 ? (
          <p className="dash-note">{untrackedNote(playerTrackingStart)}</p>
        ) : (
          <>
            {headline && <p className="retention__headline">{headline}</p>}
            <RetentionCurve retention={retention} />
          </>
        )}
      </section>

      <section className="panel">
        <h2>Games started by hour · ET{totals.started > 0 && ` · peak ${String(peakHour).padStart(2, "0")}:00`}</h2>
        <div className="hourly">
          {hourly.map((n, h) => (
            <div className="hourly__col" key={h} title={`${String(h).padStart(2, "0")}:00 ET — ${n} started`}>
              {n > 0 && <span className="hourly__num">{n}</span>}
              <span className="hourly__bar" style={{ height: `${n === 0 ? 0 : 6 + (n / hourMax) * 94}%` }} />
              {h % 6 === 0 && <span className="hourly__tick">{String(h).padStart(2, "0")}</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Daily breakdown · {span}</h2>
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
                    <td title={d.newPlayers === null ? untrackedNote(playerTrackingStart) : undefined}>
                      {d.newPlayers ?? "—"}
                    </td>
                    <td title={d.returningPlayers === null ? untrackedNote(playerTrackingStart) : undefined}>
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
      </section>
    </>
  );
}
