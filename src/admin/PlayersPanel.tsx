import { Fragment, useState } from "react";
import type {
  AnalyticsSummary,
  AudienceReport,
  CountryMix,
  CountryUsage,
  FunnelCounts,
  FunnelEnding,
  PlayerFunnel,
  PlayerRetention,
  RetentionStep,
  SourceMix,
} from "../../shared/types";
import { DNF_GRACE_MINUTES } from "../../shared/types";
import { SOURCE_DIRECT } from "../../shared/attribution";
import { rate, separated } from "../../shared/sample";
import { ArrivalSplit, CohortGrid } from "./AudiencePanels";
import {
  PlayersRow,
  RangeHint,
  RatesRow,
  StartedByKindRow,
  countryName,
  noRoundsNote,
  pct,
  shortDate,
  untrackedNote,
  type SurfaceFilter,
} from "./analyticsUi";

/**
 * The "who is playing" tab, and nothing else: totals, where arrivals drop out,
 * first visits against regulars, whether new players stick, how they arrived
 * and where they are.
 *
 * How the puzzle played (the day slice, guess distribution, time to solve)
 * moved to Menu beside the dish report, which asks the same question one dish
 * at a time. The daily new-vs-returning lines were replaced by the weekly chart
 * on Trends: at this game's volume a day's split is a handful of people, and
 * the daily breakdown table there still carries it per day.
 */

/**
 * Below this many players a rung's percentage is one person's mood, so it's
 * flagged rather than quoted flat. Not hidden: "how many of my three-timers came
 * back" is the whole question, and a blank row answers it worse than a caveat.
 */
const RETENTION_MIN_COHORT = 10;

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
 * The two things the funnel's last stage can measure, and how each drop-off
 * reads. Sharing is the loop pointing outward — the game reaching somebody who
 * isn't playing it; playing again is the loop pointing inward — the game holding
 * the person it already has. Both are "what happened after game over", they
 * answer different questions, and the panel switches rather than choosing.
 */
const ENDINGS: { key: FunnelEnding; toggle: string; label: string; lost: string; help: string }[] = [
  {
    key: "shared",
    toggle: "Shared",
    label: "Shared a result",
    lost: "kept it to themselves",
    help: "Devices that sent their result card. Sharing is only reachable after game over, so this is a slice of the finishers above.",
  },
  {
    key: "playedAgain",
    toggle: "Played again",
    label: "Played another round",
    lost: "stopped after one",
    help:
      "Devices that started another game after finishing one, the same ET day — a Leftover or a Chef's Choice. " +
      "Ordered against the earlier finish, so two boards opened in two tabs before either was played don't count as coming back for seconds.",
  },
];

/** One rung of the drawn funnel. */
interface FunnelStage {
  key: string;
  label: string;
  n: number;
  /** What the people who didn't reach the *next* stage did instead. */
  lost: string;
  help: string;
}

/**
 * The stages, top to bottom, for one set of counts.
 *
 * The arrivals row is dropped entirely — not drawn as an empty or zero row — on
 * any day before the visit beacon shipped. "Not measured" is not a bounce, and a
 * funnel whose top rung is a guess is worse than one that starts a step lower.
 */
function stagesOf(counts: FunnelCounts, ending: FunnelEnding): FunnelStage[] {
  const last = ENDINGS.find((e) => e.key === ending)!;
  const walkedOut = counts.open.abandoned;
  const stillPlaying = counts.open.inProgress;
  return [
    ...(counts.visited === null
      ? []
      : [
          {
            key: "visited",
            label: "Opened the game",
            n: counts.visited,
            lost: "looked and left without a guess",
            help: "Devices that loaded a playable board. One per device per day, however many times they came back to the tab.",
          },
        ]),
    {
      key: "played",
      label: "Made a guess",
      n: counts.played,
      // The unfinished are split the way the day's rounds are: a game begun ten
      // minutes ago isn't a walkout. Both halves are named or neither is.
      lost:
        stillPlaying > 0 && walkedOut > 0
          ? `left mid-game (${stillPlaying} still playing, ${walkedOut} gone)`
          : stillPlaying > 0
            ? "are still playing"
            : "left mid-game",
      help: "Devices that submitted at least one guess — the point a round counts as started.",
    },
    {
      key: "finished",
      label: "Reached game over",
      n: counts.finished,
      lost: last.lost,
      help: `Devices that finished at least one game, win or lose. A game begun in the last ${
        DNF_GRACE_MINUTES / 60
      } hours still counts as in play rather than as a walkout.`,
    },
    { key: ending, label: last.label, n: counts[ending], lost: "", help: last.help },
  ];
}

/**
 * The single sentence worth reading first: which step loses the most people.
 *
 * Losses are compared as **counts, not rates**, because the point is where the
 * players went. A 60% fall-off at the bottom of a funnel is four people; a 25%
 * one at the top is thirty, and it's the thirty that are worth a morning's work.
 * Null when nothing falls out anywhere, which is worth saying differently.
 */
function biggestDropNote(stages: FunnelStage[]): string | null {
  let worst: { from: FunnelStage; to: FunnelStage; lost: number } | null = null;
  for (let i = 0; i < stages.length - 1; i++) {
    const lost = stages[i].n - stages[i + 1].n;
    if (lost > 0 && (worst === null || lost > worst.lost)) {
      worst = { from: stages[i], to: stages[i + 1], lost };
    }
  }
  if (worst === null) return null;
  return `Biggest fall-off: ${worst.lost} of the ${worst.from.n} who ${worst.from.label.toLowerCase()} ${
    worst.from.lost
  } — ${pct(worst.lost, worst.from.n)}% of that step.`;
}

/**
 * The player funnel: how many devices got from opening the game to coming back
 * for seconds.
 *
 * **Every stage counts devices**, which is the only reason this can be a funnel
 * at all. The dashboard's other read of the same journey (`FinishRate`, on the
 * Today tab) is drawn as separate tracks precisely because its rows don't share
 * a unit — a visit is one device per ET day while a "start" is a round, so a
 * player doing the Special plus three Leftovers is one arrival and four starts,
 * and stacking those gives a funnel that gets *wider* as it descends. In devices
 * each rung is a genuine subset of the one above, so a bar's width means what a
 * funnel's width is supposed to mean. The two live on different tabs on purpose:
 * Today counts games, because that's the service; Players counts people.
 *
 * Each rung carries two numbers rather than one, which is what stops the
 * always-full top bar from being a wasted row: the **bar** is share of arrivals
 * (how much of the original audience is left), and the **legend** is share of the
 * step above (how well that one hand-off worked). A funnel drawn with only the
 * first can't tell a bad step from one that inherited a small crowd.
 *
 * Fills are the Activity feed's event palette — start = teal, complete = cherry,
 * share = mustard — so an event means one colour dashboard-wide. Arrivals take a
 * muted ink, being the one rung that isn't an event; "played again" takes teal
 * because it *is* another start.
 */
function FunnelChart({ counts, ending }: { counts: FunnelCounts; ending: FunnelEnding }) {
  const stages = stagesOf(counts, ending);
  const top = Math.max(1, stages[0].n);
  return (
    <div className="funnel">
      {stages.map((s, i) => {
        const prev = i === 0 ? null : stages[i - 1];
        const lost = prev === null ? 0 : prev.n - s.n;
        // The *bar* is clamped, the percentage beside it is not. A rung can
        // legitimately outrun the one above: start, complete and share are
        // independent beacons, so a share whose completion beacon never landed
        // is a real player the row above can't see. Clamping the number would
        // hide that; clamping only the fill keeps the shape readable.
        const width = Math.min(100, Math.max(0, (s.n / top) * 100));
        return (
          <Fragment key={s.key}>
            {prev !== null && (
              <p className="funnel__drop">
                {lost > 0 ? (
                  <>
                    ↓ {lost} {prev.lost} <span className="funnel__drop-pct">({pct(lost, prev.n)}%)</span>
                  </>
                ) : (
                  <>↓ everyone carried on</>
                )}
              </p>
            )}
            <div className="funnel__step">
              <p className="funnel__head">
                <span className="funnel__label" title={s.help}>
                  {s.label}
                </span>
                <strong className="funnel__num">{s.n}</strong>
              </p>
              <div className="funnel__track">
                <span className={`funnel__fill funnel__fill--${s.key}`} style={{ width: `${width}%` }} />
              </div>
              <p className="funnel__legend">
                {prev === null ? (
                  <span className="funnel__of">everyone who showed up</span>
                ) : (
                  <>
                    <span className="funnel__step-pct">{pct(s.n, prev.n)}%</span>
                    <span className="funnel__of">
                      of the {prev.n} who {prev.label.toLowerCase()}
                      <RangeHint n={s.n} of={prev.n} />
                    </span>
                    {i > 1 && (
                      <span className="funnel__of funnel__of--top">{pct(s.n, stages[0].n)}% of arrivals</span>
                    )}
                  </>
                )}
              </p>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Which slice of time the funnel is drawn over. */
type FunnelScope = "day" | "allTime";

/**
 * The funnel panel: the two toggles, the headline, the chart, and the caveats.
 *
 * The scope toggle exists because one day at this game's volume is tens of
 * people — enough to catch a catastrophe, not enough to tune anything. The
 * pooled window is **device-days**: one device that played on three days counts
 * three times, because the question "of the people who showed up, how many
 * played" is asked afresh every day. It's clipped to days arrivals were actually
 * counted on, so the top of the funnel can't be measured over a shorter span
 * than the rows beneath it.
 */
function FunnelSection({
  funnel,
  isToday,
  dayDate,
  visitsSince,
}: {
  funnel: PlayerFunnel;
  isToday: boolean;
  dayDate: string;
  visitsSince: string | null;
}) {
  const [scope, setScope] = useState<FunnelScope>("allTime");
  const [ending, setEnding] = useState<FunnelEnding>("shared");

  const counts = scope === "day" ? funnel.day : funnel.allTime;
  const dayLabel = isToday ? "Today" : shortDate(dayDate);
  const headline = biggestDropNote(stagesOf(counts, ending));
  const nothing = counts.played === 0 && (counts.visited ?? 0) === 0;

  return (
    <section className="panel">
      <div className="analytics-head">
        <h2>Where players drop off</h2>
        <div className="analytics-head__tools">
          <div className="surface-toggle" role="tablist" aria-label="Which slice of time to fold the funnel over">
            {(
              [
                { key: "day" as const, label: dayLabel },
                { key: "allTime" as const, label: "All time" },
              ]
            ).map((s) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={scope === s.key}
                className={`surface-toggle__btn${scope === s.key ? " surface-toggle__btn--active" : ""}`}
                onClick={() => setScope(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="surface-toggle" role="tablist" aria-label="What the last stage measures">
            {ENDINGS.map((e) => (
              <button
                key={e.key}
                role="tab"
                aria-selected={ending === e.key}
                className={`surface-toggle__btn${ending === e.key ? " surface-toggle__btn--active" : ""}`}
                onClick={() => setEnding(e.key)}
                title={e.help}
              >
                {e.toggle}
              </button>
            ))}
          </div>
        </div>
      </div>

      {nothing ? (
        <p className="dash-note">
          {scope === "day"
            ? isToday
              ? "Nobody has opened the game today yet."
              : `Nobody opened the game on ${dayDate}.`
            : "No arrivals recorded yet."}
        </p>
      ) : (
        <>
          {headline && <p className="funnel__headline">{headline}</p>}
          <FunnelChart counts={counts} ending={ending} />
          <p className="dash-note" style={{ marginTop: 12 }}>
            {scope === "allTime" ? (
              <>
                Pooled over {funnel.allTime.days} day{funnel.allTime.days === 1 ? "" : "s"}
                {funnel.allTime.since && ` since ${shortDate(funnel.allTime.since)}`} — counted per device per
                day, so somebody who played on three of them is three arrivals.
              </>
            ) : (
              <>
                {isToday ? "Today" : dayDate} only. One day is tens of people at this volume; “All time” pools
                every measured day for a steadier read.
              </>
            )}
          </p>
          {counts.visited === null && (
            <p className="dash-note">
              Arrivals weren't counted{visitsSince ? ` before ${shortDate(visitsSince)}` : " yet"}, so this
              funnel starts at the first guess — a top rung of 0 would claim a 100% bounce rate rather than
              admit the instrument was off.
            </p>
          )}
          <details className="dash-details">
            <summary>What this counts</summary>
            <p className="dash-note">
              Every stage counts <strong>devices, not games</strong>. A visit is one device per ET day while a
              “start” is a round, so a player who does the Special and three Leftovers is one arrival and four
              starts — stacked as a funnel those would grow as they descend and report a 400% play rate.
              Counted in devices each stage is a real subset of the one above it. The Today tab's finishing
              bars count games instead, which is the right unit for a service and the wrong one for a funnel.
              The bar is share of arrivals; the percentage beside it is share of the step above, and it's the
              second one that says whether a step is working.
            </p>
          </details>
        </>
      )}
    </section>
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
 * The entries pooled into the "Elsewhere" slice — everything past the head plus
 * every country with rounds but no attributed device. Split out from
 * {@link toSlices} so the legend can list them individually on request without
 * re-deriving the same cut.
 */
function tailEntries(entries: CountryUsage[]): CountryUsage[] {
  const ranked = entries.filter((e) => e.players > 0);
  return [...ranked.slice(MAX_COUNTRY_SLICES), ...entries.filter((e) => e.players === 0)];
}

/**
 * Why a country with rounds shows 0 players (#211), or null if it has some. Two
 * causes, and the fold counts both: the device is counted in the country it
 * played more from, or the round never got a device because its start beacon
 * was lost. Without this the row reads as an error.
 */
function zeroPlayerReason(e: CountryUsage): string | null {
  if (e.players > 0) return null;
  const parts: string[] = [];
  if (e.homedElsewhere > 0) parts.push(`${e.homedElsewhere} counted in another country`);
  if (e.unattributed > 0) parts.push(`${e.unattributed} with no device recorded`);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Cut the mix into at most {@link MAX_COUNTRY_SLICES} slices plus a pooled tail.
 *
 * A country with rounds but no attributed device can't take a slice of a device
 * pie, but its rounds are real — it pools into the tail rather than vanishing, so
 * the round counts still add up. {@link zeroPlayerReason} says why it has none.
 */
function toSlices(entries: CountryUsage[]): Slice[] {
  const ranked = entries.filter((e) => e.players > 0);
  const head = ranked.slice(0, MAX_COUNTRY_SLICES);
  const tail = tailEntries(entries);
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

/** `direct` reads as jargon in a column of ad networks; say what it means. */
const sourceLabel = (source: string) => (source === SOURCE_DIRECT ? "Direct / untagged" : source);

/**
 * The one wording for devices whose first visit predates source tracking. Said
 * out loud for the same reason the country note is: "we weren't measuring" and
 * "they arrived on their own" are different facts, and a table that quietly
 * merged them would report the game's entire history as organic traffic.
 */
function sourceUntrackedNote(mix: SourceMix): string {
  if (mix.untracked === 0) return "No arrivals recorded yet.";
  const devices = `${mix.untracked.toLocaleString()} device${mix.untracked === 1 ? "" : "s"}`;
  return mix.entries.length === 0
    ? `Arrival sources start with visits recorded after this release — the ${devices} so far predate it, so there's nothing to attribute yet.`
    : `${devices} first visited before arrival tracking and carry no source; they're left out rather than counted as direct.`;
}

/**
 * The headline. It answers the only question worth buying traffic to ask —
 * whether the people a source sent behaved differently from the people who
 * turned up on their own — and refuses to answer it when the numbers can't.
 *
 * `separated()` is the gate, exactly as in the dish report: at a few dozen
 * arrivals a campaign and the baseline are usually the same rate wearing
 * different luck, and saying so is more useful than a number that will reverse
 * itself next week.
 */
function sourceNote(mix: SourceMix): string | null {
  const tagged = mix.entries.filter((e) => e.source !== SOURCE_DIRECT);
  if (tagged.length === 0) return null;
  const top = tagged[0];
  const arrivals = `${top.arrivals} device${top.arrivals === 1 ? "" : "s"}`;
  if (top.atRisk === 0) {
    return `${sourceLabel(top.source)} has brought ${arrivals}, all too recently to say whether they came back — give it ${mix.windowDays} days from each arrival.`;
  }
  const theirs = rate(top.returned, top.atRisk);
  const base = mix.entries.find((e) => e.source === SOURCE_DIRECT);
  const baseline = base ? rate(base.returned, base.atRisk) : null;
  const came = `${top.returned} of ${top.atRisk} came back within ${mix.windowDays} days`;
  if (!separated(theirs, baseline)) {
    return baseline === null
      ? `${sourceLabel(top.source)} brought ${arrivals}; ${came}. Nothing to compare it against yet.`
      : `${sourceLabel(top.source)} brought ${arrivals}, and ${came} — not tellably different from the people who arrived on their own.`;
  }
  const better = (theirs?.pct ?? 0) > (baseline?.pct ?? 0);
  return `${sourceLabel(top.source)} brought ${arrivals}, and ${came} — ${better ? "better" : "worse"} than the people who arrived on their own.`;
}

/**
 * How the audience arrived, and whether it stuck (migrations/0024).
 *
 * **A table, not a chart**, and deliberately the plainest thing on this tab. The
 * useful comparison here is one rate against one other rate, both with wide
 * intervals; a bar chart would give that comparison a precision the numbers
 * don't have, and there will only ever be a handful of rows.
 *
 * Three things are load-bearing:
 *
 * 1. **Every count is devices.** A source brought people, once each — the same
 *    unit as the funnel and for the same reason. Counting visits would credit a
 *    campaign again every time somebody it acquired came back, which is exactly
 *    the quantity the next column is trying to measure.
 * 2. **The return rate's denominator is `atRisk`, not `arrivals`.** Anyone who
 *    arrived inside the last {@link SourceMix.windowDays} days hasn't had time to
 *    come back, so they're shown as pending beside the rate rather than counted
 *    as gone. Without this, a campaign running right now drags its own number
 *    down with every click it buys.
 * 3. **`direct` is a row, not a footnote.** It's the baseline every campaign is
 *    read against, and burying it would leave the ad's return rate looking like
 *    an absolute score instead of a comparison.
 */
function SourceTable({ mix }: { mix: SourceMix }) {
  return (
    <div className="day-table-wrap">
      <table className="day-table dish-table">
        <thead>
          <tr>
            <th>Came from</th>
            <th title="Anonymous devices whose first recorded visit carried this source">Arrivals</th>
            <th title={`Devices that visited again within ${mix.windowDays} days of arriving`}>Came back</th>
            <th title="Arrived too recently to have had a full return window">Still early</th>
            <th title="First and most recent day this source brought someone">Active</th>
          </tr>
        </thead>
        <tbody>
          {mix.entries.map((e) => (
            <tr key={e.source} className={e.source === SOURCE_DIRECT ? "src-table__row--base" : undefined}>
              <td>
                <span className="ev-when">{sourceLabel(e.source)}</span>
                {e.lateReturned > 0 && <span className="ev-sub">+{e.lateReturned} came back later</span>}
              </td>
              <td>{e.arrivals}</td>
              <td>
                {e.atRisk === 0 ? (
                  "—"
                ) : (
                  <>
                    {pct(e.returned, e.atRisk)}%
                    <RangeHint n={e.returned} of={e.atRisk} />
                    <span className="ev-sub">
                      {e.returned} of {e.atRisk}
                    </span>
                  </>
                )}
              </td>
              <td>{e.pending > 0 ? e.pending : "—"}</td>
              <td>
                <span className="ev-sub">
                  {shortDate(e.firstDay)}
                  {e.lastDay !== e.firstDay && ` – ${shortDate(e.lastDay)}`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
 *
 * The pooled tail stays a single wedge — a slice thinner than its own border
 * buys nothing — but the *legend* row for it expands in place to the full list
 * of countries it's standing in for, each with the same player/round counts the
 * head rows show. `mix.entries` already carries every country the fold saw
 * (worker/countries.ts sorts the whole thing, not just the head), so this is a
 * display-only reveal — no extra fetch, and the total the pie draws never moves.
 */
function CountryPie({ mix }: { mix: CountryMix }) {
  const slices = toSlices(mix.entries);
  const tail = tailEntries(mix.entries);
  const total = slices.reduce((n, s) => n + s.players, 0);
  const [expanded, setExpanded] = useState(false);
  const size = 180;
  const c = size / 2;
  const r = c - 2;

  // Each slice starts where the last one ended: a running fraction of the
  // circle, folded rather than accumulated in a reassigned local.
  const drawn = slices.reduce<Array<(typeof slices)[number] & { from: number; to: number }>>((acc, s) => {
    const from = acc.length ? acc[acc.length - 1].to : 0;
    return [...acc, { ...s, from, to: from + s.players / total }];
  }, []);

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
        {drawn.map((s) => {
          const isRest = s.key === "__rest";
          return (
            <li className={`cpie__row${isRest ? " cpie__row--rest" : ""}`} key={s.key}>
              <span className={`cpie__dot cpie__dot--${s.rank < 0 ? "rest" : s.rank}`} />
              {isRest ? (
                <button
                  type="button"
                  className="cpie__name cpie__expand-btn"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                >
                  {s.label}
                  <span className="cpie__caret" aria-hidden="true">
                    {expanded ? "▾" : "▸"}
                  </span>
                </button>
              ) : (
                <span className="cpie__name">{s.label}</span>
              )}
              <span className="cpie__share">{pct(s.players, total)}%</span>
              <span className="cpie__detail">
                {s.players} player{s.players === 1 ? "" : "s"} · {s.rounds} round
                {s.rounds === 1 ? "" : "s"}
              </span>
              {isRest && expanded && (
                <ul className="cpie__sublist">
                  {tail.map((e) => (
                    <li className="cpie__subrow" key={e.code}>
                      <span className="cpie__name">{countryName(e.code)}</span>
                      <span className="cpie__detail">
                        {e.players} player{e.players === 1 ? "" : "s"} · {e.rounds} round
                        {e.rounds === 1 ? "" : "s"}
                        {zeroPlayerReason(e) && ` (${zeroPlayerReason(e)})`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function PlayersPanel({
  data,
  error,
  surface,
  audience,
  audienceError,
}: {
  data: AnalyticsSummary | null;
  error: string | null;
  surface: SurfaceFilter;
  /** Weekly cohorts and the first-visit funnel. See AudiencePanels.tsx. */
  audience: AudienceReport | null;
  audienceError: string | null;
}) {
  if (error) {
    return (
      <section className="panel">
        <h2>Players</h2>
        <p className="dash-note">Couldn't load analytics: {error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="panel">
        <h2>Players</h2>
        <p className="dash-note">Counting the receipts…</p>
      </section>
    );
  }

  const {
    totals,
    startedByKind,
    day,
    today,
    playerTrackingStart,
    players,
    retention,
    countries,
    sources,
    funnel,
    visits,
  } = data;

  if (totals.started === 0) {
    return (
      <section className="panel">
        <h2>Players</h2>
        <p className="dash-note">{noRoundsNote(surface)}</p>
      </section>
    );
  }

  const headline = retention && retentionNote(retention.steps, retention.windowDays);
  const sourceHeadline = sourceNote(sources);
  const countrySlices = toSlices(countries.entries);

  return (
    <>
      {/* Audience only. The Special's day slice and the difficulty reads live
          on Menu now, beside the dish report: how a puzzle played is a question
          about the puzzle, and this tab is about the people. */}
      <section className="panel">
        <h2>All time</h2>
        {/* Games started across the game's life, Today's Special first. */}
        <StartedByKindRow startedByKind={startedByKind} />
        <RatesRow totals={totals} />
        <PlayersRow players={players} trackingStart={playerTrackingStart} />
        <p className="dash-note" style={{ marginTop: 10 }}>
          Anonymous counts only. A “player” is an anonymous device (localStorage), counted once regardless of
          game kind.
          {playerTrackingStart && (
            <>
              {" "}
              Player counts start {playerTrackingStart}, when tracking shipped — earlier games are in the
              totals above but their devices aren't, so “new” is really “first seen since {playerTrackingStart}
              ”.
            </>
          )}
        </p>
      </section>

      {/* Between the totals and the coming-back charts, because that's the order
          the questions come in: how many, then where they fell out, then whether
          the ones who stayed came back another day. */}
      <FunnelSection
        funnel={funnel}
        isToday={day.date === today}
        dayDate={day.date}
        visitsSince={visits.since}
      />

      {/* The same funnel with first visits pulled apart from regulars, per
          surface. Pooled, the regulars' near-certain guess hides how many
          first-timers leave without one. Not toggle-filtered: the two surfaces
          side by side is the point. */}
      <ArrivalSplit data={audience} error={audienceError} />

      {/* Cohorts ask "do they come back" by when they arrived; the repeat-visit
          ladder under it asks it by how many times they already have. */}
      <CohortGrid data={audience} error={audienceError} surface={surface} />

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

      <section className="panel">
        <h2>How they got here · all time</h2>
        {sources.entries.length === 0 ? (
          <p className="dash-note">{sourceUntrackedNote(sources)}</p>
        ) : (
          <>
            {sourceHeadline && <p className="retention__headline">{sourceHeadline}</p>}
            <SourceTable mix={sources} />
            <details className="dash-details">
              <summary>What this counts</summary>
              <p className="dash-note">
                The source is the <code>utm_source</code> on the URL a device first arrived at — so tag your
                links (<code>?utm_source=reddit</code>) and anything untagged lands in Direct. Counts are
                anonymous devices, attributed once, on the day they first showed up: a device that arrives
                from an ad and comes back for a fortnight is one arrival and a return, never fourteen.
                "Came back" only counts devices that have had a full {sources.windowDays} days to do it —
                everyone newer sits in Still early, because a campaign running right now would otherwise
                lower its own score with every visitor it brings.
                {sources.untracked > 0 && ` ${sourceUntrackedNote(sources)}`}
              </p>
            </details>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Where players are · all time</h2>
        {countries.players === 0 ? (
          <p className="dash-note">{countryUntrackedNote(countries)}</p>
        ) : (
          <>
            <p className="cpie__headline">{countryNote(countries, countrySlices)}</p>
            <CountryPie mix={countries} />
            <details className="dash-details">
              <summary>What this counts</summary>
              <p className="dash-note">
                The country comes from Cloudflare's edge when a game <em>starts</em> — so this counts people
                who actually loaded and played, not requests. A country that's busy in Cloudflare's own
                analytics but missing here never ran the game: that's scrapers and bots, and the gap between
                the two is the read. Slices are anonymous devices (each counted in the one country it plays
                from most); rounds are exact, and a country with far more rounds than players is one device
                replaying, not a crowd.
                {countries.untracked > 0 && ` ${countryUntrackedNote(countries)}`}
              </p>
            </details>
          </>
        )}
      </section>
    </>
  );
}
