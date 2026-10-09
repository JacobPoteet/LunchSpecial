import { useEffect, useState, type ReactNode } from "react";
import type { RegularsGroup, RegularsReport, Tally } from "../../shared/types";
import { LAPSED_DAYS, REGULARS_MIN_GROUP, ROUND_KINDS } from "../../shared/types";
import { SOURCE_DIRECT } from "../../shared/attribution";
import { SMALL_SAMPLE_MIN, medianOf, rate, separated } from "../../shared/sample";
import * as api from "./api";
import { RangeHint, avgGuesses, kindLabel, pct, type SurfaceFilter } from "./analyticsUi";

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

const total = (dist: number[]) => dist.reduce((a, b) => a + b, 0);

const oneDp = (x: number | null) => (x === null ? "—" : x.toFixed(1));

const days = (n: number | null) => (n === null ? "—" : `${n} day${n === 1 ? "" : "s"}`);

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

/** Mean and median off a solved-in histogram, and how many solves it rests on. */
function Guesses({ dist }: { dist: number[] }) {
  const n = total(dist);
  if (n === 0) return <>—</>;
  return (
    <>
      {oneDp(avgGuesses(dist))} avg
      <span className="ev-sub">
        median {medianOf(dist.map((c, i) => [i + 1, c] as const))} · {n} solved
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

/** A run of rows under one question, with the caveat that applies to all of them. */
interface Section {
  title: string;
  note?: string;
  rows: Row[];
}

function sectionsOf(reg: RegularsGroup, rest: RegularsGroup): Section[] {
  const both = (f: (g: RegularsGroup) => ReactNode): Pick<Row, "regulars" | "rest"> => ({
    regulars: f(reg),
    rest: f(rest),
  });
  const tally = (pick: (g: RegularsGroup) => Tally) => both((g) => <Rate t={pick(g)} />);
  const guesses = (pick: (g: RegularsGroup) => number[]) => both((g) => <Guesses dist={pick(g)} />);

  // Sources: the regulars' top three, each as a share of the devices whose
  // source is known, on both sides, so the line is a comparison and not a list.
  const sourceRows = reg.sources.slice(0, 3).map(({ source }) => ({
    label: source === SOURCE_DIRECT ? "Direct / untagged" : source,
    ...tally((g) => ({ n: g.sources.find((s) => s.source === source)?.devices ?? 0, of: g.sourced })),
  }));

  return [
    {
      title: "How often they come",
      note: "Regulars are picked on this.",
      rows: [
        { label: "Days played", ...both((g) => days(g.medianDays)) },
        {
          label: "Showed up on",
          hint: "Since their first round.",
          ...both((g) => (g.medianAttendance === null ? "—" : `${g.medianAttendance}% of days`)),
        },
        { label: "Usual wait between visits", ...both((g) => days(g.medianGap)) },
        { label: "Longest streak", ...both((g) => days(g.medianStreak)) },
        { label: "Rounds each day they play", ...both((g) => oneDp(g.roundsPerDay)) },
        {
          label: `Played in the last ${LAPSED_DAYS} days`,
          ...tally((g) => g.active),
        },
      ],
    },
    {
      title: "Today's Special",
      rows: [
        { label: "Solved it", hint: "Of finished Specials.", ...tally((g) => g.special.solved) },
        { label: "Guesses to solve", ...guesses((g) => g.special.solvedIn) },
        { label: "Solved their first Special", hint: "Before any practice.", ...tally((g) => g.special.firstSolved) },
        {
          label: "Guesses on their first Special",
          ...guesses((g) => g.special.firstSolvedIn),
        },
        { label: "Shared the result", hint: "Of finished Specials.", ...tally((g) => g.special.shared) },
      ],
    },
    {
      title: "Their first day",
      note: "A fair comparison.",
      rows: [
        { label: "Finished the Special", ...tally((g) => g.dayOne.finished) },
        { label: "Solved it", ...tally((g) => g.dayOne.solved) },
        { label: "Shared", ...tally((g) => g.dayOne.shared) },
        {
          label: "Played something extra",
          hint: "Leftover, Chef's Choice or Nightcap.",
          ...tally((g) => g.dayOne.extra),
        },
      ],
    },
    {
      title: "Ever tried",
      note: "Regulars had more days to try.",
      rows: [
        { label: "Shared a result", ...tally((g) => g.sharedEver) },
        ...ROUND_KINDS.filter((k) => k !== "daily").map((k) => ({
          label: `Played ${kindLabel(k)}`,
          ...tally((g) => g.reach[k]),
        })),
        { label: "Played inside Discord", ...tally((g) => g.discord) },
      ],
    },
    ...(sourceRows.length > 0
      ? [{ title: "Where they first came from", rows: sourceRows }]
      : []),
  ];
}

/**
 * Day-one behaviours where the two groups are far enough apart to act on: the
 * same non-overlapping-interval test the rest of the dashboard uses.
 *
 * Only behaviours measured on equal footing are eligible. "Ever played X" is
 * not: the regulars have had more days to do anything, so that gap is mostly
 * the selection. Day one is one day for everyone, so a gap there is the lever:
 * something a newcomer does that the ones who stay did more (or less).
 */
function clearGaps(reg: RegularsGroup, rest: RegularsGroup): string[] {
  const pairs: [string, (g: RegularsGroup) => Tally][] = [
    ["Finished the Special", (g) => g.dayOne.finished],
    ["Solved it", (g) => g.dayOne.solved],
    ["Shared", (g) => g.dayOne.shared],
    ["Played something extra", (g) => g.dayOne.extra],
    ["Solved their first Special", (g) => g.special.firstSolved],
  ];
  const out: string[] = [];
  for (const [label, pick] of pairs) {
    const a = rate(pick(reg).n, pick(reg).of);
    const b = rate(pick(rest).n, pick(rest).of);
    if (a === null || b === null || !separated(a, b)) continue;
    out.push(`${label}: ${a.pct}% vs ${b.pct}%`);
  }
  return out;
}

/**
 * The one sentence worth reading first. Refuses below a handful of regulars: ten
 * devices is a small tenth, and "they come back on half of days" off three people
 * is a mood. The first-Special comparison is said only when the two rates are
 * clearly apart, and as "no clear difference" when both sides are well measured
 * and they aren't: that is a finding too (skill is not what keeps people).
 */
function headline(r: RegularsReport): string | null {
  const g = r.regulars;
  if (!g || g.devices < REGULARS_MIN_GROUP) return null;
  const lead = `${pct(g.devices, r.devices)}% of devices play ${pct(r.roundsShare.n, r.roundsShare.of)}% of rounds.`;
  const mine = g.special.firstSolved;
  const theirs = r.rest.special.firstSolved;
  const a = rate(mine.n, mine.of);
  const b = rate(theirs.n, theirs.of);
  let start = "";
  if (a && b && separated(a, b)) {
    start = ` First Special solved: ${a.pct}% vs ${b.pct}%.`;
  } else if (a && b && mine.of >= SMALL_SAMPLE_MIN && theirs.of >= SMALL_SAMPLE_MIN) {
    start = " First Special: no clear difference.";
  }
  return `${lead}${start}`;
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
            : "Nobody has played a second day yet."}
        </p>
      </section>
    );
  }

  const lead = headline(report);
  const gaps = clearGaps(g, report.rest);
  const sections = sectionsOf(g, report.rest);
  const shareOfDevices = pct(g.devices, report.devices);

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
      </div>

      {gaps.length > 0 && (
        <>
          <h3 className="analytics-sub">Clear gaps · regulars vs everyone else</h3>
          <ul className="device-data__facts">
            {gaps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}

      <div className="day-table-wrap">
        <table className="day-table dish-table regulars-table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Regulars · {g.devices}</th>
              <th>Everyone else · {report.rest.devices}</th>
            </tr>
          </thead>
          {sections.map((sec) => (
            <tbody key={sec.title}>
              <tr className="regulars-table__section">
                <th colSpan={3} scope="colgroup">
                  {sec.title}
                  {sec.note && <span className="ev-sub">{sec.note}</span>}
                </th>
              </tr>
              {sec.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">
                    <span className="ev-when">{r.label}</span>
                    {r.hint && <span className="ev-sub">{r.hint}</span>}
                  </th>
                  <td>{r.regulars}</td>
                  <td>{report.rest.devices === 0 ? "—" : r.rest}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {report.pending > 0 && (
        <p className="dash-note" style={{ marginTop: 10 }}>
          {report.pending} device{report.pending === 1 ? "" : "s"} under {report.windowDays} days old left out.
        </p>
      )}

    </section>
  );
}
