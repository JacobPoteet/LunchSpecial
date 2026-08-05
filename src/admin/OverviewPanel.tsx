import { useEffect, useState } from "react";
import type { AdminDashboard, AnalyticsSummary, DashboardSpecial } from "../../shared/types";
import { gameHour, hms, msUntilGameMidnight } from "../../shared/time";
import type { AdminView } from "./AdminApp";
import { AUDIENCE_LABEL } from "./AnnouncementsPanel";
import type { DashboardTab } from "./Dashboard";
import {
  DNF_NOTE,
  FinishRate,
  HourlyByKind,
  KindLegend,
  ago,
  difficultyNote,
  hourLabel,
  noRoundsNote,
  paceNote,
  pct,
  shortDate,
  sumKinds,
  untrackedNote,
  type SurfaceFilter,
} from "./analyticsUi";

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
 * A minute-resolution clock for the parts of the panel that go stale on their
 * own — the "last order 4m ago" read, and the current-ET-hour boundary the
 * hourly chart and the pace comparison both hinge on. One ticker for all three
 * so they can't disagree about what time it is.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Two reads on the numbers: the day the Players tab is pointed at, then the
 * all-time running total under it. Enough to know whether anything needs
 * looking at, with a link through to the detail rather than a wall of charts on
 * the landing tab.
 *
 * The day half is deliberately the fuller one. All-time totals only ever creep,
 * so they're a strip of four tiles; today is what you'd actually act on, so it
 * gets the tiles *plus* the three questions a bare count can't answer — is this
 * busy for us (pace), is the puzzle fair (difficulty), and are the beacons even
 * arriving (last order).
 */
function AtAGlance({
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
  const now = useNow();
  const detail = (
    <button className="link-btn" onClick={() => onOpenTab("players")}>
      Full breakdown
    </button>
  );

  if (error) {
    return (
      <section className="panel">
        <h2>At a glance</h2>
        <p className="dash-note">Couldn't load analytics: {error}</p>
      </section>
    );
  }
  if (!analytics) {
    return (
      <section className="panel">
        <h2>At a glance</h2>
        <p className="dash-note">Counting the receipts…</p>
      </section>
    );
  }

  const { day, today, totals, startedByKind, guessDistribution, players, playerTrackingStart } = analytics;
  // The Players tab can point the shared fetch at an earlier service; say so
  // rather than mislabeling someone else's day as "today".
  const isToday = day.date === today;
  const startedAny = sumKinds(day.startedByKind);
  // Every hour of a finished day is a real measurement; only *today* has hours
  // that simply haven't happened yet, so only today gets a "now" boundary.
  const nowHour = gameHour(new Date(now));
  const pace = paceNote({ pace: day.pace, hours: day.hourly, isToday, dayStarted: startedAny, nowHour });
  const difficulty = difficultyNote(day.guessDistribution, guessDistribution, isToday);
  const peakHour = day.hourly.reduce((best, h) => (sumKinds(h.startedByKind) > sumKinds(day.hourly[best].startedByKind) ? h.hour : best), 0);

  return (
    <section className="panel">
      <div className="analytics-head">
        <h2>At a glance</h2>
        {detail}
      </div>
      {totals.started === 0 ? (
        <p className="dash-note">{noRoundsNote(surface)}</p>
      ) : (
        <>
          <h3 className="dash-subhead">
            {isToday ? "Today" : day.date}
            {day.dishName && ` · ${day.dishName}`}
          </h3>
          {startedAny === 0 ? (
            <p className="dash-note" style={{ marginBottom: 16 }}>
              {isToday
                ? "No plays recorded for today yet — check back once the diner fills up."
                : `Nobody played on ${day.date}.`}
            </p>
          ) : (
            <>
              <div className="metric-row">
                <div className="metric metric--primary">
                  <span className="metric__num">{startedAny}</span>
                  <span className="metric__label">Games started</span>
                </div>
                <div className="metric">
                  <span className="metric__num">{day.startedByKind.daily}</span>
                  <span className="metric__label">The Special</span>
                </div>
                {/* All kinds, unlike Win rate — a leftover played through still
                    counts as a game finished, and the Special-only totals can't
                    see it. The players who *didn't* finish are the DNF figure
                    under the Finishing bar; the tile leads with the ones who did. */}
                <div
                  className="metric"
                  title={`Games started today that reached game over — all game modes. ${DNF_NOTE}`}
                >
                  <span className="metric__num">{day.allKinds.completed}</span>
                  <span className="metric__label">Finished</span>
                </div>
                <div className="metric" title="The Special only — replays and Chef's Choice don't dilute the puzzle's own win rate.">
                  <span className="metric__num">{pct(day.totals.solved, day.totals.completed)}%</span>
                  <span className="metric__label">Win rate</span>
                </div>
                {/* "—" when the day predates player tracking: unmeasured, not zero. */}
                <div className="metric metric--player metric--player-new" title={day.players === null ? untrackedNote(playerTrackingStart) : undefined}>
                  <span className="metric__num">{day.players?.new ?? "—"}</span>
                  <span className="metric__label">New players</span>
                </div>
                <div className="metric metric--player metric--player-returning" title={day.players === null ? untrackedNote(playerTrackingStart) : undefined}>
                  <span className="metric__num">{day.players?.returning ?? "—"}</span>
                  <span className="metric__label">Returning</span>
                </div>
              </div>

              {/* The three reads a bare count can't give you. Each is omitted
                  rather than faked when its input isn't there — no baseline yet,
                  no solves yet, nothing started yet. */}
              {(pace || difficulty || day.lastStartedAt) && (
                <ul className="dash-reads">
                  {pace && <li>{pace}</li>}
                  {difficulty && <li>{difficulty}</li>}
                  {day.lastStartedAt && (
                    <li>
                      Last order {ago(new Date(day.lastStartedAt).getTime(), now)}
                      {isToday && " · beacons arriving"}.
                    </li>
                  )}
                </ul>
              )}

              <div className="analytics-block">
                <h3 className="analytics-sub">Finishing</h3>
                <FinishRate totals={day.allKinds} />
              </div>

              <div className="analytics-block">
                <h3 className="analytics-sub">
                  Started by hour · ET · peak {hourLabel(peakHour)}
                </h3>
                <KindLegend />
                <HourlyByKind hours={day.hourly} nowHour={isToday ? nowHour : null} />
                {isToday && (
                  <p className="dash-note hourly__caption">
                    Faded hours are still ahead of us — not hours nobody played.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Every round ever recorded, on whichever surface is selected — the
              running total the day slice above is one slice of. */}
          <h3 className="dash-subhead">All time</h3>
          <div className="metric-row" style={{ marginBottom: 0 }}>
            <div className="metric metric--primary">
              <span className="metric__num">{totals.started}</span>
              <span className="metric__label">Games played</span>
            </div>
            <div className="metric">
              <span className="metric__num">{startedByKind.daily}</span>
              <span className="metric__label">The Special</span>
            </div>
            <div className="metric">
              <span className="metric__num">{pct(totals.solved, totals.completed)}%</span>
              <span className="metric__label">Win rate</span>
            </div>
            <div
              className="metric"
              title={
                players === null
                  ? untrackedNote(playerTrackingStart)
                  : playerTrackingStart
                    ? `Distinct devices since ${playerTrackingStart}, when player tracking shipped.`
                    : undefined
              }
            >
              <span className="metric__num">{players?.new ?? "—"}</span>
              <span className="metric__label">Players</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Tomorrow's booking. An empty day isn't fatal — the game falls back to a
 * deterministic pick and never 404s — but it's the one gap you'd want to fill
 * before it becomes today, so it warns.
 */
function TomorrowsSpecial({
  tomorrow,
  onNavigate,
  onOpenDish,
}: {
  tomorrow: DashboardSpecial;
  onNavigate: (view: AdminView) => void;
  onOpenDish: (id: number | null) => void;
}) {
  return (
    <section className={tomorrow.dishName ? "panel" : "panel panel--warn"}>
      <h2>Tomorrow's Special</h2>
      {tomorrow.dishName ? (
        <>
          <p className="dash-big">{tomorrow.dishName}</p>
          <p className="dash-note">Serving on {tomorrow.date}</p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn--ghost" onClick={() => onOpenDish(tomorrow.dishId)}>
              Edit dish
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="dash-big">Nothing booked</p>
          <p className="dash-note">
            {tomorrow.date} would run on the automatic fallback pick. Book it before it becomes today.
          </p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => onNavigate("schedule")}>
              Open schedule
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * What the kitchen is currently telling players, straight from the notice
 * window rules — live notices first, then whatever is booked behind them.
 */
function OnTheBoard({
  live,
  upcoming,
  onNavigate,
}: {
  live: AdminDashboard["liveAnnouncements"];
  upcoming: number;
  onNavigate: (view: AdminView) => void;
}) {
  const booked = upcoming > 0 ? `${upcoming} booked and waiting.` : null;
  return (
    <section className="panel">
      {/* Full-width row, so the title keeps its button company on the right and
          the notices spread across the width instead of stacking in a column. */}
      <div className="analytics-head">
        <h2>
          On the board
          {live.length > 0 && (
            <span className="dash-count">
              {live.length} live notice{live.length === 1 ? "" : "s"}
            </span>
          )}
        </h2>
        <button className="btn btn--ghost" onClick={() => onNavigate("announcements")}>
          Announcements
        </button>
      </div>
      {live.length === 0 ? (
        <p className="dash-note">
          {booked ?? "No live notices — nothing is showing on Today's Special right now."}
        </p>
      ) : (
        <>
          <ul className="dash-list">
            {live.map((a) => (
              <li key={a.id}>
                <strong>{a.header}</strong>
                <span className="dash-list__meta">
                  {AUDIENCE_LABEL[a.audience]} · through {shortDate(a.endDate)}
                </span>
              </li>
            ))}
          </ul>
          {booked && <p className="dash-note">{booked}</p>}
        </>
      )}
    </section>
  );
}

/**
 * The dashboard's landing tab, read top to bottom: what's out there right now
 * (today, tomorrow, the schedule behind them, what the kitchen is telling
 * players), then the numbers, then what's broken. Every chart lives one tab over.
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

        <TomorrowsSpecial tomorrow={data.tomorrow} onNavigate={onNavigate} onOpenDish={onOpenDish} />

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
      </div>

      <OnTheBoard
        live={data.liveAnnouncements}
        upcoming={data.upcomingAnnouncements}
        onNavigate={onNavigate}
      />

      <AtAGlance
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
