import { useEffect, useState } from "react";
import type { AdminDashboard, AnalyticsSummary } from "../../shared/types";
import { hms, msUntilGameMidnight } from "../../shared/time";
import type { AdminView } from "./AdminApp";
import type { DashboardTab } from "./Dashboard";
import { noRoundsNote, pct, sumKinds, type SurfaceFilter } from "./analyticsUi";

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

/**
 * The headline numbers for the day the Players tab is pointed at — enough to
 * know whether anything needs looking at, with a link through to the detail
 * rather than a wall of charts on the landing tab.
 */
function TodayAtAGlance({
  analytics,
  error,
  surface,
  onOpenTab,
}: {
  analytics: AnalyticsSummary | null;
  error: string | null;
  surface: SurfaceFilter;
  onOpenTab: (tab: DashboardTab) => void;
}) {
  const detail = (
    <button className="link-btn" onClick={() => onOpenTab("players")}>
      Full breakdown
    </button>
  );

  if (error) {
    return (
      <section className="panel">
        <h2>Today at a glance</h2>
        <p className="dash-note">Couldn't load analytics: {error}</p>
      </section>
    );
  }
  if (!analytics) {
    return (
      <section className="panel">
        <h2>Today at a glance</h2>
        <p className="dash-note">Counting the receipts…</p>
      </section>
    );
  }

  const { day, today } = analytics;
  // The Players tab can point the shared fetch at an earlier service; say so
  // rather than mislabeling someone else's day as "today".
  const isToday = day.date === today;
  const startedAny = sumKinds(day.startedByKind);

  return (
    <section className="panel">
      <div className="analytics-head">
        <h2>{isToday ? "Today at a glance" : `${day.date} at a glance`}</h2>
        {detail}
      </div>
      {startedAny === 0 ? (
        <p className="dash-note">
          {analytics.totals.started === 0
            ? noRoundsNote(surface)
            : isToday
              ? "No plays recorded for today yet — check back once the diner fills up."
              : `Nobody played on ${day.date}.`}
        </p>
      ) : (
        <div className="metric-row">
          <div className="metric metric--primary">
            <span className="metric__num">{startedAny}</span>
            <span className="metric__label">Games started</span>
          </div>
          <div className="metric">
            <span className="metric__num">{day.startedByKind.daily}</span>
            <span className="metric__label">The Special</span>
          </div>
          <div className="metric">
            <span className="metric__num">{pct(day.totals.solved, day.totals.completed)}%</span>
            <span className="metric__label">Win rate</span>
          </div>
          <div className="metric">
            <span className="metric__num">{day.players.new}</span>
            <span className="metric__label">New players</span>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The dashboard's landing tab: what needs a decision today (the Special, the
 * schedule, incomplete dishes) plus a four-number read on how the day is going.
 * Every chart lives one tab over.
 */
export default function OverviewPanel({
  data,
  error,
  analytics,
  analyticsError,
  surface,
  onNavigate,
  onOpenDish,
  onOpenTab,
}: {
  data: AdminDashboard | null;
  error: string | null;
  analytics: AnalyticsSummary | null;
  analyticsError: string | null;
  surface: SurfaceFilter;
  onNavigate: (view: AdminView) => void;
  onOpenDish: (id: number | null) => void;
  onOpenTab: (tab: DashboardTab) => void;
}) {
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

      <TodayAtAGlance
        analytics={analytics}
        error={analyticsError}
        surface={surface}
        onOpenTab={onOpenTab}
      />

      <section className={data.warnings.length > 0 ? "panel panel--warn" : "panel"}>
        <h2>Content warnings</h2>
        {data.warnings.length === 0 ? (
          <p className="dash-note">All dishes are complete. Sparkling clean kitchen.</p>
        ) : (
          <ul className="warning-list">
            {data.warnings.map((w) => (
              <li key={`${w.kind}-${w.dishId}`}>
                <span>
                  <strong>{w.dishName}</strong> —{" "}
                  {w.kind === "missing-clues" ? "clues incomplete" : "too few ingredients"} ({w.detail})
                </span>
                <button className="btn btn--ghost" onClick={() => onOpenDish(w.dishId)}>
                  Fix
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
