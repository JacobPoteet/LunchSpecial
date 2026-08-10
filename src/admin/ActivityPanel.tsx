import { useEffect, useState } from "react";
import type {
  AnalyticsEvent,
  AnalyticsEventType,
  DeviceDataDeleted,
  DeviceDataSummary,
} from "../../shared/types";
import { ANALYTICS_EVENTS_MAX, ANALYTICS_EVENTS_PAGE } from "../../shared/types";
import { gameTimestamp } from "../../shared/time";
import * as api from "./api";
import { Modal } from "../game/components";
import { peekPlayerId } from "../game/storage";
import { ago, kindCls, kindLabel, type SurfaceFilter } from "./analyticsUi";

/** Label + bar colour for each event type in the recent-activity feed. */
const EVENT_META: Record<AnalyticsEventType, { label: string; cls: string }> = {
  start: { label: "Started", cls: "start" },
  complete: { label: "Finished", cls: "complete" },
  share: { label: "Shared", cls: "share" },
};

/** What a finished round ended up doing. Blank for start/share events. */
function eventDetail(e: AnalyticsEvent): string {
  if (e.type !== "complete") return "—";
  if (e.guesses === null) return e.solved ? "Solved" : "Gave up";
  return e.solved ? `Solved in ${e.guesses}` : `Out of guesses (${e.guesses})`;
}

/**
 * Whether the activity feed keeps, drops, or isolates rows from *this* browser —
 * i.e. the admin's own play-testing. "Mine" is per-device by design: it matches
 * the anonymous player id in this browser's localStorage, so rounds played on
 * your phone or inside the Discord Activity (a separate origin, separate id)
 * still read as other players.
 */
type MineFilter = "all" | "hide" | "only";
const MINE_FILTERS: { key: MineFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "hide", label: "Hide mine" },
  { key: "only", label: "Only mine" },
];
const MINE_KEY = "lunch-special:admin-activity-mine";

/** Remembered across reloads — but defaults to "all" so the feed never hides rows unasked. */
function loadMineFilter(): MineFilter {
  try {
    const saved = localStorage.getItem(MINE_KEY);
    return MINE_FILTERS.some((f) => f.key === saved) ? (saved as MineFilter) : "all";
  } catch {
    return "all";
  }
}
function saveMineFilter(value: MineFilter) {
  try {
    localStorage.setItem(MINE_KEY, value);
  } catch {
    // Storage blocked — the filter just won't survive a reload.
  }
}

/** Segmented control (same look as SurfaceToggle) scoping the feed by "is this me?". */
function MineToggle({
  value,
  onChange,
  disabled,
}: {
  value: MineFilter;
  onChange: (m: MineFilter) => void;
  disabled: boolean;
}) {
  return (
    <div className="surface-toggle" role="tablist" aria-label="Filter activity by this device">
      {MINE_FILTERS.map((f) => {
        // Nothing has ever been played in this browser, so there's no id to
        // match — leave the control visible (it explains itself) but inert.
        const off = disabled && f.key !== "all";
        return (
          <button
            key={f.key}
            role="tab"
            aria-selected={value === f.key}
            disabled={off}
            title={off ? "Play a round in this browser first" : undefined}
            className={`surface-toggle__btn${value === f.key ? " surface-toggle__btn--active" : ""}`}
            onClick={() => onChange(f.key)}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "3 Today's Special · 1 Leftovers · 4 Chef's Choice", skipping the kinds at
 * zero. Labels keep their dashboard casing rather than being lowercased into a
 * sentence — they're the names of the three game modes, and "1 leftovers" reads
 * like a broken plural where "1 Leftovers" reads like the mode it is.
 */
function kindBreakdown(byKind: DeviceDataSummary["rounds"]["byKind"]): string {
  const parts = KIND_ORDER.filter((k) => byKind[k] > 0).map((k) => `${byKind[k]} ${kindLabel(k)}`);
  return parts.join(" · ");
}
const KIND_ORDER = ["daily", "leftover", "random"] as const;

/** An ISO instant as the same ET wall clock the feed above prints. */
const etStamp = (iso: string) => `${gameTimestamp(new Date(iso))} ET`;

/**
 * "This device's data" — review what your own play-testing has put into the
 * numbers, then remove it.
 *
 * The admin is also a player, and at this game's volume one person testing is a
 * visible fraction of every rate on the dashboard. The arrivals ledger is the
 * sharpest case: opening the game and never guessing writes a visit row and
 * nothing else (migrations/0020), so an afternoon of reloading the page to check
 * a change reads as pure bounce in the player funnel.
 *
 * Three things are deliberate:
 *
 * 1. **Review is a step, not a suggestion.** The delete button doesn't exist
 *    until the summary has loaded — you cannot reach an irreversible wipe of prod
 *    D1 (which has no automatic backup) without having first been shown what it
 *    covers. "Show these rows" hands the review off to the feed above, set to
 *    "Only mine", because the individual beacons are a better review surface than
 *    a second table would be; this panel answers the part the feed can't, which
 *    is *how much*.
 * 2. **It is scoped to this browser, not to "the admin".** Same id as the mine
 *    filter, so rounds played on your phone or inside the Discord Activity (a
 *    separate origin, therefore a separate id) are somebody else's as far as this
 *    is concerned — which is correct, and worth saying out loud, since the
 *    tempting reading of "delete my analytics" is that it finds you everywhere.
 * 3. **The id survives the delete.** Nothing resets localStorage, so the next
 *    round you play here records under the same id and can be cleared again the
 *    same way. Minting a fresh id would only scatter your testing across several
 *    ids, none of which the filter above would recognise.
 */
function MyDataPanel({
  playerId,
  onShowMine,
  onChanged,
}: {
  playerId: string | null;
  /** Point the feed above at this device — the rows this panel is counting. */
  onShowMine: () => void;
  /** A wipe landed: the feed above is now stale. */
  onChanged: () => void;
}) {
  const [summary, setSummary] = useState<DeviceDataSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState<DeviceDataDeleted | null>(null);

  const review = () => {
    if (!playerId) return;
    setBusy(true);
    setError(null);
    setDeleted(null);
    api.getDeviceData(playerId).then(
      (s) => {
        setSummary(s);
        setBusy(false);
      },
      (e: Error) => {
        setError(e.message);
        setBusy(false);
      },
    );
  };

  const wipe = () => {
    if (!playerId) return;
    setConfirming(false);
    setBusy(true);
    setError(null);
    api.deleteDeviceData(playerId).then(
      (d) => {
        setDeleted(d);
        setSummary(null);
        setBusy(false);
        onChanged();
      },
      (e: Error) => {
        setError(e.message);
        setBusy(false);
      },
    );
  };

  const total = summary ? summary.rounds.total + summary.visits.total + summary.noticeViews : 0;

  return (
    <section className="panel">
      <div className="analytics-head">
        <h2>This device's data</h2>
      </div>
      <p className="dash-note">
        Your own play-testing is in every number on this dashboard — including the arrivals the funnel counts,
        which a page you opened and never guessed on still writes. Review what this browser has recorded, then
        clear it out.
      </p>

      {!playerId && (
        <p className="dash-note" style={{ marginTop: 12 }}>
          Nothing has been played in this browser, so there's no device id to look up. Play a round here first.
        </p>
      )}

      {playerId && (
        <>
          <p className="dash-note" style={{ marginTop: 12 }}>
            Device <code className="ev-player">{playerId.slice(0, 8)}</code> — this browser only. Rounds played on
            your phone or inside the Discord Activity carry a different id and aren't included.
          </p>

          {error && <p className="dash-note dash-note--warn">{error}</p>}

          {deleted && (
            <p className="dash-note dash-note--warn">
              Removed {deleted.rounds} round{deleted.rounds === 1 ? "" : "s"}, {deleted.visits} arrival
              {deleted.visits === 1 ? "" : "s"} and {deleted.noticeViews} notice view
              {deleted.noticeViews === 1 ? "" : "s"}. This device keeps the same id, so anything you play here
              from now on will be recorded again — and can be cleared the same way.
            </p>
          )}

          {summary && total === 0 && (
            <p className="dash-note" style={{ marginTop: 12 }}>
              Nothing from this device is in the numbers.
            </p>
          )}

          {summary && total > 0 && (
            <>
              <div className="metric-row" style={{ marginTop: 12 }}>
                <div className="metric metric--primary">
                  <span className="metric__num">{summary.rounds.total}</span>
                  <span className="metric__label">Rounds</span>
                </div>
                <div className="metric">
                  <span className="metric__num">{summary.visits.total}</span>
                  <span className="metric__label">Arrivals</span>
                </div>
                <div className="metric">
                  <span className="metric__num">{summary.noticeViews}</span>
                  <span className="metric__label">Notice views</span>
                </div>
              </div>
              <ul className="device-data__facts">
                {summary.rounds.total > 0 && (
                  <li>
                    {kindBreakdown(summary.rounds.byKind)} — {summary.rounds.completed} finished,{" "}
                    {summary.rounds.shared} shared
                    {summary.rounds.bySurface.discord > 0 &&
                      ` (${summary.rounds.bySurface.discord} inside Discord)`}
                  </li>
                )}
                {summary.rounds.firstAt && summary.rounds.lastAt && (
                  <li>
                    First round {etStamp(summary.rounds.firstAt)}, last {etStamp(summary.rounds.lastAt)}
                  </li>
                )}
                {summary.visits.total > 0 && summary.visits.firstDay && (
                  <li>
                    Counted as a visitor on {summary.visits.total} day
                    {summary.visits.total === 1 ? "" : "s"} ({summary.visits.firstDay}
                    {summary.visits.lastDay !== summary.visits.firstDay && ` → ${summary.visits.lastDay}`})
                  </li>
                )}
              </ul>
              <p className="dash-note">
                Dish suggestions sent from this device aren't analytics — clear those in the Requests tab.
              </p>
            </>
          )}

          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn btn--ghost btn--small" onClick={review} disabled={busy}>
              {busy ? "Counting…" : summary ? "Recount" : "Review my data"}
            </button>
            {summary && total > 0 && (
              <>
                <button className="btn btn--ghost btn--small" onClick={onShowMine}>
                  Show these rows
                </button>
                <button className="btn btn--red btn--small" onClick={() => setConfirming(true)} disabled={busy}>
                  Delete all of it
                </button>
              </>
            )}
          </div>
        </>
      )}

      {confirming && summary && (
        <Modal onClose={() => setConfirming(false)}>
          <h3 style={{ marginTop: 0 }}>Delete this device's data?</h3>
          <p>
            This permanently removes <strong>{summary.rounds.total}</strong> round
            {summary.rounds.total === 1 ? "" : "s"}, <strong>{summary.visits.total}</strong> arrival
            {summary.visits.total === 1 ? "" : "s"} and <strong>{summary.noticeViews}</strong> notice view
            {summary.noticeViews === 1 ? "" : "s"} recorded by this browser. Every chart on the dashboard will
            change. It can't be undone — there's no backup of the live database unless you took one.
          </p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn--red" onClick={wipe}>
              Delete it
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/**
 * Recent-activity feed (GitHub #47) — the raw beacons behind the charts in the
 * other tabs, newest first, so you can watch what actually changed instead of
 * diffing numbers. Inherits the tab bar's surface filter; times render in game
 * time (ET). Its fetch only fires when this tab is open.
 *
 * The tab also carries {@link MyDataPanel} underneath, because "which of these
 * rows are mine" and "take mine out of the numbers" are the same question asked
 * twice, and this is the only place that already knows who "me" is.
 */
export default function ActivityPanel({ surface }: { surface: SurfaceFilter }) {
  const [events, setEvents] = useState<AnalyticsEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(ANALYTICS_EVENTS_PAGE);
  // Bumped by the Refresh button to re-run the fetch without changing its inputs.
  const [reloads, setReloads] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // This browser's own anonymous player id — read once, never minted (see
  // peekPlayerId). Null when nothing has been played here, which disables the
  // mine filter entirely.
  const [myId] = useState(peekPlayerId);
  const [mine, setMine] = useState<MineFilter>(loadMineFilter);

  useEffect(() => {
    saveMineFilter(mine);
  }, [mine]);

  useEffect(() => {
    let live = true;
    setError(null);
    const mineArg = myId && mine !== "all" ? { playerId: myId, mode: mine } : undefined;
    api.getAnalyticsEvents(surface === "all" ? undefined : surface, limit, mineArg).then(
      (e) => {
        if (!live) return;
        setEvents(e);
        setNow(Date.now());
      },
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [surface, limit, reloads, mine, myId]);

  // Keep the "3m ago" column honest without refetching.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const header = (
    <div className="analytics-head">
      <h2>Recent activity</h2>
      <div className="analytics-head__tools">
        <MineToggle value={mine} onChange={setMine} disabled={!myId} />
        <button className="btn btn--ghost btn--small" onClick={() => setReloads((n) => n + 1)}>
          Refresh
        </button>
      </div>
    </div>
  );

  // The device panel below is independent of the feed's state — it renders even
  // when the feed is empty or errored, since "how much of this is me" is exactly
  // the question you'd ask of an empty-looking feed.
  const mineSection = (
    <MyDataPanel
      playerId={myId}
      onShowMine={() => setMine("only")}
      onChanged={() => setReloads((n) => n + 1)}
    />
  );

  if (error || !events || events.length === 0) {
    return (
      <>
        <section className="panel">
          {header}
          <p className="dash-note">
            {error
              ? `Couldn't load the activity feed: ${error}`
              : !events
                ? "Reading the order tickets…"
                : mine === "only"
                  ? "Nothing from this device yet."
                  : mine === "hide"
                    ? "Nothing yet from anyone but this device."
                    : "Nothing has happened yet."}
          </p>
        </section>
        {mineSection}
      </>
    );
  }

  return (
    <>
      <section className="panel">
        {header}
        <div className="day-table-wrap">
          <table className="day-table event-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Game</th>
                <th>Puzzle</th>
                <th>Result</th>
                <th>Surface</th>
                <th title="Anonymous per-device id">Player</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const at = new Date(e.at);
                return (
                  <tr key={`${e.roundId}-${e.type}`}>
                    <td>
                      <span className="ev-when">{ago(at.getTime(), now)}</span>
                      <span className="ev-sub">{gameTimestamp(at)} ET</span>
                    </td>
                    <td>
                      <span className={`ev-badge ev-badge--${EVENT_META[e.type].cls}`}>
                        {EVENT_META[e.type].label}
                      </span>
                    </td>
                    <td>
                      <span className={`kind-legend__dot kind-legend__dot--${kindCls(e.kind)}`} />
                      {kindLabel(e.kind)}
                    </td>
                    <td>
                      {/* Random rounds ignore the schedule, so neither the dish nor
                          a puzzle number applies — only the day it was played. */}
                      <span className="ev-when">{e.dishName ?? "—"}</span>
                      <span className="ev-sub">
                        {e.kind === "random" ? e.date : `#${e.puzzleNumber} · ${e.date}`}
                      </span>
                    </td>
                    <td>{eventDetail(e)}</td>
                    <td>{e.surface === "discord" ? "Discord" : "Web"}</td>
                    <td>
                      {e.playerId ? (
                        <>
                          <code className="ev-player" title={e.playerId}>
                            {e.playerId.slice(0, 8)}
                          </code>
                          {/* Flags your own test rounds even in "All" mode — makes
                              the filter above discoverable. */}
                          {e.playerId === myId && <span className="ev-you">you</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="dash-note" style={{ marginTop: 8 }}>
          Newest first · {events.length} event{events.length === 1 ? "" : "s"}
          {mine === "only" && " · this device only"}
          {mine === "hide" && " · this device hidden"}
          {events.length >= limit && limit < ANALYTICS_EVENTS_MAX && (
            <>
              {" · "}
              <button
                className="link-btn"
                onClick={() => setLimit((n) => Math.min(n + ANALYTICS_EVENTS_PAGE, ANALYTICS_EVENTS_MAX))}
              >
                Show more
              </button>
            </>
          )}
        </p>
      </section>
      {mineSection}
    </>
  );
}
