import type { AnalyticsDay, AnalyticsSummary } from "../../shared/types";
import { KIND_META, KindLegend, noRoundsNote, pct, shortDate, type SurfaceFilter } from "./analyticsUi";

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

  const { totals, players, daily, hourly } = data;
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
            <PlayerLineChart days={daily} />
            <p className="dash-note" style={{ marginTop: 8 }}>
              {players.new} player{players.new === 1 ? "" : "s"} all time · {players.returning} ha
              {players.returning === 1 ? "s" : "ve"} come back on a later day. A “player” is an anonymous
              device (localStorage), counted once regardless of game kind.
            </p>
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
      </section>
    </>
  );
}
