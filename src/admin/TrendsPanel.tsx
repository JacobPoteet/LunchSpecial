import type {
  AnalyticsDay,
  AnalyticsSummary,
  CountryMix,
  CountryUsage,
  GameGrowth,
  GrowthTrend,
  PlayerRetention,
  RetentionStep,
} from "../../shared/types";
import {
  countryName,
  KIND_META,
  KindLegend,
  noRoundsNote,
  pct,
  shortDate,
  untrackedNote,
  type SurfaceFilter,
} from "./analyticsUi";

/**
 * Below this many players a rung's percentage is one person's mood, so it's
 * flagged rather than quoted flat. Not hidden: "how many of my three-timers came
 * back" is the whole question, and a blank row answers it worse than a caveat.
 */
const RETENTION_MIN_COHORT = 10;

/**
 * Inside ±15% of the all-time average pace, "gaining" and "stalling" are both
 * overclaims — a couple of good afternoons move a week's rate by more than that.
 */
const GROWTH_STEADY_BAND = 0.15;

/** Small numbers keep a decimal; past ~10 games a day the fraction is false precision. */
const games = (n: number) => (Math.abs(n) < 10 ? n.toFixed(1) : Math.round(n).toString());

/**
 * The growth chart's headline: gaining, steady, or stalling.
 *
 * A cumulative curve always rises, so "is it going up" is never the question —
 * whether it's *bending* is. This states that as two paces rather than as a
 * shape: what the last week actually ran at, against the average pace over the
 * whole run (the slope of the straight reference line). Ahead of it the curve is
 * pulling above the line; behind it, flattening off.
 *
 * Both are real measured rates — the recent one straight off the running total —
 * so neither is a forecast, and the sentence never claims where the curve goes
 * next.
 */
function growthNote(trend: GrowthTrend, since: string): string {
  const lately = `the last ${trend.recentDays} days`;
  const average = `${games(trend.slope)} a day average since ${shortDate(since)}`;

  // A flat tail is the one case where a ratio would be silly: nothing happened.
  if (trend.recentPerDay === 0) {
    return `■ Stalled — no games at all in ${lately}. The curve has gone flat against a ${average}.`;
  }
  // Cumulative series only rise, so a non-positive slope means the whole run is
  // one burst and there's no average worth dividing by.
  if (trend.slope <= 0) {
    return `${lately} ran about ${games(trend.recentPerDay)} games a day.`;
  }

  const ratio = trend.recentPerDay / trend.slope;
  const recent = `${lately} ran about ${games(trend.recentPerDay)} games a day`;
  if (ratio > 1 + GROWTH_STEADY_BAND) {
    return `▲ Gaining — ${recent}, ahead of the ${average}. The curve is pulling above its steady-pace line.`;
  }
  if (ratio < 1 - GROWTH_STEADY_BAND) {
    return `▼ Losing steam — ${recent}, behind the ${average}. The curve is flattening off.`;
  }
  return `Holding steady — ${recent}, in line with the ${average}. Growth is straight-line, not compounding.`;
}

/**
 * The running total of games played since the first round ever recorded, with
 * the constant-pace line through it (GitHub #90).
 *
 * All-time and every kind together, which is what makes it a growth chart rather
 * than a second copy of the 30-day spark below: growth is the thing a moving
 * window is least able to show, and splitting by mode would answer "what are
 * they playing" instead of "are more people playing".
 *
 * **Cumulative on purpose.** A per-day series is dominated by which day of the
 * week you're looking at; the running total absorbs that, so the shape is the
 * answer — steepening means the game is gaining, flattening means it's stalling.
 * The trade is that a cumulative curve can never fall, so "it's going up" stops
 * carrying information: everything here is built to make the *bend* legible.
 *
 * Three choices worth keeping:
 *
 * - **The straight dashed line is the reference the bend is read against.** It's
 *   the least-squares fit through the curve, i.e. what the run would look like at
 *   one constant pace; the curve above it at the right = gaining, below =
 *   stalling. Without it a cumulative chart is unreadable, because every such
 *   chart looks like success.
 * - **The fit is clipped, never clamped.** An accelerating run has its best-fit
 *   line crossing zero *before* day one, so the line legitimately leaves the plot
 *   at the bottom-left; pinning it to the axis would flatten the pace it exists
 *   to state. It's also the only dashed, uncoloured line on the dashboard — ink
 *   rather than a series hue, because it isn't a measurement.
 * - **Quiet days are flat steps, not skipped days.** The series is filled
 *   server-side (worker/growth.ts) so the x-axis is calendar time; closing the
 *   gap over a dead week would sell it as continuous play.
 */
function GrowthChart({ growth }: { growth: GameGrowth }) {
  const { days, trend } = growth;
  const W = 660;
  const H = 200;
  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const n = days.length;
  const x = (i: number) =>
    n <= 1 ? padL + (W - padL - padR) / 2 : padL + (i / (n - 1)) * (W - padL - padR);
  // The series only rises, so the last day is the maximum — and the top of the
  // axis is the all-time total, which is the number the chart is about.
  const total = days[n - 1].cumulative;
  const max = Math.max(1, total);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);

  const line = days
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.cumulative).toFixed(1)}`)
    .join(" ");
  // Closed back along the baseline so the run reads as accumulated mass — same
  // hue as the line, so it adds no second meaning.
  const area = `${line} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const xTickStep = Math.max(1, Math.ceil(n / 6));
  const yTicks = [...new Set([0, Math.round(max / 2), max])];

  return (
    <div className="gchart">
      <div className="gchart__legend">
        <span className="gchart__legend-item">
          <span className="gchart__swatch gchart__swatch--played" />
          Games played (running total)
        </span>
        {trend && (
          <span className="gchart__legend-item">
            <span className="gchart__swatch gchart__swatch--trend" />
            Steady pace
          </span>
        )}
      </div>
      <svg
        className="gchart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Running total of games played from ${days[0].date} to ${
          days[n - 1].date
        }, reaching ${total}${
          trend
            ? `. The last ${trend.recentDays} days ran at ${games(
                trend.recentPerDay,
              )} games a day against an all-time average of ${games(trend.slope)}`
            : ""
        }.`}
        preserveAspectRatio="none"
      >
        <defs>
          <clipPath id="gchart-plot">
            <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} />
          </clipPath>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="gchart__grid" x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} />
            <text className="gchart__axis" x={padL - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {v}
            </text>
          </g>
        ))}
        <path className="gchart__area" d={area} />
        <path className="gchart__line" d={line} fill="none" />
        {trend && (
          <line
            className="gchart__trend"
            clipPath="url(#gchart-plot)"
            x1={x(0)}
            y1={y(trend.first)}
            x2={x(n - 1)}
            y2={y(trend.last)}
          />
        )}
        {n <= 45 &&
          days.map((d, i) => (
            <circle className="gchart__dot" key={d.date} cx={x(i)} cy={y(d.cumulative)} r={2.6}>
              {/* The day's own count is only visible here: on the curve itself a
                  busy day and a dead one are both just "higher than yesterday". */}
              <title>{`${d.date} · ${d.cumulative} total (+${d.started} that day)`}</title>
            </circle>
          ))}
        {days.map((d, i) =>
          i % xTickStep === 0 || i === n - 1 ? (
            <text key={d.date} className="gchart__axis" x={x(i)} y={H - 6} textAnchor="middle">
              {shortDate(d.date)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

/**
 * The headline read, in the one sentence a restaurant owner would want: how
 * often does a first-timer come back, and how much better does that get once
 * they already have?
 *
 * Null until **both** rungs clear {@link RETENTION_MIN_COHORT}, following the
 * same rule `paceNote` uses for a baseline under one game. The rungs themselves
 * can quote a thin cohort because each one prints its own "1 of 1" denominator
 * beside the percentage; a prose sentence can't carry that, and "once they've
 * come twice, 100%" off a single player is a claim the data hasn't earned.
 */
function retentionNote(steps: RetentionStep[], windowDays: number): string | null {
  const first = steps.find((s) => s.visits === 1);
  const second = steps.find((s) => s.visits === 2);
  if (!first || !second) return null;
  if (first.atRisk < RETENTION_MIN_COHORT || second.atRisk < RETENTION_MIN_COHORT) return null;
  const a = pct(first.returned, first.atRisk);
  const b = pct(second.returned, second.atRisk);
  const lead = `A first-timer comes back within ${windowDays} days ${a}% of the time; once they've come twice, ${b}%.`;
  if (b > a + 5) return `${lead} The second visit is where regulars are made — the earlier you can earn it, the better every later number gets.`;
  if (a > b + 5) return `${lead} Repeat visits are getting less likely rather than more — worth checking whether the later days are landing.`;
  return `${lead} The odds barely move with familiarity, so what wins a second visit is winning a first.`;
}

/**
 * The repeat-visit curve: of the players who have visited N times, how many came
 * back for an N+1th? A visit is a *day* the device played on, which is the unit
 * that means "came back" in a game that resets at midnight.
 *
 * Built as tracks rather than a funnel, for the same reason `FinishRate` is: each
 * rung has its **own** denominator (the players who reached that many visits), so
 * the track is the cohort and the fill is the answer, and no row is the
 * always-full first bar a funnel wastes. Cohorts do shrink down the ladder, but
 * that's what the "17 of 50" reads say — encoding it as bar width too would
 * spend the axis on a number already written twice.
 *
 * The fill is **teal**, which already means "returning player" on the line chart
 * above and the player tiles. Not the kind palette (game mode) and not the event
 * palette (start/finish/share) — a third meaning on borrowed colours is how a
 * dashboard stops being readable.
 */
function RetentionCurve({ retention }: { retention: PlayerRetention }) {
  const { steps, windowDays } = retention;
  const lateTotal = steps.reduce((n, s) => n + s.lateReturned, 0);

  return (
    <div className="retention">
      {steps.map((s) => {
        // Everyone at this rung is still inside their window: there is no rate to
        // draw yet, and 0% would be an answer we haven't earned.
        const unanswered = s.atRisk === 0;
        const rest = [
          s.lateReturned > 0 ? `+${s.lateReturned} came back later` : null,
          s.pending > 0 ? `${s.pending} still in window` : null,
          !unanswered && s.atRisk < RETENTION_MIN_COHORT ? "small sample" : null,
        ].filter(Boolean) as string[];

        return (
          <div className="retention__row" key={s.visits}>
            <span className="retention__key">
              after {ordinal(s.visits)} visit
            </span>
            <div className="retention__body">
              <div className="retention__track">
                <span
                  className="retention__fill"
                  style={{ width: `${unanswered ? 0 : pct(s.returned, s.atRisk)}%` }}
                />
              </div>
              <p className="retention__legend">
                {unanswered ? (
                  <span className="retention__of">
                    Nobody's {windowDays} days are up yet — no rate to report.
                  </span>
                ) : (
                  <>
                    <span className="retention__dot" />
                    <strong className="retention__num">{pct(s.returned, s.atRisk)}%</strong> came back
                    <span className="retention__of">
                      {s.returned} of {s.atRisk} player{s.atRisk === 1 ? "" : "s"}
                    </span>
                  </>
                )}
                {rest.length > 0 && <span className="retention__rest">{rest.join(" · ")}</span>}
              </p>
            </div>
          </div>
        );
      })}
      <p className="dash-note">
        A “visit” is an ET day this device played on — any game kind, so four leftovers in one sitting is
        one visit, the way a diner counts covers and not courses. Each rung counts only players whose{" "}
        {windowDays} days are already up, so today's arrivals sit out rather than counting as no-shows
        {lateTotal > 0 &&
          `, and the ${lateTotal} who came back after their window closed are listed beside the rung they lapsed on`}
        .
      </p>
    </div>
  );
}

/**
 * How many countries get their own slice before the tail is pooled into
 * "Elsewhere". Past about this many the slices are thinner than their own border
 * and the legend is doing all the work anyway.
 */
const MAX_COUNTRY_SLICES = 8;

/** A point on the pie's rim. `t` is turns clockwise from 12 o'clock, 0..1. */
function rim(cx: number, cy: number, r: number, t: number): string {
  const a = t * Math.PI * 2;
  return `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`;
}

/** One wedge, from `t0` to `t1` turns clockwise from 12 o'clock. */
function wedge(cx: number, cy: number, r: number, t0: number, t1: number): string {
  const large = t1 - t0 > 0.5 ? 1 : 0;
  return `M${cx},${cy} L${rim(cx, cy, r, t0)} A${r},${r} 0 ${large} 1 ${rim(cx, cy, r, t1)} Z`;
}

/** A slice as drawn: the pooled tail carries no code, only how many it stands for. */
interface Slice {
  key: string;
  label: string;
  players: number;
  rounds: number;
  /** Countries pooled into this slice — 1 for a real country, more for "Elsewhere". */
  places: number;
  /** Ramp step, or -1 for the pooled tail (which is grey, not a rank). */
  rank: number;
}

/**
 * Cut the mix into at most {@link MAX_COUNTRY_SLICES} slices plus a pooled tail.
 *
 * A country with rounds but no attributed device (a client too old to send one)
 * can't take a slice of a device pie, but its rounds are real — it pools into the
 * tail rather than vanishing, so the round counts still add up.
 */
function toSlices(entries: CountryUsage[]): Slice[] {
  const ranked = entries.filter((e) => e.players > 0);
  const head = ranked.slice(0, MAX_COUNTRY_SLICES);
  const tail = [...ranked.slice(MAX_COUNTRY_SLICES), ...entries.filter((e) => e.players === 0)];
  const slices: Slice[] = head.map((e, i) => ({
    key: e.code,
    label: countryName(e.code),
    players: e.players,
    rounds: e.rounds,
    places: 1,
    rank: i,
  }));
  if (tail.length > 0) {
    slices.push({
      key: "__rest",
      label: `Elsewhere (${tail.length} countr${tail.length === 1 ? "y" : "ies"})`,
      players: tail.reduce((n, e) => n + e.players, 0),
      rounds: tail.reduce((n, e) => n + e.rounds, 0),
      places: tail.length,
      rank: -1,
    });
  }
  return slices;
}

/**
 * The one sentence the pie is there to support: how concentrated the audience is.
 *
 * Deliberately about *shape*, not a ranking — "92% in one country" and "spread
 * across 14" are different situations, and the number that separates them is the
 * top slice's share, not its name.
 */
function countryNote(mix: CountryMix, slices: Slice[]): string {
  const top = slices[0];
  const share = pct(top.players, mix.players);
  const places = `${mix.entries.length} countr${mix.entries.length === 1 ? "y" : "ies"}`;
  if (mix.entries.length === 1) return `Every player so far is in ${top.label}.`;
  if (share >= 80) return `${share}% of players are in ${top.label}; the rest are scattered across ${places}.`;
  if (share >= 50) return `${top.label} is the home crowd at ${share}% of players, but ${places} are represented.`;
  return `No single home crowd — the biggest, ${top.label}, is only ${share}% of players across ${places}.`;
}

/**
 * The one wording for rounds that carry no country — the rows recorded before
 * country tracking shipped. Said out loud on the panel, because "not measured"
 * and "nobody was there" are different claims and the pie can only draw one of
 * them.
 */
function countryUntrackedNote(mix: CountryMix): string {
  if (mix.untracked === 0) return "No country recorded on any round yet.";
  const rounds = `${mix.untracked.toLocaleString()} round${mix.untracked === 1 ? "" : "s"}`;
  return mix.players === 0
    ? `Country tracking only starts with rounds recorded after this release — the ${rounds} so far predate it, so there's nothing to plot yet.`
    : `${rounds} predate country tracking and carry none; they're left out of the shares rather than counted as an unknown country.`;
}

/**
 * Where the audience is, all time (GitHub #92).
 *
 * **A pie, not bars**, which is the exception rather than the rule on this
 * dashboard: the question is what share of the audience sits where — a whole cut
 * into parts — and it's asked once, of one all-time total, with a handful of
 * slices. Bars would answer "how many played from each country", which is the
 * quantity the metric is least able to speak to (see below).
 *
 * Three things are load-bearing:
 *
 * 1. **Slices are devices, not rounds.** Rounds are the exact number, but one
 *    enthusiast abroad would then read as a foreign audience. Every device lands
 *    in exactly one country (worker/countries.ts), so the slices genuinely
 *    partition the whole — a pie whose parts don't add to the total is a lie the
 *    shape itself tells. Rounds are still printed beside each slice, because
 *    rounds-per-device is the tell that separates a real player from a bot.
 * 2. **A single-hue ramp, ordered by share — not a categorical palette.**
 *    mustard/teal/cherry already mean game *kind* dashboard-wide and the event
 *    palette means start/finish/share; a third categorical set on a fourth
 *    meaning is how a dashboard stops being readable. A pie can't be one hue the
 *    way the menu-mix bars are (there's no length to carry the value), so the
 *    ramp encodes rank — which the slices are already sorted by — and adds no new
 *    meaning. The pooled tail is grey, because "everyone else" isn't a rank.
 * 3. **Untracked rounds are stated, never drawn.** Rounds recorded before the
 *    country column carry no country; folding them in would invent a place, and
 *    dropping them silently would overstate every real slice.
 */
function CountryPie({ mix }: { mix: CountryMix }) {
  const slices = toSlices(mix.entries);
  const total = slices.reduce((n, s) => n + s.players, 0);
  const size = 180;
  const c = size / 2;
  const r = c - 2;

  let t = 0;
  const drawn = slices.map((s) => {
    const from = t;
    t += s.players / total;
    return { ...s, from, to: t };
  });

  return (
    <div className="cpie">
      <svg
        className="cpie__svg"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Players by country: ${drawn
          .map((s) => `${s.label} ${pct(s.players, total)}%`)
          .join(", ")}.`}
      >
        {drawn.length === 1 ? (
          // A lone slice is a full turn, which an arc path can't express (its
          // endpoints coincide and the wedge collapses to nothing).
          <circle className="cpie__slice cpie__slice--0" cx={c} cy={c} r={r}>
            <title>{`${drawn[0].label} — every player`}</title>
          </circle>
        ) : (
          drawn.map((s) => (
            <path
              key={s.key}
              className={`cpie__slice cpie__slice--${s.rank < 0 ? "rest" : s.rank}`}
              d={wedge(c, c, r, s.from, s.to)}
            >
              <title>{`${s.label} — ${s.players} player${s.players === 1 ? "" : "s"} (${pct(
                s.players,
                total,
              )}%), ${s.rounds} round${s.rounds === 1 ? "" : "s"}`}</title>
            </path>
          ))
        )}
      </svg>
      <ul className="cpie__legend">
        {drawn.map((s) => (
          <li className="cpie__row" key={s.key}>
            <span className={`cpie__dot cpie__dot--${s.rank < 0 ? "rest" : s.rank}`} />
            <span className="cpie__name">{s.label}</span>
            <span className="cpie__share">{pct(s.players, total)}%</span>
            <span className="cpie__detail">
              {s.players} player{s.players === 1 ? "" : "s"} · {s.rounds} round
              {s.rounds === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The two lines' colours for the new-vs-returning chart, matching admin.css. */
const PLAYER_SERIES: { key: "newPlayers" | "returningPlayers"; cls: string; label: string }[] = [
  { key: "newPlayers", cls: "new", label: "New players" },
  { key: "returningPlayers", cls: "returning", label: "Returning players" },
];

/**
 * Two-line SVG chart of new vs returning players per ET day.
 *
 * `player_id` shipped after launch (migrations/0008), so the earliest days here
 * recorded rounds but no players. Those days are **not** drawn as zeros — that
 * would assert "nobody new played" when the truth is "nobody was counting". They
 * get a hatched "not tracked" band instead, and the lines start at the boundary.
 *
 * The band rather than a shorter x-axis is deliberate: the Games-started spark
 * directly above spans the full range at the same width, so a series that quietly
 * began later would line up with it and read as the same days.
 */
function PlayerLineChart({ days, trackingStart }: { days: AnalyticsDay[]; trackingStart: string | null }) {
  const W = 660;
  const H = 190;
  const padL = 26;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const n = days.length;
  // Days carry null player counts until tracking started; everything from the
  // first non-null onward is measured (a measured day can legitimately be 0).
  const firstIdx = days.findIndex((d) => d.newPlayers !== null);
  const x = (i: number) =>
    n <= 1 ? padL + (W - padL - padR) / 2 : padL + (i / (n - 1)) * (W - padL - padR);

  if (firstIdx === -1) {
    return <p className="dash-note">{untrackedNote(trackingStart)}</p>;
  }

  const tracked = days.slice(firstIdx);
  const max = Math.max(1, ...tracked.map((d) => Math.max(d.newPlayers ?? 0, d.returningPlayers ?? 0)));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const path = (key: "newPlayers" | "returningPlayers") =>
    tracked
      .map((d, j) => `${j === 0 ? "M" : "L"}${x(j + firstIdx).toFixed(1)},${y(d[key] ?? 0).toFixed(1)}`)
      .join(" ");
  const xTickStep = Math.max(1, Math.ceil(n / 6));
  const yTicks = [...new Set([0, Math.round(max / 2), max])];
  // Where measurement begins. firstIdx 0 means the whole window is tracked.
  const boundaryX = x(firstIdx);
  const bandW = boundaryX - padL;
  const hasBand = firstIdx > 0 && bandW > 0;

  return (
    <div className="pchart">
      <div className="pchart__legend">
        {PLAYER_SERIES.map((s) => (
          <span className="pchart__legend-item" key={s.key}>
            <span className={`pchart__swatch pchart__swatch--${s.cls}`} />
            {s.label}
          </span>
        ))}
        {hasBand && (
          <span className="pchart__legend-item">
            <span className="pchart__swatch pchart__swatch--untracked" />
            Not tracked
          </span>
        )}
      </div>
      <svg
        className="pchart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          hasBand
            ? `New vs returning players per day. Not tracked before ${days[firstIdx].date}.`
            : "New vs returning players per day"
        }
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="pchart-hatch" width="6" height="6" patternUnits="userSpaceOnUse">
            <path className="pchart__hatch" d="M0,6 l6,-6" />
          </pattern>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="pchart__grid" x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} />
            <text className="pchart__axis" x={padL - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {v}
            </text>
          </g>
        ))}
        {hasBand && (
          <>
            {/* No line is drawn over this span — the metric didn't exist yet. */}
            <rect
              className="pchart__untracked"
              x={padL}
              y={padT}
              width={bandW}
              height={H - padT - padB}
              fill="url(#pchart-hatch)"
            >
              <title>{untrackedNote(trackingStart)}</title>
            </rect>
            <line className="pchart__boundary" x1={boundaryX} y1={padT} x2={boundaryX} y2={H - padB} />
            {bandW >= 70 && (
              <text className="pchart__untracked-label" x={padL + bandW / 2} y={padT + 14} textAnchor="middle">
                not tracked
              </text>
            )}
          </>
        )}
        {PLAYER_SERIES.map((s) => (
          <path key={s.key} className={`pchart__line pchart__line--${s.cls}`} d={path(s.key)} fill="none" />
        ))}
        {n <= 45 &&
          PLAYER_SERIES.map((s) =>
            tracked.map((d, j) => (
              <circle
                key={`${s.key}-${d.date}`}
                className={`pchart__dot pchart__dot--${s.cls}`}
                cx={x(j + firstIdx)}
                cy={y(d[s.key] ?? 0)}
                r={2.6}
              >
                <title>{`${d.date} · ${d[s.key]} ${s.label.toLowerCase()}`}</title>
              </circle>
            )),
          )}
        {days.map((d, i) =>
          i % xTickStep === 0 || i === n - 1 ? (
            <text key={d.date} className="pchart__axis" x={x(i)} y={H - 6} textAnchor="middle">
              {shortDate(d.date)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/**
 * Everything that moves over time: games started per day (stacked by kind), new
 * vs returning players, the hour-of-day profile, and the day-by-day table the
 * charts summarise. Single-service detail lives in the Players tab.
 */
export default function TrendsPanel({
  data,
  error,
  surface,
}: {
  data: AnalyticsSummary | null;
  error: string | null;
  surface: SurfaceFilter;
}) {
  if (error) {
    return (
      <section className="panel">
        <h2>Trends</h2>
        <p className="dash-note">Couldn't load analytics: {error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="panel">
        <h2>Trends</h2>
        <p className="dash-note">Counting the receipts…</p>
      </section>
    );
  }

  const { totals, players, daily, growth, hourly, playerTrackingStart, retention, countries } = data;
  if (totals.started === 0) {
    return (
      <section className="panel">
        <h2>Trends</h2>
        <p className="dash-note">{noRoundsNote(surface)}</p>
      </section>
    );
  }

  const dayMax = Math.max(1, ...daily.map((d) => d.started));
  // Label roughly 6 dates along the spark so they don't overlap; always tag the last day.
  const dayTickStep = Math.max(1, Math.ceil(daily.length / 6));
  const hourMax = Math.max(1, ...hourly);
  const peakHour = hourly.indexOf(Math.max(...hourly));
  // Most recent days first for the breakdown table.
  const recentDays = [...daily].reverse();
  const span = `last ${daily.length} day${daily.length === 1 ? "" : "s"}`;
  const headline = retention && retentionNote(retention.steps, retention.windowDays);
  const countrySlices = toSlices(countries.entries);

  return (
    <>
      {/* First, because it's the widest question on the tab: everything below it
          asks what happened lately, this asks whether the game is gaining. */}
      <section className="panel">
        <h2>Total games played · all time</h2>
        {growth.days.length === 0 ? (
          <p className="dash-note">No dated activity yet.</p>
        ) : (
          <>
            <p className="gchart__headline">
              <strong className="gchart__total">{growth.days.at(-1)!.cumulative.toLocaleString()}</strong> games
              played since {shortDate(growth.days[0].date)}.
              {growth.trend && ` ${growthNote(growth.trend, growth.days[0].date)}`}
            </p>
            <GrowthChart growth={growth} />
            <p className="dash-note">
              A running total of every game started, all three kinds together, by the ET day it was started
              on — so it can only go up, and the reading is the <em>shape</em>: steepening means the game is
              gaining, flattening means it's stalling.{" "}
              {growth.trend
                ? "The dashed line is the same run at one constant pace (a least-squares fit through the curve), there to make that bend visible. It's a reference, not a forecast."
                : `The steady-pace line needs a longer run than ${growth.days.length} day${
                    growth.days.length === 1 ? "" : "s"
                  } — it'll appear once there's enough history to mean something.`}
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Games started · {span}</h2>
        {daily.length === 0 ? (
          <p className="dash-note">No dated activity yet.</p>
        ) : (
          <>
            <KindLegend />
            <div className="spark">
              {daily.map((d, i) => {
                // Tag every Nth day plus the final one so the newest date is always labeled.
                const showTick = i % dayTickStep === 0 || i === daily.length - 1;
                const tip = KIND_META.map((k) => `${k.label}: ${d.startedByKind[k.key]}`).join(", ");
                return (
                  <div className="spark__col" key={d.date} title={`${d.date} · ${d.started} started (${tip})`}>
                    <span className="spark__num">{d.started}</span>
                    {/* Stacked: each column's total height is the day's games
                        started; the three segments split it by kind. */}
                    <span className="spark__bar" style={{ height: `${6 + (d.started / dayMax) * 94}%` }}>
                      {KIND_META.map((k) => {
                        const n = d.startedByKind[k.key];
                        if (n === 0) return null;
                        return (
                          <span
                            key={k.key}
                            className={`spark__seg spark__seg--${k.cls}`}
                            style={{ height: `${(n / d.started) * 100}%` }}
                          />
                        );
                      })}
                    </span>
                    {showTick && <span className="spark__tick">{shortDate(d.date)}</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>New vs returning players · {span}</h2>
        {daily.length === 0 ? (
          <p className="dash-note">No dated activity yet.</p>
        ) : (
          <>
            <PlayerLineChart days={daily} trackingStart={playerTrackingStart} />
            <p className="dash-note" style={{ marginTop: 8 }}>
              {players === null ? (
                untrackedNote(playerTrackingStart)
              ) : (
                <>
                  {players.new} player{players.new === 1 ? "" : "s"} all time · {players.returning} ha
                  {players.returning === 1 ? "s" : "ve"} come back on a later day. A “player” is an anonymous
                  device (localStorage), counted once regardless of game kind.
                </>
              )}
            </p>
            {/* The instrument switched on mid-life, so the first tracked days are
                biased as well as the untracked ones are missing: anyone who had
                already played reappears as "new". Say so rather than let the
                boundary spike read as a launch. */}
            {playerTrackingStart && daily.length > 0 && daily[0].newPlayers === null && (
              <p className="dash-note">
                Player tracking started {playerTrackingStart}; the shaded span ran before it and wasn't
                measured. Devices that had already played count as “new” on their first tracked day, so
                “new” is overstated and “returning” understated around {playerTrackingStart}.
              </p>
            )}
          </>
        )}
      </section>

      {/* Sits under new-vs-returning because it's the same question asked
          deeper: that chart counts how many came back, this one asks how likely
          it was — and unlike the chart, it's all-time, not the last 30 days. */}
      <section className="panel">
        <h2>Repeat visits</h2>
        {retention === null || retention.steps.length === 0 ? (
          <p className="dash-note">{untrackedNote(playerTrackingStart)}</p>
        ) : (
          <>
            {headline && <p className="retention__headline">{headline}</p>}
            <RetentionCurve retention={retention} />
          </>
        )}
      </section>

      {/* "Where" sits between "who comes back" and "when they play" — the three
          all-time cuts of the same audience. */}
      <section className="panel">
        <h2>Where players are · all time</h2>
        {countries.players === 0 ? (
          <p className="dash-note">{countryUntrackedNote(countries)}</p>
        ) : (
          <>
            <p className="cpie__headline">{countryNote(countries, countrySlices)}</p>
            <CountryPie mix={countries} />
            <p className="dash-note">
              The country comes from Cloudflare's edge when a game <em>starts</em> — so this counts people
              who actually loaded and played, not requests. A country that's busy in Cloudflare's own
              analytics but missing here never ran the game: that's scrapers and bots, and the gap between
              the two is the read. Slices are anonymous devices (each counted in the one country it plays
              from most); rounds are exact, and a country with far more rounds than players is one device
              replaying, not a crowd.
              {countries.untracked > 0 && ` ${countryUntrackedNote(countries)}`}
            </p>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Games started by hour · ET{totals.started > 0 && ` · peak ${String(peakHour).padStart(2, "0")}:00`}</h2>
        <div className="hourly">
          {hourly.map((n, h) => (
            <div className="hourly__col" key={h} title={`${String(h).padStart(2, "0")}:00 ET — ${n} started`}>
              {n > 0 && <span className="hourly__num">{n}</span>}
              <span className="hourly__bar" style={{ height: `${n === 0 ? 0 : 6 + (n / hourMax) * 94}%` }} />
              {h % 6 === 0 && <span className="hourly__tick">{String(h).padStart(2, "0")}</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Daily breakdown · {span}</h2>
        {recentDays.length === 0 ? (
          <p className="dash-note">No dated activity yet.</p>
        ) : (
          <div className="day-table-wrap">
            <table className="day-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Started</th>
                  <th title="Today's Special">Special</th>
                  <th>Leftovers</th>
                  <th title="Chef's Choice">Chef's</th>
                  <th title="Players first seen this day">New</th>
                  <th title="Players who first played earlier">Ret.</th>
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
                    <td>{d.startedByKind.daily}</td>
                    <td>{d.startedByKind.leftover}</td>
                    <td>{d.startedByKind.random}</td>
                    {/* "—" = before tracking shipped. Not a zero. */}
                    <td title={d.newPlayers === null ? untrackedNote(playerTrackingStart) : undefined}>
                      {d.newPlayers ?? "—"}
                    </td>
                    <td title={d.returningPlayers === null ? untrackedNote(playerTrackingStart) : undefined}>
                      {d.returningPlayers ?? "—"}
                    </td>
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
      </section>
    </>
  );
}
