/**
 * Small pieces shared by the dashboard's analytics tabs (Overview / Players /
 * Trends / Activity). They used to live inline in Dashboard.tsx when everything
 * rendered as one long scroll; the tabs each need a subset, so they live here.
 */
import type { AnalyticsPeriod, PlayerSplit, RoundKind, StartedByKind, Surface } from "../../shared/types";

export const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));

/**
 * The three game kinds, in display order. The first (daily) is the priority
 * metric — "Today's Special". `cls` ties each to its bar colour in admin.css.
 */
export const KIND_META: { key: RoundKind; label: string; cls: string }[] = [
  { key: "daily", label: "Today's Special", cls: "daily" },
  { key: "leftover", label: "Leftovers", cls: "leftover" },
  { key: "random", label: "Chef's Choice", cls: "random" },
];

export const kindLabel = (k: RoundKind) => KIND_META.find((m) => m.key === k)?.label ?? k;
export const kindCls = (k: RoundKind) => KIND_META.find((m) => m.key === k)?.cls ?? k;

export const sumKinds = (s: StartedByKind) => s.daily + s.leftover + s.random;

/** "2026-07-19" → "7/19" for compact axis labels (parsed as plain digits, no timezone). */
export const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
};

/** Mean guesses across solved rounds, or null when nothing has been solved yet. */
export function avgGuesses(dist: number[]): number | null {
  const solved = dist.reduce((a, b) => a + b, 0);
  if (solved === 0) return null;
  return dist.reduce((sum, n, i) => sum + n * (i + 1), 0) / solved;
}

/**
 * Games started, split into the three kinds — Today's Special (the priority
 * metric, shown first and emphasised), Leftovers, and Chef's Choice. Each tile
 * carries the colour of its bar-graph segment.
 */
export function StartedByKindRow({ startedByKind }: { startedByKind: StartedByKind }) {
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

/**
 * Completion / win rates for a slice of rounds, plus the raw share count —
 * shares are rare enough that a percentage of completions rounded to noise, so
 * the tile reports how many results actually went out.
 */
export function RatesRow({ totals }: { totals: AnalyticsPeriod["totals"] }) {
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
        <span className="metric__num">{totals.shared}</span>
        <span className="metric__label">Share count</span>
      </div>
    </div>
  );
}

/**
 * New vs returning player tiles. A "player" is an anonymous device; new = first
 * play ever, returning = played on an earlier day too.
 *
 * `players` is null for a slice that predates player tracking, which is not the
 * same thing as a slice where nobody played — the tiles show "—" rather than 0,
 * because 0 would be a measurement this slice never made.
 */
export function PlayersRow({
  players,
  trackingStart,
}: {
  players: PlayerSplit | null;
  trackingStart?: string | null;
}) {
  return (
    <>
      <div className="metric-row">
        <div className="metric metric--player metric--player-new">
          <span className="metric__num">{players?.new ?? "—"}</span>
          <span className="metric__label">New players</span>
        </div>
        <div className="metric metric--player metric--player-returning">
          <span className="metric__num">{players?.returning ?? "—"}</span>
          <span className="metric__label">Returning players</span>
        </div>
      </div>
      {players === null && <p className="dash-note">{untrackedNote(trackingStart)}</p>}
    </>
  );
}

/** The one wording for "we weren't counting players yet", used wherever a slice is null. */
export function untrackedNote(trackingStart?: string | null): string {
  return trackingStart
    ? `Player tracking didn't start until ${trackingStart} — not measured before that, which isn't the same as zero.`
    : "Player tracking hasn't recorded anything yet.";
}

/** The colour key shared by the started-by-kind tiles and the daily bar graph. */
export function KindLegend() {
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
export function GuessBars({ dist, fails }: { dist: number[]; fails: number }) {
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

/** Surface filter options for the analytics tabs, in display order. */
export type SurfaceFilter = "all" | Surface;
const SURFACE_FILTERS: { key: SurfaceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "web", label: "Web" },
  { key: "discord", label: "Discord" },
];

/**
 * Segmented control that slices every analytics tab by play surface. It lives in
 * the dashboard tab bar, so the choice survives switching tabs.
 */
export function SurfaceToggle({
  value,
  onChange,
}: {
  value: SurfaceFilter;
  onChange: (s: SurfaceFilter) => void;
}) {
  return (
    <div className="surface-toggle" role="tablist" aria-label="Filter analytics by surface">
      {SURFACE_FILTERS.map((s) => (
        <button
          key={s.key}
          role="tab"
          aria-selected={value === s.key}
          className={`surface-toggle__btn${value === s.key ? " surface-toggle__btn--active" : ""}`}
          onClick={() => onChange(s.key)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** The wording every tab uses when the surface filter has emptied it out. */
export function noRoundsNote(surface: SurfaceFilter): string {
  return surface === "all"
    ? "No rounds recorded yet. Numbers show up here once players start playing."
    : `No ${surface === "web" ? "web" : "Discord"} rounds recorded yet.`;
}
