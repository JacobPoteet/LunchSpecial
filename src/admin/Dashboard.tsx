import { useEffect, useState } from "react";
import type { AnalyticsPeriod, AnalyticsSummary } from "../../shared/types";
import type { AdminDashboard } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";
import * as api from "./api";
import type { AdminView } from "./AdminApp";

const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));

/** Mean guesses across solved rounds, or null when nothing has been solved yet. */
function avgGuesses(dist: number[]): number | null {
  const solved = dist.reduce((a, b) => a + b, 0);
  if (solved === 0) return null;
  return dist.reduce((sum, n, i) => sum + n * (i + 1), 0) / solved;
}

function MetricRow({ totals }: { totals: AnalyticsPeriod["totals"] }) {
  return (
    <div className="metric-row">
      <div className="metric">
        <span className="metric__num">{totals.started}</span>
        <span className="metric__label">Games started</span>
      </div>
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

  const { totals, guessDistribution, fails, today, daily, hourly } = data;
  if (totals.started === 0) {
    return (
      <section className="panel">
        <h2>Player engagement</h2>
        <p className="dash-note">No rounds recorded yet. Numbers show up here once players start playing.</p>
      </section>
    );
  }

  const dayMax = Math.max(1, ...daily.map((d) => d.started));
  const hourMax = Math.max(1, ...hourly);
  const peakHour = hourly.indexOf(Math.max(...hourly));
  // Most recent days first for the breakdown table.
  const recentDays = [...daily].reverse();

  const allTimeAvg = avgGuesses(guessDistribution);
  const todayAvg = avgGuesses(today.guessDistribution);
  // Positive delta = today needs more guesses than usual (harder than average).
  const avgDelta = todayAvg !== null && allTimeAvg !== null ? todayAvg - allTimeAvg : null;

  return (
    <section className="panel">
      <h2>Player engagement</h2>

      <h3 className="analytics-sub">
        Today's Special · {today.dishName ?? today.date}
        {today.dishName && ` · ${today.date}`}
      </h3>
      {today.totals.started === 0 ? (
        <p className="dash-note">No plays recorded for today yet — check back once the diner fills up.</p>
      ) : (
        <>
          <MetricRow totals={today.totals} />
          <div className="analytics-split">
            <div>
              <h3 className="analytics-sub">Guess distribution · today</h3>
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
      <MetricRow totals={totals} />

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
            <div className="spark">
              {daily.map((d) => (
                <div className="spark__col" key={d.date} title={`${d.date}: ${d.started} started, ${d.solved} solved`}>
                  <span className="spark__num">{d.started}</span>
                  <span className="spark__bar" style={{ height: `${6 + (d.started / dayMax) * 94}%` }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="analytics-block">
        <h3 className="analytics-sub">
          Games started by hour · UTC{totals.started > 0 && ` · peak ${String(peakHour).padStart(2, "0")}:00`}
        </h3>
        <div className="hourly">
          {hourly.map((n, h) => (
            <div className="hourly__col" key={h} title={`${String(h).padStart(2, "0")}:00 UTC — ${n} started`}>
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
