import { useEffect, useState } from "react";
import type { AnalyticsEvent, AnalyticsEventType } from "../../shared/types";
import { ANALYTICS_EVENTS_MAX, ANALYTICS_EVENTS_PAGE } from "../../shared/types";
import { gameTimestamp } from "../../shared/time";
import * as api from "./api";
import { peekPlayerId } from "../game/storage";
import { kindCls, kindLabel, type SurfaceFilter } from "./analyticsUi";

/** Label + bar colour for each event type in the recent-activity feed. */
const EVENT_META: Record<AnalyticsEventType, { label: string; cls: string }> = {
  start: { label: "Started", cls: "start" },
  complete: { label: "Finished", cls: "complete" },
  share: { label: "Shared", cls: "share" },
};

/** How long ago an instant was, in the roughest unit that still reads right. */
function ago(atMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

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
 * Recent-activity feed (GitHub #47) — the raw beacons behind the charts in the
 * other tabs, newest first, so you can watch what actually changed instead of
 * diffing numbers. Inherits the tab bar's surface filter; times render in game
 * time (ET). Its fetch only fires when this tab is open.
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

  if (error) {
    return (
      <section className="panel">
        {header}
        <p className="dash-note">Couldn't load the activity feed: {error}</p>
      </section>
    );
  }
  if (!events) {
    return (
      <section className="panel">
        {header}
        <p className="dash-note">Reading the order tickets…</p>
      </section>
    );
  }
  if (events.length === 0) {
    return (
      <section className="panel">
        {header}
        <p className="dash-note">
          {mine === "only"
            ? "Nothing from this device yet."
            : mine === "hide"
              ? "Nothing yet from anyone but this device."
              : "Nothing has happened yet."}
        </p>
      </section>
    );
  }

  return (
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
  );
}
