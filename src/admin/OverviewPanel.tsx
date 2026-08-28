import { useEffect, useState } from "react";
import * as api from "./api";
import type { AdminDashboard, AnalyticsSummary, DashboardSpecial } from "../../shared/types";
import { PLAYTIME_CAP_MINUTES } from "../../shared/types";
import { gameHour, hms, msUntilGameMidnight } from "../../shared/time";
import type { AdminView } from "./AdminApp";
import { AUDIENCE_LABEL } from "./AnnouncementsPanel";
import type { DashboardTab } from "./Dashboard";
import {
  DNF_NOTE,
  FinishRate,
  HourlyByKind,
  KindLegend,
  RangeHint,
  ago,
  difficultyNote,
  hourLabel,
  noRoundsNote,
  paceNote,
  pct,
  playTimeNote,
  shortDate,
  sumKinds,
  totalTimeLabel,
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
 * One read: the day the dashboard is pointed at. Not two.
 *
 * This used to end with a four-tile all-time strip, which was the Players tab's
 * opening row rendered a second time — and all-time totals only ever creep, so it
 * was a quarter of the landing tab spent on numbers that can't change between two
 * visits. It's one sentence now, with the tab that owns those numbers one click
 * away.
 *
 * What stays is what's *only* answerable today: is this busy for us (pace), is
 * the puzzle fair (difficulty), how far are people getting (finishing), and are
 * the beacons even arriving (last order). The new/returning split went with the
 * all-time strip for the same reason — it's the Players tab's headline, and it
 * was two more tiles here saying what the line chart there says better.
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

  const { day, today, totals, guessDistribution, playTime } = analytics;
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
          {/* Nobody *played* is not the same as nothing happened. Since the visit
              beacon shipped, a day with arrivals and no games is the loudest
              signal on the dashboard — everyone who showed up bounced — so it
              gets said rather than collapsed into "no plays recorded". */}
          {startedAny === 0 ? (
            <p className="dash-note" style={{ marginBottom: 16 }}>
              {day.visited
                ? `${day.visited} device${day.visited === 1 ? "" : "s"} opened the game ${
                    isToday ? "today" : `on ${day.date}`
                  } and nobody made a guess.`
                : isToday
                  ? "No plays recorded for today yet — check back once the diner fills up."
                  : `Nobody played on ${day.date}.`}
            </p>
          ) : (
            <>
              <div className="metric-row">
                {/* The funnel's top, ahead of games started because it's the
                    wider number — omitted entirely on days it wasn't measured. */}
                {day.visited !== null && (
                  <div className="metric" title="Devices that opened a playable board this day. One per device, however many times they came back to the tab.">
                    <span className="metric__num">{day.visited}</span>
                    <span className="metric__label">Opened the game</span>
                  </div>
                )}
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
                  {/* A morning's win rate is three players; say how wide that is
                      rather than printing it at the same weight as an all-time one. */}
                  <RangeHint n={day.totals.solved} of={day.totals.completed} />
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
                <h3 className="analytics-sub">How far they got</h3>
                <FinishRate
                  totals={day.allKinds}
                  open={day.open}
                  visited={day.visited}
                  // Devices, to match the arrivals they're divided by — see FinishRate.
                  playedBy={day.players === null ? null : day.players.new + day.players.returning}
                />
                {day.visited === null && (
                  <p className="dash-note">
                    Arrivals weren't counted on this day
                    {analytics.visits.since && ` — the visit beacon started ${shortDate(analytics.visits.since)}`}
                    , so the funnel starts at the first guess here.
                  </p>
                )}
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

          {/* The all-time footer. The four-tile strip that used to sit here was
              the Players tab's opening row rendered twice, and every figure in it
              only ever crept between two visits — so it's a sentence now, with
              the tab that owns those numbers one click away.

              Total play time is the exception that earns the big type: it's the
              only all-time figure on this dashboard that isn't drawn anywhere
              else, and unlike a count it answers a question of scale — how much
              of people's day this game has taken up. Deliberately not a daily
              read: a day's total is that day's round count wearing a different
              unit, where the running one is a fact about the game itself. */}
          <div className="alltime">
            {playTime.rounds > 0 && (
              <div className="alltime__stat" title={playTimeNote(playTime)}>
                <span className="alltime__num">{totalTimeLabel(playTime.minutes)}</span>
                <span className="alltime__label">Time at the counter</span>
                {/* The cap is the reason a *sum* is allowed here at all, so it's
                    on the face of it rather than only in the hover — but small,
                    because it's a footnote to the number, not a second number. */}
                <span className="alltime__foot">
                  all time · {playTime.rounds.toLocaleString()} rounds timed, capped at{" "}
                  {PLAYTIME_CAP_MINUTES}m each
                </span>
              </div>
            )}
            <p className="dash-note alltime__note">
              <strong>{totals.started.toLocaleString()}</strong> games played all time
              {analytics.rhythm.since && ` since ${shortDate(analytics.rhythm.since)}`}.{" "}
              <button className="link-btn" onClick={() => onOpenTab("players")}>
                Players
              </button>{" "}
              has the breakdown;{" "}
              <button className="link-btn" onClick={() => onOpenTab("trends")}>
                Trends
              </button>{" "}
              has where it's heading.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * What players are being served right now, and the one place to go and be one
 * of them. Test play opens today's actual Special on a 24-hour preview token
 * (`/?preview=…`), which is the game's existing dress-rehearsal door: the board
 * is the real one, and the round is dressed as the daily all the way through the
 * check — countdown, share button, stats panel — so the parts worth trying
 * before players reach them can actually be reached.
 *
 * Nothing it does is recorded. A preview round is untracked at the source
 * (`tracked` in GamePage): no arrival, no start, no completion, no share beacon,
 * so it can't reach the Activity feed or any figure on this dashboard, and it
 * writes neither localStorage nor lifetime stats. That's why this is a preview
 * token rather than a link to `/` — playing today's Special from the dashboard
 * for real would put the person reading these numbers into them.
 *
 * The token is minted from the *date*, not from `today.dishId`, so it resolves
 * the same way the game does — schedule row if there is one, deterministic
 * fallback pick if there isn't. That's why the button is still there on an
 * unbooked day: "what are players actually getting right now" is the question
 * that day raises, and a card that could only answer it when it was already
 * answered would be silent exactly when it mattered.
 */
function TodaysSpecial({
  today,
  onOpenDish,
}: {
  today: DashboardSpecial;
  onOpenDish: (id: number | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const testPlay = async () => {
    setError(null);
    try {
      const { url } = await api.createDayPreview(today.date);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const testPlayBtn = (
    <button className="btn btn--ghost" onClick={() => void testPlay()}>
      Test play ▶
    </button>
  );

  return (
    <section className="panel">
      <h2>Today's Special</h2>
      {today.dishName ? (
        <>
          <p className="dash-big">{today.dishName}</p>
          <p className="dash-note">Serving on {today.date}</p>
          <SwitchCountdown />
          <div className="btn-row">
            <button className="btn btn--ghost" onClick={() => onOpenDish(today.dishId)}>
              Edit dish
            </button>
            {testPlayBtn}
          </div>
        </>
      ) : (
        <>
          <p className="dash-big">Nothing scheduled!</p>
          <p className="dash-note">
            Players will get an automatic fallback dish today. Assign one in the schedule — or test play to
            see which one they're getting.
          </p>
          <SwitchCountdown />
          <div className="btn-row">{testPlayBtn}</div>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

/**
 * Tomorrow's booking. An empty day isn't fatal — the game falls back to a
 * deterministic pick and never 404s — but it's the one gap you'd want to fill
 * before it becomes today, so it warns.
 *
 * Shuffle rolls a dish that has never been the Special onto the day, in place —
 * it's meant to be pressed repeatedly until something appealing turns up, which
 * is why the button sits beside "Edit dish" rather than in the schedule view:
 * the pair is the whole loop (roll, look, roll again, edit the one you kept).
 * Three things follow from that:
 *
 * 1. **It writes on every click.** There's no "accept" step, because a roll that
 *    only proposed would need a second button to commit and a third to discard.
 *    Each click simply overwrites tomorrow's row, and the dish it displaces goes
 *    back in the pool.
 * 2. **It never lands on what's already showing.** The pool is "no schedule row
 *    at all", and the dish on the card has one at the moment the roll is made —
 *    so a click always visibly changes something, which is the only way a
 *    click-until-you-like-it button reads as working.
 * 3. **It offers itself on an empty day too**, where it's the fastest way to fill
 *    the gap the panel is warning about — and the count it reports afterwards is
 *    how much of the unserved catalogue is left to roll through.
 */
function TomorrowsSpecial({
  tomorrow,
  onNavigate,
  onOpenDish,
  onShuffled,
}: {
  tomorrow: DashboardSpecial;
  onNavigate: (view: AdminView) => void;
  onOpenDish: (id: number | null) => void;
  onShuffled: (special: DashboardSpecial) => void;
}) {
  const [rolling, setRolling] = useState(false);
  const [shuffleError, setShuffleError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  async function shuffle() {
    setRolling(true);
    setShuffleError(null);
    try {
      const picked = await api.shuffleSchedule(tomorrow.date);
      setRemaining(picked.remaining);
      onShuffled({ date: picked.date, dishId: picked.dishId, dishName: picked.dishName });
    } catch (e) {
      setShuffleError((e as Error).message);
    } finally {
      setRolling(false);
    }
  }

  const shuffleBtn = (
    <button className="btn btn--ghost" onClick={shuffle} disabled={rolling}>
      {rolling ? "Rolling…" : "🎲 Shuffle"}
    </button>
  );

  // What the last roll did, sitting *above* the buttons rather than under them:
  // the three cards in this row pin their button rows to a shared bottom edge,
  // and a note printed after the row would push this one's buttons up out of
  // line every time you shuffled.
  const roll = shuffleError ? (
    <p className="form-error">{shuffleError}</p>
  ) : remaining !== null ? (
    <p className="dash-note">
      Rolled from {remaining} dish{remaining === 1 ? "" : "es"} that have never been the Special.
    </p>
  ) : null;

  return (
    <section className={tomorrow.dishName ? "panel" : "panel panel--warn"}>
      <h2>Tomorrow's Special</h2>
      {tomorrow.dishName ? (
        <>
          <p className="dash-big">{tomorrow.dishName}</p>
          <p className="dash-note">Serving on {tomorrow.date}</p>
          {roll}
          <div className="btn-row">
            <button className="btn btn--ghost" onClick={() => onOpenDish(tomorrow.dishId)}>
              Edit dish
            </button>
            {shuffleBtn}
          </div>
        </>
      ) : (
        <>
          <p className="dash-big">Nothing booked</p>
          <p className="dash-note">
            {tomorrow.date} would run on the automatic fallback pick. Book it before it becomes today.
          </p>
          {roll}
          <div className="btn-row">
            <button className="btn" onClick={() => onNavigate("schedule")}>
              Open schedule
            </button>
            {shuffleBtn}
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
  onTomorrowChange,
}: {
  data: AdminDashboard | null;
  error: string | null;
  analytics: AnalyticsSummary | null;
  analyticsError: string | null;
  surface: SurfaceFilter;
  onNavigate: (view: AdminView) => void;
  onOpenDish: (id: number | null) => void;
  onOpenTab: (tab: DashboardTab) => void;
  /** A shuffled booking, handed up so the schedule-health read re-reads too. */
  onTomorrowChange: (special: DashboardSpecial) => void;
}) {
  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p style={{ color: "var(--cream)" }}>Loading the front of house…</p>;

  const lowSchedule = data.scheduledAhead < 7;

  return (
    <>
      <div className="dash-grid">
        <TodaysSpecial today={data.today} onOpenDish={onOpenDish} />

        <TomorrowsSpecial
          tomorrow={data.tomorrow}
          onNavigate={onNavigate}
          onOpenDish={onOpenDish}
          onShuffled={onTomorrowChange}
        />

        <section className={lowSchedule ? "panel panel--warn" : "panel"}>
          <h2>Schedule health</h2>
          <p className="dash-big">
            {data.scheduledAhead} day{data.scheduledAhead === 1 ? "" : "s"} ahead
          </p>
          <p className="dash-note">
            {data.firstGap ? `First empty day: ${data.firstGap}` : "Next 60 days fully booked"}
            {lowSchedule && " — time to fill the board!"}
          </p>
          <div className="btn-row">
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
