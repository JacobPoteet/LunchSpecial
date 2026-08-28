import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActivityFeed,
  AnalyticsEventType,
  DeviceDataDeleted,
  DeviceDataSummary,
  RoundKind,
} from "../../shared/types";
import { ACTIVITY_MAX, ACTIVITY_PAGE, ROUND_KINDS } from "../../shared/types";
import {
  EMPTY_FILTER,
  ROUND_STATES,
  STATE_LABEL,
  filterActive,
  foldActivity,
  type ActivityFilter,
  type ActivityGroup,
  type ActivityRoundView,
  type RoundState,
} from "../../shared/activity";
import { gameClock, gameTimestamp } from "../../shared/time";
import * as api from "./api";
import { Modal } from "../game/components";
import { peekPlayerId } from "../game/storage";
import DayPicker from "./DayPicker";
import { ago, countryName, kindCls, kindLabel, type SurfaceFilter } from "./analyticsUi";

/**
 * Label + pip colour for each beacon in a round's arc.
 *
 * These are the dashboard's **event** palette — start = teal, complete = cherry,
 * share = mustard — and not the kind palette (mustard/teal/cherry meaning the
 * three game modes), which is why an arc pip can never be mistaken for a game
 * mode. It's the same three classes `.ev-badge--*` already carried when these
 * were rows of their own.
 */
const EVENT_META: Record<AnalyticsEventType, { label: string; cls: string }> = {
  start: { label: "Started", cls: "start" },
  complete: { label: "Finished", cls: "complete" },
  share: { label: "Shared", cls: "share" },
};

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

/**
 * How the rounds are laid out: a flat chronological log, or folded into visits.
 *
 * Log stays the default. Grouping is the better read for "what did this person
 * do", and a strictly time-ordered list is the better read for "what just
 * happened" — those are different questions and the feed answers whichever one
 * you asked, rather than picking.
 */
type GroupMode = "log" | "visit";
const GROUP_KEY = "lunch-special:admin-activity-group";

function loadGroupMode(): GroupMode {
  try {
    return localStorage.getItem(GROUP_KEY) === "visit" ? "visit" : "log";
  } catch {
    return "log";
  }
}

/** The chips, parked for the session — a filter is a train of thought, not a setting. */
const FILTER_KEY = "lunch-special:admin-activity-filter";

function loadFilter(): ActivityFilter {
  try {
    const raw = sessionStorage.getItem(FILTER_KEY);
    if (!raw) return EMPTY_FILTER;
    const f = JSON.parse(raw) as Partial<ActivityFilter>;
    // Coerced rather than trusted: a stale blob from an older shape must not be
    // able to hide every row with no visible chip explaining why.
    return {
      states: Array.isArray(f.states) ? f.states.filter((s): s is RoundState => ROUND_STATES.includes(s)) : [],
      kinds: Array.isArray(f.kinds) ? f.kinds.filter((k): k is RoundKind => ROUND_KINDS.includes(k)) : [],
      sharedOnly: f.sharedOnly === true,
    };
  } catch {
    return EMPTY_FILTER;
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
 *    "Only mine", because the individual rounds are a better review surface than
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

// ---- the feed itself --------------------------------------------------------

/** A millisecond span as the coarsest unit that still reads right: "12s", "4m 03s", "1h 12m". */
function spanLabel(msSpan: number): string {
  const s = Math.round(msSpan / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** The clock time of an ISO instant, in game time — "17:58". */
const clock = (iso: string) => gameClock(new Date(iso));

/**
 * A round's three beacons as three pips.
 *
 * Lit means it happened. Hollow means it didn't — *not* "we don't know", which
 * is a state that only arises for a pre-migrations/0011 row where the fact is
 * recorded and the time isn't; those light the pip and say "time not recorded"
 * in the tooltip rather than pretending to a stamp.
 *
 * The pips never carry the outcome on their own: the Result column beside them
 * spells it out in words, so the arc is a shape you learn to skim rather than a
 * colour you have to decode.
 */
function Arc({ round }: { round: ActivityRoundView }) {
  const pips: { type: AnalyticsEventType; on: boolean; at: string | null }[] = [
    { type: "start", on: true, at: round.startedAt },
    { type: "complete", on: round.completed, at: round.completedAt },
    { type: "share", on: round.shared, at: round.sharedAt },
  ];
  return (
    <span className="arc">
      {pips.map((p) => (
        <span
          key={p.type}
          className={`arc__pip arc__pip--${EVENT_META[p.type].cls}${p.on ? "" : " arc__pip--off"}`}
          title={
            p.on
              ? `${EVENT_META[p.type].label} ${p.at ? `${etStamp(p.at)}` : "— time not recorded (pre-0011 row)"}`
              : `Not ${EVENT_META[p.type].label.toLowerCase()}`
          }
        />
      ))}
    </span>
  );
}

/** What the round ended up doing, in words, plus how long it took. */
function Result({ round, now }: { round: ActivityRoundView; now: number }) {
  const headline =
    round.state === "solved"
      ? round.guesses === null
        ? "Solved"
        : `Solved in ${round.guesses}`
      : round.state === "lost"
        ? round.guesses === null
          ? "Gave up"
          : `Out of guesses (${round.guesses})`
        : STATE_LABEL[round.state];
  // An abandoned round gets no duration at all. The obvious one — now minus its
  // start — measures how long ago it happened, not how long anybody played; it
  // reads as "left after 538h", which is the sort of fabricated number the rest
  // of this dashboard refuses to print. The When column already says when.
  const sub =
    round.solveMs !== null
      ? `${spanLabel(round.solveMs)} at the counter`
      : round.state === "in-progress"
        ? `open ${spanLabel(now - Date.parse(round.startedAt))}`
        : round.completed
          ? "time not recorded"
          : "never finished";
  return (
    <>
      <span className={`ev-when act-state act-state--${round.state}`}>{headline}</span>
      <span className="ev-sub">{sub}</span>
    </>
  );
}

/** One chip: a label, the count it would yield, and whether it's picked. */
function Chip({
  label,
  count,
  on,
  onClick,
}: {
  label: string;
  count: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`act-chip${on ? " act-chip--on" : ""}${count === 0 ? " act-chip--empty" : ""}`}
      onClick={onClick}
    >
      {label}
      <span className="act-chip__n">{count}</span>
    </button>
  );
}

/**
 * The filter bar. Counts come from `activityFacets`, which drops each facet's own
 * selection before counting it — so the number beside "Out of guesses" answers
 * "what if I clicked this", which is the only version of it that's interesting
 * once something else is picked. Empty chips are dimmed, never disabled: a zero
 * is a fact about the page.
 */
function FilterBar({
  filter,
  facets,
  onChange,
}: {
  filter: ActivityFilter;
  facets: ReturnType<typeof foldActivity>["facets"];
  onChange: (f: ActivityFilter) => void;
}) {
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="act-filters">
      <div className="act-filters__row">
        <span className="act-filters__label">Outcome</span>
        <div className="act-filters__chips">
          {ROUND_STATES.map((s) => (
            <Chip
              key={s}
              label={STATE_LABEL[s]}
              count={facets.states[s]}
              on={filter.states.includes(s)}
              onClick={() => onChange({ ...filter, states: toggle(filter.states, s) })}
            />
          ))}
        </div>
      </div>
      <div className="act-filters__row">
        <span className="act-filters__label">Game</span>
        <div className="act-filters__chips">
          {ROUND_KINDS.map((k) => (
            <Chip
              key={k}
              label={kindLabel(k)}
              count={facets.kinds[k]}
              on={filter.kinds.includes(k)}
              onClick={() => onChange({ ...filter, kinds: toggle(filter.kinds, k) })}
            />
          ))}
          <Chip
            label="Shared"
            count={facets.shared}
            on={filter.sharedOnly}
            onClick={() => onChange({ ...filter, sharedOnly: !filter.sharedOnly })}
          />
          {filterActive(filter) && (
            <button type="button" className="link-btn act-filters__clear" onClick={() => onChange(EMPTY_FILTER)}>
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One visit's header row: who showed up, from where, when, and what they did
 * with the day.
 *
 * The two counts mean different things and both are printed. `rounds.length` is
 * what's on this page; `totals.rounds` is the device's whole ET day. A header
 * that only knew the first would report a nine-round evening as three, which is
 * the same class of lie as reporting an unmeasured visit count as zero.
 */
function GroupHeader({
  group,
  open,
  onToggle,
  myId,
  spotlight,
  onSpotlight,
}: {
  group: ActivityGroup;
  open: boolean;
  onToggle: () => void;
  myId: string | null;
  spotlight: string | null;
  onSpotlight: (id: string | null) => void;
}) {
  const inView = group.rounds.length;
  const day = group.totals?.rounds ?? null;
  const solved = group.totals?.solved ?? group.rounds.filter((r) => r.state === "solved").length;
  const shared = group.totals?.shared ?? group.rounds.filter((r) => r.shared).length;
  const span =
    group.firstAt && group.lastAt && clock(group.firstAt) !== clock(group.lastAt)
      ? `${clock(group.firstAt)} → ${clock(group.lastAt)}`
      : clock(group.firstAt || group.lastAt);

  return (
    <tr className={`act-group${group.bounced ? " act-group--bounced" : ""}`}>
      <td colSpan={7}>
        <button
          type="button"
          className="act-group__toggle"
          aria-expanded={open}
          onClick={onToggle}
          disabled={inView === 0}
        >
          <span className="act-caret" aria-hidden="true">
            {inView === 0 ? "·" : open ? "▾" : "▸"}
          </span>
          {group.playerId === null ? (
            <span className="act-group__who">Unattributed</span>
          ) : (
            <span
              className={`act-group__who${spotlight === group.playerId ? " act-group__who--lit" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSpotlight(spotlight === group.playerId ? null : group.playerId);
              }}
              title="Follow this device"
            >
              <code className="ev-player">{group.playerId.slice(0, 8)}</code>
              {group.playerId === myId && <span className="ev-you">you</span>}
            </span>
          )}
          <span className="act-group__meta">
            {group.day} · {span} ET
            {group.surfaces.length > 0 && ` · ${group.surfaces.map(surfaceLabel).join(" + ")}`}
            {group.countries.length > 0 && ` · ${group.countries.map(countryName).join(", ")}`}
            {group.visit?.source && ` · via ${group.visit.source}`}
          </span>
          <span className="act-group__tally">
            {group.bounced
              ? "arrived, never played"
              : day !== null && day !== inView
                ? `${inView} of ${day} rounds · ${solved} solved · ${shared} shared`
                : `${inView} round${inView === 1 ? "" : "s"} · ${solved} solved · ${shared} shared`}
            {!group.visit && !group.bounced && <span className="act-group__note"> · no arrival recorded</span>}
          </span>
        </button>
      </td>
    </tr>
  );
}

const surfaceLabel = (s: string) => (s === "discord" ? "Discord" : "Web");

/** The three beacons written out, under an expanded round. */
function BeaconList({ round }: { round: ActivityRoundView }) {
  const rows: { type: AnalyticsEventType; at: string | null; on: boolean; delta: number | null }[] = [
    { type: "start", at: round.startedAt, on: true, delta: null },
    { type: "complete", at: round.completedAt, on: round.completed, delta: round.solveMs },
    { type: "share", at: round.sharedAt, on: round.shared, delta: round.shareMs },
  ];
  return (
    <ul className="act-beacons">
      {rows
        .filter((r) => r.on)
        .map((r) => (
          <li key={r.type}>
            <span className={`ev-badge ev-badge--${EVENT_META[r.type].cls}`}>{EVENT_META[r.type].label}</span>{" "}
            {r.at ? etStamp(r.at) : "time not recorded (round predates per-event stamps)"}
            {r.delta !== null && <span className="ev-sub"> +{spanLabel(r.delta)}</span>}
          </li>
        ))}
    </ul>
  );
}

export default function ActivityPanel({
  surface,
  onOpenDishReport,
}: {
  surface: SurfaceFilter;
  /** Jump to the Menu tab's dish report with this dish highlighted. */
  onOpenDishReport: (dishId: number) => void;
}) {
  const [feed, setFeed] = useState<ActivityFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(ACTIVITY_PAGE);
  // Bumped by the Refresh button (and by live mode) to re-run the fetch without
  // changing its inputs.
  const [reloads, setReloads] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // This browser's own anonymous player id — read once, never minted (see
  // peekPlayerId). Null when nothing has been played here, which disables the
  // mine filter entirely.
  const [myId] = useState(peekPlayerId);
  const [mine, setMine] = useState<MineFilter>(loadMineFilter);
  const [group, setGroup] = useState<GroupMode>(loadGroupMode);
  const [filter, setFilter] = useState<ActivityFilter>(loadFilter);
  const [date, setDate] = useState<string | null>(null);
  const [pickingDay, setPickingDay] = useState(false);
  const [live, setLive] = useState(false);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  // Rounds whose latest beacon is newer than the last time we looked. Marked
  // with a static rail rather than an animation: admin.css declares no keyframes
  // at all, and a feed that pulses every 30 seconds is the last place to
  // introduce the first one.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const seen = useRef<Map<string, string> | null>(null);

  useEffect(() => saveMineFilter(mine), [mine]);
  useEffect(() => {
    try {
      localStorage.setItem(GROUP_KEY, group);
    } catch {
      // Storage blocked — the layout just won't survive a reload.
    }
  }, [group]);
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(filter));
    } catch {
      // Same.
    }
  }, [filter]);

  useEffect(() => {
    let alive = true;
    setError(null);
    const mineArg = myId && mine !== "all" ? { playerId: myId, mode: mine } : undefined;
    api
      .getActivity({ surface: surface === "all" ? undefined : surface, limit, date, mine: mineArg })
      .then(
        (f) => {
          if (!alive) return;
          // First load establishes the baseline; only later loads can mark a
          // round as new, or every row would flash on arrival.
          const before = seen.current;
          const after = new Map(f.rounds.map((r) => [r.roundId, r.lastAt]));
          if (before) {
            const changed = f.rounds.filter((r) => before.get(r.roundId) !== r.lastAt).map((r) => r.roundId);
            if (changed.length > 0) setFresh(new Set(changed));
          }
          seen.current = after;
          setFeed(f);
          setNow(Date.now());
        },
        (e: Error) => alive && setError(e.message),
      );
    return () => {
      alive = false;
    };
  }, [surface, limit, reloads, mine, myId, date]);

  // A changed scope is a changed baseline: rows aren't "new" because you asked a
  // different question.
  useEffect(() => {
    seen.current = null;
    setFresh(new Set());
  }, [surface, mine, date]);

  // Keep the "3m ago" column and the walked-out cutoff honest without refetching.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Live mode: the feed's own refetch loop. Paused while the tab is hidden —
  // polling a dashboard nobody is looking at is pure cost, and the first tick
  // after it comes back is what you actually wanted anyway.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setReloads((n) => n + 1);
    }, 30_000);
    return () => clearInterval(t);
  }, [live]);

  // The "just landed" mark clears itself; it says *new since you last looked*,
  // and after half a minute you have looked.
  useEffect(() => {
    if (fresh.size === 0) return;
    const t = setTimeout(() => setFresh(new Set()), 30_000);
    return () => clearTimeout(t);
  }, [fresh]);

  const view = useMemo(
    () => (feed ? foldActivity(feed, now, filter) : null),
    [feed, now, filter],
  );

  const toggleRound = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const header = (
    <div className="analytics-head">
      <h2>Recent activity</h2>
      <div className="analytics-head__tools">
        <MineToggle value={mine} onChange={setMine} disabled={!myId} />
        <div className="surface-toggle" role="tablist" aria-label="Group the feed">
          {(["log", "visit"] as GroupMode[]).map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={group === g}
              title={
                g === "log"
                  ? "Every round in time order"
                  : "Folded into visits — one device, one ET day, the same unit the funnel counts"
              }
              className={`surface-toggle__btn${group === g ? " surface-toggle__btn--active" : ""}`}
              onClick={() => setGroup(g)}
            >
              {g === "log" ? "Log" : "Visits"}
            </button>
          ))}
        </div>
        <button
          className={`btn btn--ghost btn--small${live ? " btn--on" : ""}`}
          aria-pressed={live}
          title="Refetch every 30 seconds while this tab is visible"
          onClick={() => setLive((v) => !v)}
        >
          {live ? "● Serving" : "Serving"}
        </button>
        <button
          className={`btn btn--ghost btn--small${date ? " btn--on" : ""}`}
          title="Show one ET day's service instead of the most recent rounds"
          onClick={() => setPickingDay(true)}
        >
          📅 {date ?? "All days"}
        </button>
        {date && (
          <button className="btn btn--ghost btn--small" onClick={() => setDate(null)}>
            Clear day
          </button>
        )}
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

  const dayPicker = pickingDay && feed && (
    <DayPicker
      activeDates={feed.activeDays}
      selected={date ?? feed.today}
      today={feed.today}
      onPick={(d) => {
        // Always scopes, today included: picking a day is an explicit ask for
        // that service. "Clear day" beside the button is how you get back to the
        // most-recent view, rather than one calendar cell secretly meaning it.
        setDate(d);
        setPickingDay(false);
      }}
      onClose={() => setPickingDay(false)}
    />
  );

  if (error || !view || view.total === 0) {
    return (
      <>
        <section className="panel">
          {header}
          {view && view.total === 0 && filterActive(filter) && (
            <FilterBar filter={filter} facets={view.facets} onChange={setFilter} />
          )}
          <p className="dash-note">
            {error
              ? `Couldn't load the activity feed: ${error}`
              : !view
                ? "Reading the order tickets…"
                : date
                  ? `Nothing was recorded on ${date}.`
                  : mine === "only"
                    ? "Nothing from this device yet."
                    : mine === "hide"
                      ? "Nothing yet from anyone but this device."
                      : "Nothing has happened yet."}
          </p>
        </section>
        {dayPicker}
        {mineSection}
      </>
    );
  }

  const rowFor = (r: ActivityRoundView, indented: boolean) => {
    const open = expanded.has(r.roundId);
    const dim = spotlight !== null && r.playerId !== spotlight;
    const cls = [
      "act-row",
      indented ? "act-row--nested" : "",
      fresh.has(r.roundId) ? "act-row--fresh" : "",
      dim ? "act-row--dim" : "",
      spotlight !== null && !dim ? "act-row--lit" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <tbody key={r.roundId} className={cls}>
        <tr>
          <td>
            <button
              type="button"
              className="act-when"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} the beacons for this round`}
              onClick={() => toggleRound(r.roundId)}
            >
              <span className="act-caret" aria-hidden="true">
                {open ? "▾" : "▸"}
              </span>
              <span>
                <span className="ev-when">{ago(Date.parse(r.lastAt), now)}</span>
                <span className="ev-sub">{gameTimestamp(new Date(r.lastAt))} ET</span>
              </span>
            </button>
          </td>
          <td>
            <Arc round={r} />
          </td>
          <td>
            <span className={`kind-legend__dot kind-legend__dot--${kindCls(r.kind)}`} />
            {kindLabel(r.kind)}
          </td>
          <td>
            {/* Random rounds ignore the schedule, so a puzzle number doesn't
                apply — only the day it was played. */}
            {r.dishId !== null && r.dishName ? (
              <button className="link-btn ev-when" onClick={() => onOpenDishReport(r.dishId as number)}>
                {r.dishName}
              </button>
            ) : (
              <span className="ev-when">{r.dishName ?? "—"}</span>
            )}
            <span className="ev-sub">{r.kind === "random" ? r.date : `#${r.puzzleNumber} · ${r.date}`}</span>
          </td>
          <td>
            <Result round={r} now={now} />
          </td>
          <td>
            <span className="ev-when">{surfaceLabel(r.surface)}</span>
            <span className="ev-sub">{r.country ? countryName(r.country) : "—"}</span>
          </td>
          <td>
            {r.playerId ? (
              <button
                type="button"
                className={`act-device${spotlight === r.playerId ? " act-device--lit" : ""}`}
                title={`${r.playerId} — click to follow this device`}
                onClick={() => setSpotlight(spotlight === r.playerId ? null : r.playerId)}
              >
                <code className="ev-player">{r.playerId.slice(0, 8)}</code>
                {/* Flags your own test rounds even in "All" mode — makes the
                    filter above discoverable. */}
                {r.playerId === myId && <span className="ev-you">you</span>}
              </button>
            ) : (
              "—"
            )}
          </td>
        </tr>
        {open && (
          <tr className="act-detail">
            <td colSpan={7}>
              <BeaconList round={r} />
              <p className="dash-note">
                Round <code className="ev-player">{r.roundId}</code> · played {r.playedDay} ET
                {r.date !== r.playedDay && ` · puzzle dated ${r.date}`}
              </p>
            </td>
          </tr>
        )}
      </tbody>
    );
  };

  // A group's header is its own <tbody> and each of its rounds is another, so an
  // expanded round can add a second <tr> without nesting tables — and the header
  // and its rounds stay in document order.
  const body =
    group === "log"
      ? view.rows.map((r) => rowFor(r, false))
      : view.groups.flatMap((g) => [
          <tbody key={`${g.key}-head`} className="act-groupwrap">
            <GroupHeader
              group={g}
              open={!collapsedGroups.has(g.key)}
              onToggle={() =>
                setCollapsedGroups((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(g.key)) next.add(g.key);
                  return next;
                })
              }
              myId={myId}
              spotlight={spotlight}
              onSpotlight={setSpotlight}
            />
          </tbody>,
          ...(collapsedGroups.has(g.key) ? [] : g.rounds.map((r) => rowFor(r, true))),
        ]);

  return (
    <>
      <section className="panel">
        {header}

        <FilterBar filter={filter} facets={view.facets} onChange={setFilter} />

        {spotlight && (
          <p className="act-spotlight">
            Following device <code className="ev-player">{spotlight.slice(0, 8)}</code> —{" "}
            {view.rows.filter((r) => r.playerId === spotlight).length} round
            {view.rows.filter((r) => r.playerId === spotlight).length === 1 ? "" : "s"} in view.{" "}
            <button className="link-btn" onClick={() => setSpotlight(null)}>
              Clear
            </button>
          </p>
        )}

        <div className="day-table-wrap">
          <table className="day-table event-table act-table">
            <thead>
              <tr>
                <th>When</th>
                <th title="Started · finished · shared">Arc</th>
                <th>Game</th>
                <th>Dish</th>
                <th>Result</th>
                <th>Where</th>
                <th title="Anonymous per-device id">Device</th>
              </tr>
            </thead>
            {body}
          </table>
        </div>

        <p className="dash-note" style={{ marginTop: 8 }}>
          Newest activity first · {view.rows.length}
          {view.rows.length !== view.total && ` of ${view.total}`} round
          {view.total === 1 ? "" : "s"} in view
          {date && ` · ${date} only`}
          {mine === "only" && " · this device only"}
          {mine === "hide" && " · this device hidden"}
          {view.unattributed > 0 &&
            ` · ${view.unattributed} with no device id (only the start beacon carries one)`}
          {feed?.hasMore && limit < ACTIVITY_MAX && (
            <>
              {" · "}
              <button
                className="link-btn"
                onClick={() => setLimit((n) => Math.min(n + ACTIVITY_PAGE, ACTIVITY_MAX))}
              >
                Show more
              </button>
            </>
          )}
        </p>
        {group === "visit" && (
          <p className="dash-note">
            A visit is one device on one ET day — the same unit the player funnel's first rung and the
            repeat-visit curve count, so "session" here means what it means everywhere else on this dashboard.
            One can legitimately span the whole day, which is why each header prints its span. A header showing
            "3 of 9" is telling you the device played nine rounds that day and three of them are on this page.
          </p>
        )}
        {feed?.since && (
          <p className="dash-note">
            Back to {etStamp(feed.since)}. Arrivals are shown from the start of that ET day, so the oldest day
            on the page carries its bounces too — devices that opened a board and never guessed.
          </p>
        )}
      </section>
      {dayPicker}
      {mineSection}
    </>
  );
}
