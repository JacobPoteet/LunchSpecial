import { useEffect, useState } from "react";
import type {
  AnalyticsDay,
  AnalyticsPeriod,
  AnalyticsSummary,
  PlayerSplit,
  RoundKind,
  StartedByKind,
} from "../../shared/types";
import type { AdminDashboard } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";
import { hms, msUntilGameMidnight } from "../../shared/time";
import * as api from "./api";
import type { AdminView } from "./AdminApp";

const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));

/**
 * The three game kinds, in display order. The first (daily) is the priority
 * metric — "Today's Special". `cls` ties each to its bar colour in admin.css.
 */
const KIND_META: { key: RoundKind; label: string; cls: string }[] = [
  { key: "daily", label: "Today's Special", cls: "daily" },
  { key: "leftover", label: "Leftovers", cls: "leftover" },
  { key: "random", label: "Chef's Choice", cls: "random" },
];

const sumKinds = (s: StartedByKind) => s.daily + s.leftover + s.random;

/** "2026-07-19" → "7/19" for compact axis labels (parsed as plain digits, no timezone). */
const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
};

/** Live countdown to the next midnight-ET rollover, when today's Special switches. */
function SwitchCountdown() {
  const [ms, setMs] = useState(() => msUntilGameMidnight());
  useEffect(() => {
    const t = setInterval(() => setMs(msUntilGameMidnight()), 1000);
    return () => clearInterval(t);
  }, []);
  const { h, m, s } = hms(ms);
  return (
    <p className="dash-note">
      Switches in{" "}
      <strong>
        {h}:{m}:{s}
      </strong>{" "}
      · midnight ET
    </p>
  );
}

/** Mean guesses across solved rounds, or null when nothing has been solved yet. */
function avgGuesses(dist: number[]): number | null {
  const solved = dist.reduce((a, b) => a + b, 0);
  if (solved === 0) return null;
  return dist.reduce((sum, n, i) => sum + n * (i + 1), 0) / solved;
}

/**
 * Games started, split into the three kinds — Today's Special (the priority
 * metric, shown first and emphasised), Leftovers, and Chef's Choice. Each tile
 * carries the colour of its bar-graph segment.
 */
function StartedByKindRow({ startedByKind }: { startedByKind: StartedByKind }) {
  return (
    <div className="metric-row metric-row--kinds">
      {KIND_META.map((k, i) => (
        <div
          className={`metric metric--kind metric--kind-${k.cls}${i === 0 ? " metric--primary" : ""}`}
          key={k.key}
        >
          <span className="metric__num">{startedByKind[k.key]}</span>
          <span className="metric__label">{k.label} started</span>
        </div>
      ))}
    </div>
  );
}

/** Completion / win / share rates for a slice of rounds. */
function RatesRow({ totals }: { totals: AnalyticsPeriod["totals"] }) {
  return (
    <div className="metric-row">
      <div className="metric">
        <span className="metric__num">{pct(totals.completed, totals.started)}%</span>
        <span className="metric__label">Completion</span>
      </div>
      <div className="metric">
        <span className="metric__num">{pct(totals.solved, totals.completed)}%</span>
        <span className="metric__label">Win rate</span>
      </div>
      <div className="metric">
        <span className="metric__num">{pct(totals.shared, totals.completed)}%</span>
        <span className="metric__label">Share rate</span>
      </div>
    </div>
  );
}

/**
 * New vs returning player tiles. A "player" is an anonymous device; new = first
 * play ever, returning = played on an earlier day too.
 */
function PlayersRow({ players }: { players: PlayerSplit }) {
  return (
    <div className="metric-row">
      <div className="metric metric--player metric--player-new">
        <span className="metric__num">{players.new}</span>
        <span className="metric__label">New players</span>
      </div>
      <div className="metric metric--player metric--player-returning">
        <span className="metric__num">{players.returning}</span>
        <span className="metric__label">Returning players</span>
      </div>
    </div>
  );
}

/** The two lines' colours for the new-vs-returning chart, matching admin.css. */
const PLAYER_SERIES: { key: "newPlayers" | "returningPlayers"; cls: string; label: string }[] = [
  { key: "newPlayers", cls: "new", label: "New players" },
  { key: "returningPlayers", cls: "returning", label: "Returning players" },
];

/** Two-line SVG chart of new vs returning players per ET day (all time). */
function PlayerLineChart({ days }: { days: AnalyticsDay[] }) {
  const W = 660;
  const H = 190;
  const padL = 26;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const n = days.length;
  const max = Math.max(1, ...days.map((d) => Math.max(d.newPlayers, d.returningPlayers)));
  const x = (i: number) =>
    n <= 1 ? padL + (W - padL - padR) / 2 : padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const path = (key: "newPlayers" | "returningPlayers") =>
    days.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const xTickStep = Math.max(1, Math.ceil(n / 6));
  const yTicks = [...new Set([0, Math.round(max / 2), max])];

  return (
    <div className="pchart">
      <div className="pchart__legend">
        {PLAYER_SERIES.map((s) => (
          <span className="pchart__legend-item" key={s.key}>
            <span className={`pchart__swatch pchart__swatch--${s.cls}`} />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        className="pchart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="New vs returning players per day"
        preserveAspectRatio="none"
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line className="pchart__grid" x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} />
            <text className="pchart__axis" x={padL - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {v}
            </text>
          </g>
        ))}
        {PLAYER_SERIES.map((s) => (
          <path key={s.key} className={`pchart__line pchart__line--${s.cls}`} d={path(s.key)} fill="none" />
        ))}
        {n <= 45 &&
          PLAYER_SERIES.map((s) =>
            days.map((d, i) => (
              <circle
                key={`${s.key}-${d.date}`}
                className={`pchart__dot pchart__dot--${s.cls}`}
                cx={x(i)}
                cy={y(d[s.key])}
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

/** The colour key shared by the started-by-kind tiles and the daily bar graph. */
function KindLegend() {
  return (
    <div className="kind-legend">
      {KIND_META.map((k) => (
        <span className="kind-legend__item" key={k.key}>
          <span className={`kind-legend__dot kind-legend__dot--${k.cls}`} />
          {k.label}
        </span>
      ))}
    </div>
  );
}

/** Horizontal guess-distribution bars: 1..MAX_GUESSES wins plus a Fail bucket. */
function GuessBars({ dist, fails }: { dist: number[]; fails: number }) {
  const buckets = [...dist.map((n, i) => ({ label: String(i + 1), n })), { label: "X", n: fails }];
  const max = Math.max(1, ...buckets.map((b) => b.n));
  return (
    <div className="gd">
      {buckets.map((b) => (
        <div className="gd__row" key={b.label}>
          <span className="gd__key">{b.label}</span>
          <span className="gd__bar" style={{ width: `${8 + (b.n / max) * 92}%` }}>
            {b.n}
          </span>
        </div>
      ))}
    </div>
  );
}

function EngagementPanel() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAnalytics().then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <section className="panel">
        <h2>Player engagement</h2>
        <p className="dash-note">Couldn't load analytics: {error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="panel">
        <h2>Player engagement</h2>
        <p className="dash-note">Counting the receipts…</p>
      </section>
    );
  }

  const { totals, startedByKind, guessDistribution, fails, players, today, daily, hourly } = data;
  if (totals.started === 0) {
    return (
      <section className="panel">
        <h2>Player engagement</h2>
        <p className="dash-note">No rounds recorded yet. Numbers show up here once players start playing.</p>
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

  const allTimeAvg = avgGuesses(guessDistribution);
  const todayAvg = avgGuesses(today.guessDistribution);
  // Positive delta = today needs more guesses than usual (harder than average).
  const avgDelta = todayAvg !== null && allTimeAvg !== null ? todayAvg - allTimeAvg : null;

  // Any game started today (across all three kinds), vs. today's Special alone.
  const todayStartedAny = sumKinds(today.startedByKind);

  return (
    <section className="panel">
      <h2>Player engagement</h2>

      <h3 className="analytics-sub">
        Today's Special · {today.dishName ?? today.date}
        {today.dishName && ` · ${today.date}`}
      </h3>
      {todayStartedAny === 0 ? (
        <p className="dash-note">No plays recorded for today yet — check back once the diner fills up.</p>
      ) : (
        <>
          {/* Games started today, split by kind — Today's Special leads. */}
          <StartedByKindRow startedByKind={today.startedByKind} />
          {today.totals.started === 0 ? (
            <p className="dash-note">
              Only leftovers and chef's specials so far today — Today's Special hasn't been played yet.
            </p>
          ) : (
            <RatesRow totals={today.totals} />
          )}
          {/* New vs returning players today (all kinds, one count per device). */}
          <PlayersRow players={today.players} />
          <div className="analytics-split">
            <div>
              <h3 className="analytics-sub">Guess distribution · today's Special</h3>
              <GuessBars dist={today.guessDistribution} fails={today.fails} />
            </div>
            <div>
              <h3 className="analytics-sub">Average guesses</h3>
              <div className="metric-row" style={{ marginBottom: 0 }}>
                <div className="metric">
                  <span className="metric__num">{todayAvg === null ? "—" : todayAvg.toFixed(2)}</span>
                  <span className="metric__label">Today</span>
                </div>
                <div className="metric">
                  <span className="metric__num">{allTimeAvg === null ? "—" : allTimeAvg.toFixed(2)}</span>
                  <span className="metric__label">All time</span>
                </div>
              </div>
              {avgDelta !== null && (
                <p className="dash-note" style={{ marginTop: 8 }}>
                  {Math.abs(avgDelta) < 0.005
                    ? "Right on the all-time average."
                    : `${avgDelta > 0 ? "▲" : "▼"} ${Math.abs(avgDelta).toFixed(2)} ${
                        avgDelta > 0 ? "more" : "fewer"
                      } guesses than average — today's Special is playing ${avgDelta > 0 ? "harder" : "easier"}.`}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <hr className="analytics-rule" />

      <h3 className="analytics-sub">All time</h3>
      {/* Games started across the game's life, Today's Special first. */}
      <StartedByKindRow startedByKind={startedByKind} />
      <RatesRow totals={totals} />

      <div className="analytics-split">
        <div>
          <h3 className="analytics-sub">Guess distribution</h3>
          <GuessBars dist={guessDistribution} fails={fails} />
        </div>

        <div>
          <h3 className="analytics-sub">Games started · last {daily.length} day{daily.length === 1 ? "" : "s"}</h3>
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
        </div>
      </div>

      <div className="analytics-block">
        <h3 className="analytics-sub">
          New vs returning players · last {daily.length} day{daily.length === 1 ? "" : "s"}
        </h3>
        {daily.length === 0 ? (
          <p className="dash-note">No dated activity yet.</p>
        ) : (
          <>
            <PlayerLineChart days={daily} />
            <p className="dash-note" style={{ marginTop: 8 }}>
              {players.new} player{players.new === 1 ? "" : "s"} all time · {players.returning} ha
              {players.returning === 1 ? "s" : "ve"} come back on a later day. A “player” is an anonymous
              device (localStorage), counted once regardless of game kind.
            </p>
          </>
        )}
      </div>

      <div className="analytics-block">
        <h3 className="analytics-sub">
          Games started by hour · ET{totals.started > 0 && ` · peak ${String(peakHour).padStart(2, "0")}:00`}
        </h3>
        <div className="hourly">
          {hourly.map((n, h) => (
            <div className="hourly__col" key={h} title={`${String(h).padStart(2, "0")}:00 ET — ${n} started`}>
              {n > 0 && <span className="hourly__num">{n}</span>}
              <span className="hourly__bar" style={{ height: `${n === 0 ? 0 : 6 + (n / hourMax) * 94}%` }} />
              {h % 6 === 0 && <span className="hourly__tick">{String(h).padStart(2, "0")}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="analytics-block">
        <h3 className="analytics-sub">Daily breakdown · last {daily.length} day{daily.length === 1 ? "" : "s"}</h3>
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
                    <td>{d.newPlayers}</td>
                    <td>{d.returningPlayers}</td>
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
      </div>

      <p className="dash-note" style={{ marginTop: 10 }}>
        Anonymous counts only — {MAX_GUESSES} guesses max, no record of which dishes players ordered.
      </p>
    </section>
  );
}

export default function Dashboard({
  onNavigate,
  onOpenDish,
}: {
  onNavigate: (view: AdminView) => void;
  onOpenDish: (id: number | null) => void;
}) {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDashboard().then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p style={{ color: "var(--cream)" }}>Loading the front of house…</p>;

  const lowSchedule = data.scheduledAhead < 7;

  return (
    <>
      <div className="dash-grid">
        <section className="panel">
          <h2>Today's Special</h2>
          {data.today.dishName ? (
            <>
              <p className="dash-big">{data.today.dishName}</p>
              <p className="dash-note">Serving on {data.today.date}</p>
              <SwitchCountdown />
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn btn--ghost" onClick={() => onOpenDish(data.today.dishId)}>
                  Edit dish
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="dash-big">Nothing scheduled!</p>
              <p className="dash-note">
                Players will get an automatic fallback dish today. Assign one in the schedule.
              </p>
              <SwitchCountdown />
            </>
          )}
        </section>

        <section className={lowSchedule ? "panel panel--warn" : "panel"}>
          <h2>Schedule health</h2>
          <p className="dash-big">
            {data.scheduledAhead} day{data.scheduledAhead === 1 ? "" : "s"} ahead
          </p>
          <p className="dash-note">
            {data.firstGap ? `First empty day: ${data.firstGap}` : "Next 60 days fully booked"}
            {lowSchedule && " — time to fill the board!"}
          </p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => onNavigate("schedule")}>
              Open schedule
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Quick actions</h2>
          <div className="btn-row">
            <button className="btn btn--red" onClick={() => onOpenDish(null)}>
              + New dish
            </button>
            <button className="btn btn--ghost" onClick={() => onNavigate("dishes")}>
              All dishes
            </button>
          </div>
        </section>
      </div>

      <section className={data.warnings.length > 0 ? "panel panel--warn" : "panel"}>
        <h2>Content warnings</h2>
        {data.warnings.length === 0 ? (
          <p className="dash-note">All dishes are complete. Sparkling clean kitchen.</p>
        ) : (
          <ul className="warning-list">
            {data.warnings.map((w) => (
              <li key={`${w.kind}-${w.dishId}`}>
                <span>
                  <strong>{w.dishName}</strong> — {w.kind === "missing-clues" ? "clues incomplete" : "too few ingredients"} ({w.detail})
                </span>
                <button className="btn btn--ghost" onClick={() => onOpenDish(w.dishId)}>
                  Fix
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EngagementPanel />
    </>
  );
}
