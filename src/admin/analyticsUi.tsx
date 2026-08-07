/**
 * Small pieces shared by the dashboard's analytics tabs (Overview / Players /
 * Trends / Activity). They used to live inline in Dashboard.tsx when everything
 * rendered as one long scroll; the tabs each need a subset, so they live here.
 */
import type {
  AnalyticsHour,
  AnalyticsPace,
  AnalyticsPeriod,
  DayServiceTotals,
  PlayerSplit,
  RoundKind,
  StartedByKind,
  Surface,
} from "../../shared/types";

export const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));

/** How long ago an instant was, in the roughest unit that still reads right. */
export function ago(atMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "14" → "14:00", the one way this dashboard writes an hour of the day. */
export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

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

/**
 * Country codes come out of the DB as ISO 3166-1 alpha-2 (see migrations/0018);
 * `Intl.DisplayNames` turns them into English names, so no country table has to
 * be shipped or kept current. It throws on structurally invalid input and simply
 * echoes an unassigned-but-valid code, so both fall back to the code itself.
 */
const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/** An alpha-2 code as a readable place, including Cloudflare's two non-countries. */
export function countryName(code: string): string {
  if (code === "T1") return "Tor network";
  if (code === "XX") return "Unknown";
  try {
    return REGION_NAMES?.of(code) ?? code;
  } catch {
    return code;
  }
}

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
 * How a day's Special played against the all-time average, in one sentence, or
 * null when either side has no solves to average. Shared by the Overview and
 * Players tabs so the two can't drift into describing the same number
 * differently.
 *
 * More guesses = the puzzle was harder, which is the read worth acting on: it's
 * the signal for whether the clue ladder is landing.
 */
export function difficultyNote(dayDist: number[], allTimeDist: number[], isToday: boolean): string | null {
  const dayAvg = avgGuesses(dayDist);
  const allTimeAvg = avgGuesses(allTimeDist);
  if (dayAvg === null || allTimeAvg === null) return null;
  const delta = dayAvg - allTimeAvg;
  if (Math.abs(delta) < 0.005) return "Right on the all-time average.";
  const harder = delta > 0;
  return `${harder ? "▲" : "▼"} ${Math.abs(delta).toFixed(2)} ${harder ? "more" : "fewer"} guesses than average — ${
    isToday ? "today's" : "that day's"
  } Special played ${harder ? "harder" : "easier"}.`;
}

/** Games started from midnight ET through the end of `hour`. */
export function cumulativeThrough(hours: AnalyticsHour[], hour: number): number {
  return hours.reduce((total, h) => (h.hour > hour ? total : total + sumKinds(h.startedByKind)), 0);
}

/**
 * Whether the day is running ahead of or behind the days before it, in one
 * sentence, or null when there's no baseline worth quoting.
 *
 * Mid-service, "41 games started" is unreadable on its own — it could be a
 * record day or half a normal one. The comparison is made at the *same point in
 * the day* (cumulative through the current ET hour) so a morning glance isn't
 * measured against a full day's total.
 *
 * Returns null when the baseline at this point is under one game: a percentage
 * off a fraction is noise, and an empty line beats a confident wrong number.
 */
export function paceNote({
  pace,
  hours,
  isToday,
  dayStarted,
  nowHour,
}: {
  pace: AnalyticsPace | null;
  hours: AnalyticsHour[];
  isToday: boolean;
  /** The day's total games started — used for a past day, where "by now" is the whole day. */
  dayStarted: number;
  /** Current ET hour; only meaningful for today. */
  nowHour: number;
}): string | null {
  if (pace === null) return null;
  // A finished day is compared end-to-end; today is compared as far as it's got.
  const hour = isToday ? nowHour : 23;
  const actual = isToday ? cumulativeThrough(hours, hour) : dayStarted;
  const typical = pace.typical[hour] ?? 0;
  if (typical < 1) return null;

  const span = `the last ${pace.days} day${pace.days === 1 ? "" : "s"}${isToday ? " at this hour" : ""}`;
  const rounded = typical.toFixed(typical < 10 ? 1 : 0);
  const detail = `(${actual} vs ~${rounded}${isToday ? "" : " for a full day"})`;
  const delta = (actual - typical) / typical;
  if (Math.abs(delta) < 0.1) return `On pace with ${span} ${detail}.`;
  return `${delta > 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta * 100))}% ${
    delta > 0 ? "ahead of" : "behind"
  } ${span} ${detail}.`;
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

/**
 * One day's games-started profile by ET hour, each column stacked by game kind —
 * the same bottom-up Special/Leftovers/Chef's Choice order (and colours) as the
 * daily spark on the Trends tab, so the two charts read as one system.
 *
 * `nowHour` matters more than it looks: on today, the hours after it **haven't
 * happened yet**, and an empty column is not the same claim as "nobody played
 * then". Those columns are drawn faded, so a quiet afternoon and an afternoon
 * that hasn't arrived don't look identical. Pass null for a finished day, where
 * every hour is a real measurement.
 */
export function HourlyByKind({ hours, nowHour }: { hours: AnalyticsHour[]; nowHour: number | null }) {
  const totals = hours.map((h) => sumKinds(h.startedByKind));
  const max = Math.max(1, ...totals);
  return (
    <div className="hourly">
      {hours.map((h, i) => {
        const n = totals[i];
        const future = nowHour !== null && h.hour > nowHour;
        const tip = KIND_META.map((k) => `${k.label}: ${h.startedByKind[k.key]}`).join(", ");
        return (
          <div
            className={`hourly__col${future ? " hourly__col--future" : ""}`}
            key={h.hour}
            title={future ? `${hourLabel(h.hour)} ET — not yet` : `${hourLabel(h.hour)} ET — ${n} started (${tip})`}
          >
            {n > 0 && <span className="hourly__num">{n}</span>}
            <span
              className="hourly__bar hourly__bar--stacked"
              style={{ height: `${n === 0 ? 0 : 6 + (n / max) * 94}%` }}
            >
              {KIND_META.map((k) => {
                const seg = h.startedByKind[k.key];
                if (seg === 0) return null;
                return (
                  <span
                    key={k.key}
                    className={`hourly__seg hourly__seg--${k.cls}`}
                    style={{ height: `${(seg / n) * 100}%` }}
                  />
                );
              })}
            </span>
            {h.hour % 3 === 0 && <span className="hourly__tick">{String(h.hour).padStart(2, "0")}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Did-not-finish: started but never reached game over. Named, so it can't be misread. */
export const DNF_NOTE =
  "DNF — did not finish: started but never reached game over. Still playing, or walked away.";

/**
 * How far a day's games got: what share were finished, and what share of *those*
 * were shared.
 *
 * Two tracks with **different denominators**, not a funnel. In a funnel the top
 * bar is by definition full width, so it burns a row without carrying a value,
 * and every later bar is read against a baseline that isn't drawn. Here each
 * track is the denominator and the fill is the answer, so both rows do work.
 *
 * Colours are the Activity feed's **event** palette (finish = cherry, share =
 * mustard) so one event means one colour dashboard-wide. The kind palette is
 * deliberately not reused: mustard/teal/cherry already mean Special / Leftovers
 * / Chef's Choice on every other chart, and borrowing them here — even permuted
 * — makes a completion rate look like a game mode.
 */
export function FinishRate({ totals }: { totals: DayServiceTotals }) {
  const dnf = Math.max(0, totals.started - totals.completed);
  const rows = [
    {
      key: "done",
      n: totals.completed,
      of: totals.started,
      label: "finished",
      ofLabel: "started",
      // The players who dropped, named rather than left as arithmetic — but
      // trailing the finishers, which is the number worth watching.
      rest: dnf > 0 ? `${dnf} DNF` : null,
    },
    { key: "shared", n: totals.shared, of: totals.completed, label: "shared", ofLabel: "finished", rest: null },
  ];
  return (
    <div className="finish">
      {rows.map((r) => (
        <div className="finish__row" key={r.key}>
          <div className="finish__track">
            <span
              className={`finish__fill finish__fill--${r.key}`}
              style={{ width: `${pct(r.n, r.of)}%` }}
            />
          </div>
          <p className="finish__legend">
            <span className={`finish__dot finish__dot--${r.key}`} />
            <strong className="finish__num">{r.n}</strong> {r.label}
            {/* Skip the ratio when the denominator is 0 — "0% of 0 finished" is
                noise, and nothing was shared because nothing finished. */}
            {r.of > 0 && (
              <span className="finish__of">
                {pct(r.n, r.of)}% of {r.of} {r.ofLabel}
              </span>
            )}
            {r.rest && (
              <span className="finish__rest" title={DNF_NOTE}>
                {r.rest}
              </span>
            )}
          </p>
        </div>
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
