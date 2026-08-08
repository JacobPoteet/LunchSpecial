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
  OpenRounds,
  PlayerSplit,
  RoundKind,
  SolveTimes,
  StartedByKind,
  Surface,
} from "../../shared/types";
import { DNF_GRACE_MINUTES } from "../../shared/types";
import { rangeLabel, rate, SMALL_SAMPLE_MIN } from "../../shared/sample";

export const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));

/** The one wording for why a percentage is carrying a range. */
export const SAMPLE_NOTE =
  `Under ${SMALL_SAMPLE_MIN} rounds the percentage moves several points on one player, so the range ` +
  `it plausibly sits in (95% confidence) is shown beside it.`;

/**
 * The honest range around a rate — but only when the sample is thin enough that
 * the point estimate can't carry itself. See shared/sample.ts.
 *
 * Rendered selectively on purpose. An interval on every number on the page
 * teaches you to stop reading them; an interval on exactly the numbers that need
 * one is a signal about which numbers those are.
 */
export function RangeHint({ n, of }: { n: number; of: number }) {
  const label = rangeLabel(rate(n, of));
  if (label === null) return null;
  return (
    <span className="rate-range" title={SAMPLE_NOTE}>
      {label}
    </span>
  );
}

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
 *
 * Withheld under {@link DIFFICULTY_MIN_SOLVES}. One player having a bad morning
 * moves a two-solve average by a whole guess, and "▲ 0.90 more guesses than
 * average" is a very confident way to say nothing — the same rule `paceNote`
 * follows for a baseline under one game.
 */
export const DIFFICULTY_MIN_SOLVES = 5;

export function difficultyNote(dayDist: number[], allTimeDist: number[], isToday: boolean): string | null {
  const daySolves = dayDist.reduce((a, b) => a + b, 0);
  if (daySolves < DIFFICULTY_MIN_SOLVES) return null;
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
        <RangeHint n={totals.completed} of={totals.started} />
      </div>
      <div className="metric">
        <span className="metric__num">{pct(totals.solved, totals.completed)}%</span>
        <span className="metric__label">Win rate</span>
        <RangeHint n={totals.solved} of={totals.completed} />
      </div>
      <div className="metric">
        <span className="metric__num">{totals.shared}</span>
        <span className="metric__label">Share count</span>
      </div>
    </div>
  );
}

/** Minutes as a duration a person would say out loud: "3m", "1h 20m". */
export function minutesLabel(minutes: number): string {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * How long a solved round takes — the difficulty signal guess count can't give.
 *
 * Median and p90, never a mean: a round is a browser tab, and the handful opened
 * at breakfast and finished at lunch are real rows that would drag an average by
 * minutes. The p90 is the honest way to show that tail without letting it set the
 * headline — "half solve inside 3m, the slow tenth take over 20m" is two facts,
 * where a mean of 14m would be neither.
 */
export function SolveTimeRead({ times }: { times: SolveTimes }) {
  if (times.medianMinutes === null) {
    return <p className="dash-note">No solved round has been timed yet.</p>;
  }
  return (
    <div className="metric-row" style={{ marginBottom: 0 }}>
      <div className="metric">
        <span className="metric__num">{minutesLabel(times.medianMinutes)}</span>
        <span className="metric__label">Typical solve</span>
      </div>
      <div className="metric" title="Nine in ten solved rounds finish inside this. The slow tail, without letting it set the headline.">
        <span className="metric__num">{times.p90Minutes === null ? "—" : minutesLabel(times.p90Minutes)}</span>
        <span className="metric__label">Slowest tenth</span>
      </div>
      <div className="metric">
        <span className="metric__num">{times.count}</span>
        <span className="metric__label">Rounds timed</span>
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

/**
 * The one wording for a round that started and never reported finishing — and
 * for why that isn't one number.
 */
export const DNF_NOTE =
  `Started but never reached game over. A round begun in the last ${DNF_GRACE_MINUTES / 60} hours is ` +
  `counted as still playing; older than that and nobody is coming back to it.`;

/**
 * How far a day's games got: what share were finished, and what share of *those*
 * were shared.
 *
 * Two tracks with **different denominators**, not a funnel. In a funnel the top
 * bar is by definition full width, so it burns a row without carrying a value,
 * and every later bar is read against a baseline that isn't drawn. Here each
 * track is the denominator and the fill is the answer, so both rows do work.
 *
 * The unfinished remainder is **split, not lumped**. This used to report the
 * whole gap as "DNF" and clamp it at zero, which mid-afternoon reads a full diner
 * as a mass walkout: on a live day most of that gap is people who are still
 * playing. Start and complete are independent beacons, so the split can't come
 * from the rows themselves — it comes from how old each start cohort is (see
 * foldDayService). Both halves are named; neither is inferred silently.
 *
 * Colours are the Activity feed's **event** palette (finish = cherry, share =
 * mustard) so one event means one colour dashboard-wide. The kind palette is
 * deliberately not reused: mustard/teal/cherry already mean Special / Leftovers
 * / Chef's Choice on every other chart, and borrowing them here — even permuted
 * — makes a completion rate look like a game mode.
 */
export function FinishRate({
  totals,
  open,
  visited,
  playedBy,
}: {
  totals: DayServiceTotals;
  open: OpenRounds;
  /** Devices that opened a board. Null before the visit beacon shipped — the row is omitted. */
  visited?: number | null;
  /**
   * Devices that went on to make a guess. **Devices, not rounds** — see below.
   * Null when player tracking has nothing for the day.
   */
  playedBy?: number | null;
}) {
  const rest = [
    open.inProgress > 0 ? `${open.inProgress} still playing` : null,
    open.abandoned > 0 ? `${open.abandoned} walked out` : null,
  ].filter(Boolean) as string[];
  // The top row counts **people**, the rows under it count **games**, and that
  // switch is not sloppiness — it's the only way the arithmetic is true. A visit
  // is one device per day, while `started` counts rounds, so a player who does
  // the Special and three Leftovers is one arrival and four starts: dividing
  // those would report a 400% play rate. So the funnel's first question is "of
  // the people who showed up, how many played", and only then does it switch to
  // games. Both rows name their own unit so the change is legible.
  const showTop = visited !== null && visited !== undefined && playedBy !== null && playedBy !== undefined;
  const rows = [
    ...(showTop
      ? [
          {
            key: "played",
            n: playedBy,
            of: visited,
            label: "people played",
            ofLabel: "opened the game",
            rest: visited > playedBy ? `${visited - playedBy} looked and left` : null,
          },
        ]
      : []),
    {
      key: "done",
      n: totals.completed,
      of: totals.started,
      label: "games finished",
      ofLabel: "started",
      rest: rest.length > 0 ? rest.join(" · ") : null,
    },
    { key: "shared", n: totals.shared, of: totals.completed, label: "shared", ofLabel: "finished", rest: null },
  ];
  return (
    <div className="finish">
      {rows.map((r) => (
        <div className="finish__row" key={r.key}>
          <div className="finish__track">
            {/* The *bar* is clamped, the reported percentage beside it is not.
                A ratio here can legitimately exceed 100%: the beacons are
                independent, so a round begun at 11:58pm files its start on the
                next ET day from the arrival that preceded it, and a blocked
                visit beacon leaves a player who plainly played. Clamping the
                number would hide that; clamping only the fill keeps the row
                readable while the figure stays honest. */}
            <span
              className={`finish__fill finish__fill--${r.key}`}
              style={{ width: `${Math.min(100, pct(r.n, r.of))}%` }}
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
                <RangeHint n={r.n} of={r.of} />
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
