import { useEffect, useState, type ReactNode } from "react";
import type { RegularsGroup, RegularsReport, Tally } from "../../shared/types";
import { LAPSED_DAYS, REGULARS_MIN_GROUP, ROUND_KINDS } from "../../shared/types";
import { SOURCE_DIRECT } from "../../shared/attribution";
import { SMALL_SAMPLE_MIN, medianOf, rate, separated } from "../../shared/sample";
import * as api from "./api";
import { RangeHint, avgGuesses, kindLabel, pct, shortDate, type SurfaceFilter } from "./analyticsUi";

/**
 * The most engaged tenth of devices against the other nine.
 *
 * The rest of the Players tab says how many people come back. This says what the
 * ones who keep coming back are like, so a lever can be pointed at the gap: if
 * every regular tried Leftovers on their second day and almost nobody else did,
 * that is a prompt to build; if their first Special went no better than anyone
 * else's, skill is not what separates them.
 *
 * A table, not a chart, and no colour: two groups, one row per question, and the
 * dashboard's four colour meanings are taken. Rates carry their interval when the
 * group is thin, which the regulars always are; a tenth of a small audience is a
 * handful of devices.
 *
 * Two traps the panel names rather than hides. The regulars have played more days
 * so they have had more practice: "first Special" is the guess count before any
 * practice, beside the all-Specials one. And the group is picked by the thing it
 * is then compared on (days played), so those rows describe the line, not a
 * finding.
 */

/** Mean of a solved-in histogram, or null with nothing solved. */
const meanGuesses = (dist: number[]) => avgGuesses(dist);

/** Median guess count off a solved-in histogram. */
const medianGuesses = (dist: number[]) => medianOf(dist.map((n, i) => [i + 1, n] as const));

const total = (dist: number[]) => dist.reduce((a, b) => a + b, 0);

const oneDp = (x: number | null) => (x === null ? "—" : x.toFixed(1));

/** A tally as "62%", its range when thin, and "5 of 8" under it. */
function Rate({ t }: { t: Tally }) {
  if (t.of === 0) return <>—</>;
  return (
    <>
      {pct(t.n, t.of)}%
      <RangeHint n={t.n} of={t.of} />
      <span className="ev-sub">
        {t.n} of {t.of}
      </span>
    </>
  );
}

interface Row {
  label: string;
  hint?: string;
  regulars: ReactNode;
  rest: ReactNode;
}

const days = (n: number | null) => (n === null ? "—" : `${n} day${n === 1 ? "" : "s"}`);

function rowsOf(reg: RegularsGroup, rest: RegularsGroup): Row[] {
  const tally = (pick: (g: RegularsGroup) => Tally): Pick<Row, "regulars" | "rest"> => ({
    regulars: <Rate t={pick(reg)} />,
    rest: <Rate t={pick(rest)} />,
  });
  const guesses = (pick: (g: RegularsGroup) => number[]) => ({
    regulars: <Guesses dist={pick(reg)} />,
    rest: <Guesses dist={pick(rest)} />,
  });
  return [
    { label: "Days played", hint: "Median per device. Regulars are chosen on this row.", regulars: days(reg.medianDays), rest: days(rest.medianDays) },
    {
      label: "Showed up on",
      hint: "Median share of the days since a device's first visit that it played.",
      regulars: reg.medianAttendance === null ? "—" : `${reg.medianAttendance}% of days`,
      rest: rest.medianAttendance === null ? "—" : `${rest.medianAttendance}% of days`,
    },
    { label: "Usual wait between visits", regulars: days(reg.medianGap), rest: days(rest.medianGap) },
    { label: "Longest streak", regulars: days(reg.medianStreak), rest: days(rest.medianStreak) },
    { label: "Rounds each day they play", regulars: oneDp(reg.roundsPerDay), rest: oneDp(rest.roundsPerDay) },
    {
      label: `Played in the last ${LAPSED_DAYS} days`,
      hint: "A regular who has gone quiet is the cheapest player to win back.",
      ...tally((g) => g.active),
    },
    { label: "Solved the Special", ...tally((g) => g.special.solved) },
    { label: "Guesses to solve", hint: "Mean and median, every finished Special.", ...guesses((g) => g.special.solvedIn) },
    {
      label: "Guesses on their first Special",
      hint: "Before any practice. Beside the row above, this says whether regulars started better or got better.",
      ...guesses((g) => g.special.firstSolvedIn),
    },
    { label: "Shared the Special's result", hint: "Of finished Specials.", ...tally((g) => g.special.shared) },
    { label: "Ever shared a result", ...tally((g) => g.sharedEver) },
    ...ROUND_KINDS.filter((k) => k !== "daily").map((k) => ({
      label: `Ever played ${kindLabel(k)}`,
      ...tally((g) => g.reach[k]),
    })),
    { label: "Play inside Discord", ...tally((g) => g.discord) },
    { label: "Day one: finished the Special", hint: "On the first ET day a device was seen.", ...tally((g) => g.dayOne.finished) },
    { label: "Day one: solved it", ...tally((g) => g.dayOne.solved) },
    { label: "Day one: shared", ...tally((g) => g.dayOne.shared) },
    { label: "Day one: played something extra", hint: "A Leftover, a Chef's Choice or a Nightcap on top of the Special.", ...tally((g) => g.dayOne.extra) },
  ];
}

function Guesses({ dist }: { dist: number[] }) {
  const n = total(dist);
  if (n === 0) return <>—</>;
  return (
    <>
      {oneDp(meanGuesses(dist))} avg
      <span className="ev-sub">
        median {medianGuesses(dist)} · {n} solved
      </span>
    </>
  );
}

/**
 * Behaviours where the regulars and everyone else are far enough apart to act on:
 * the same non-overlapping-interval test the rest of the dashboard uses, which
 * says "different" less often than it could. The point of listing them is that
 * these are the things worth trying to nudge in the other nine.
 */
function clearGaps(reg: RegularsGroup, rest: RegularsGroup): string[] {
  const pairs: [string, (g: RegularsGroup) => Tally][] = [
    ["finished the Special on their first day", (g) => g.dayOne.finished],
    ["solved it on their first day", (g) => g.dayOne.solved],
    ["shared on their first day", (g) => g.dayOne.shared],
    ["played something extra on their first day", (g) => g.dayOne.extra],
    ["have shared a result", (g) => g.sharedEver],
    ...ROUND_KINDS.filter((k) => k !== "daily").map(
      (k): [string, (g: RegularsGroup) => Tally] => [`have played ${kindLabel(k)}`, (g) => g.reach[k]],
    ),
    ["play inside Discord", (g) => g.discord],
  ];
  const out: string[] = [];
  for (const [label, pick] of pairs) {
    const a = rate(pick(reg).n, pick(reg).of);
    const b = rate(pick(rest).n, pick(rest).of);
    if (!separated(a, b) || a === null || b === null) continue;
    out.push(`${a.pct}% of regulars ${label}, against ${b.pct}% of everyone else.`);
  }
  return out;
}

/**
 * The one sentence worth reading first. Refuses below a handful of regulars: ten
 * devices is a small tenth, and "they come back on half of days" off three people
 * is a mood.
 */
function headline(r: RegularsReport): string | null {
  const g = r.regulars;
  if (!g || g.devices < REGULARS_MIN_GROUP) return null;
  const share = pct(r.roundsShare.n, r.roundsShare.of);
  const lead = `${g.devices} regulars (${pct(g.devices, r.devices)}% of devices, ${r.cutoffDays}+ days each) play ${share}% of all rounds.`;
  const attend =
    g.medianAttendance === null ? "" : ` They turn up on a median ${g.medianAttendance}% of days since they started.`;
  const first = total(g.special.firstSolvedIn);
  const restFirst = total(r.rest.special.firstSolvedIn);
  const start =
    first >= SMALL_SAMPLE_MIN && restFirst >= SMALL_SAMPLE_MIN
      ? ` On their first Special they took ${oneDp(meanGuesses(g.special.firstSolvedIn))} guesses against ${oneDp(meanGuesses(r.rest.special.firstSolvedIn))}.`
      : "";
  return `${lead}${attend}${start}`;
}

export default function RegularsPanel({ surface }: { surface: SurfaceFilter }) {
  const [report, setReport] = useState<RegularsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setReport(null);
    setError(null);
    api.getRegulars(surface === "all" ? undefined : surface).then(
      (r) => live && setReport(r),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [surface]);

  if (error) {
    return (
      <section className="panel">
        <h2>The regulars</h2>
        <p className="dash-note">Couldn't load the regulars: {error}</p>
      </section>
    );
  }
  if (!report) {
    return (
      <section className="panel">
        <h2>The regulars</h2>
        <p className="dash-note">Counting the regulars…</p>
      </section>
    );
  }
  const g = report.regulars;
  if (!g) {
    return (
      <section className="panel">
        <h2>The regulars</h2>
        <p className="dash-note">
          {report.devices === 0
            ? "No tracked devices yet."
            : `No device has played on a second day yet, so there is no top tenth to speak of (${report.devices} device${report.devices === 1 ? "" : "s"} so far).`}
        </p>
      </section>
    );
  }

  const lead = headline(report);
  const gaps = clearGaps(g, report.rest);
  const rows = rowsOf(g, report.rest);
  const shareOfDevices = pct(g.devices, report.devices);
  const topSources = g.sources.slice(0, 4);

  return (
    <section className="panel">
      <div className="analytics-head">
        <h2>The regulars</h2>
      </div>
      {lead && <p className="retention__headline">{lead}</p>}

      <div className="metric-row">
        <div className="metric metric--primary">
          <span className="metric__num">{g.devices}</span>
          <span className="metric__label">Regulars · {shareOfDevices}% of devices</span>
        </div>
        <div className="metric">
          <span className="metric__num">{report.cutoffDays}+</span>
          <span className="metric__label">Days played each</span>
        </div>
        <div className="metric">
          <span className="metric__num">{pct(report.roundsShare.n, report.roundsShare.of)}%</span>
          <span className="metric__label">Of all rounds</span>
        </div>
        <div className="metric">
          <span className="metric__num">{pct(g.active.n, g.active.of)}%</span>
          <span className="metric__label">Back this week</span>
        </div>
      </div>

      {gaps.length > 0 && (
        <>
          <h3 className="analytics-sub">What the regulars do that the rest mostly don't</h3>
          <ul className="device-data__facts">
            {gaps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}

      <div className="day-table-wrap">
        <table className="day-table dish-table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Regulars · {g.devices}</th>
              <th>Everyone else · {report.rest.devices}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>
                  <span className="ev-when" title={r.hint}>
                    {r.label}
                  </span>
                  {r.hint && <span className="ev-sub">{r.hint}</span>}
                </td>
                <td>{r.regulars}</td>
                <td>{report.rest.devices === 0 ? "—" : r.rest}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {topSources.length > 0 && (
        <p className="dash-note" style={{ marginTop: 10 }}>
          Where regulars first came from:{" "}
          {topSources
            .map((s) => `${s.source === SOURCE_DIRECT ? "direct / untagged" : s.source} ${s.devices}`)
            .join(" · ")}
          .
        </p>
      )}

      <details className="dash-details">
        <summary>What this counts</summary>
        <p className="dash-note">
          Devices ranked by distinct ET days played; the top tenth are regulars. Ties at the line are kept in, so the
          group can run a little over a tenth, and a device that played one day is never a regular. A device with
          the most days has also had the most practice, so read "first Special" for whether they began better.
          Groups are chosen on days played, so the first rows describe the line, not a finding. Guess counts are
          Today's Special only. Under {SMALL_SAMPLE_MIN} devices a rate carries its range. Tracking starts{" "}
          {report.since ? shortDate(report.since) : "with the first device"}; devices from before it enter as
          first-timers.
        </p>
      </details>
    </section>
  );
}
