import { useEffect, useMemo, useState } from "react";
import type { DishReport, DishReportRow } from "../../shared/types";
import { rate, separated } from "../../shared/sample";
import * as api from "./api";
import { RangeHint, avgGuesses, pct, shortDate, type SurfaceFilter } from "./analyticsUi";

/**
 * How each dish actually played — the half of the Menu tab that grades the
 * kitchen's choices instead of describing them.
 *
 * Every round has carried its `dish_id` since migrations/0012 and nothing
 * aggregated it, so the dashboard could tell you the menu was Europe-heavy and
 * separately that the win rate dipped, and never that those were the same fact.
 * This is that join, and it's the loop that closes on content: pick a Special,
 * see how it landed, pick the next one knowing.
 */

/**
 * Below this many completions a dish has an anecdote, not a record. It still gets
 * a row — "how did Wednesday's dish go" is a real question and a blank answers it
 * worse — but the row says so, and it's held out of the headline comparison.
 */
const DISH_MIN_COMPLETED = 8;

type SortKey = "hardest" | "played" | "shared" | "recent";

const SORTS: { key: SortKey; label: string; hint: string }[] = [
  { key: "hardest", label: "Hardest", hint: "Most losses per completed round — the clue ladder's failures first" },
  { key: "played", label: "Most played", hint: "Rounds started, every mode" },
  { key: "shared", label: "Most shared", hint: "Share of finishers who sent their result on" },
  { key: "recent", label: "Recently served", hint: "Last time it was the Special" },
];

function sortRows(rows: DishReportRow[], key: SortKey): DishReportRow[] {
  const out = [...rows];
  switch (key) {
    case "played":
      return out.sort((a, b) => b.started - a.started);
    case "shared":
      // Rate, not count — a dish served three times can't out-share a staple on
      // volume, and the question is whether the dish made people want to share.
      return out.sort((a, b) => pct(b.shared, b.completed) - pct(a.shared, a.completed) || b.shared - a.shared);
    case "recent":
      return out.sort((a, b) => (b.lastServed ?? "").localeCompare(a.lastServed ?? ""));
    default:
      return out; // the server already ranks hardest-first
  }
}

/**
 * The one sentence the table supports: is the clue ladder landing evenly, or is
 * some of the menu unplayable?
 *
 * Only dishes with a real record are eligible, and the two ends are only called
 * out when their confidence intervals don't overlap — see shared/sample.ts. At a
 * few dozen rounds a dish, "hardest" and "easiest" are usually the same dish with
 * different luck, and saying so out loud is worth more than a ranking.
 */
function spreadNote(rows: DishReportRow[]): string | null {
  const measured = rows.filter((d) => d.completed >= DISH_MIN_COMPLETED);
  if (measured.length < 2) {
    return `Not enough completed rounds on any two dishes yet to compare them — a dish needs about ${DISH_MIN_COMPLETED} finishes before its win rate means much.`;
  }
  const byWin = [...measured].sort((a, b) => pct(a.solved, a.completed) - pct(b.solved, b.completed));
  const hardest = byWin[0];
  const easiest = byWin[byWin.length - 1];
  const hardRate = rate(hardest.solved, hardest.completed);
  const easyRate = rate(easiest.solved, easiest.completed);
  const gap = `${hardest.name} is the toughest at ${hardRate?.pct}% solved, ${easiest.name} the kindest at ${easyRate?.pct}%`;
  if (!separated(hardRate, easyRate)) {
    return `${gap} — but the two overlap once you account for how few rounds each has, so that's a ranking, not a difference yet.`;
  }
  return `${gap}. That gap is wider than the counts can explain by chance — worth reading ${hardest.name}'s clue ladder.`;
}

/** One dish's guess distribution as a compact inline strip, 1..6 then a loss bucket. */
function MiniDist({ dist, fails }: { dist: number[]; fails: number }) {
  const buckets = [...dist, fails];
  const max = Math.max(1, ...buckets);
  return (
    <span className="minidist" aria-hidden="true">
      {buckets.map((n, i) => (
        <span
          key={i}
          className={`minidist__bar${i === dist.length ? " minidist__bar--fail" : ""}`}
          style={{ height: `${n === 0 ? 4 : 10 + (n / max) * 90}%` }}
          title={`${i === dist.length ? "Out of guesses" : `Solved in ${i + 1}`}: ${n}`}
        />
      ))}
    </span>
  );
}

export default function DishReportPanel({ surface }: { surface: SurfaceFilter }) {
  const [report, setReport] = useState<DishReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("hardest");

  useEffect(() => {
    let live = true;
    setError(null);
    api.getDishReport(surface === "all" ? undefined : surface).then(
      (r) => live && setReport(r),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [surface]);

  const rows = useMemo(() => (report ? sortRows(report.rows, sort) : []), [report, sort]);

  if (error) {
    return (
      <section className="panel">
        <h2>How the dishes played</h2>
        <p className="dash-note">Couldn't load the dish report: {error}</p>
      </section>
    );
  }
  if (!report) {
    return (
      <section className="panel">
        <h2>How the dishes played</h2>
        <p className="dash-note">Reading the order tickets…</p>
      </section>
    );
  }
  if (report.rows.length === 0) {
    return (
      <section className="panel">
        <h2>How the dishes played</h2>
        <p className="dash-note">
          No rounds have been recorded against a dish yet.
          {report.untracked > 0 &&
            ` The ${report.untracked} round${report.untracked === 1 ? "" : "s"} on record predate dish tracking.`}
        </p>
      </section>
    );
  }

  const headline = spreadNote(report.rows);

  return (
    <section className="panel">
      <div className="analytics-head">
        <h2>How the dishes played</h2>
        <div className="surface-toggle" role="tablist" aria-label="Sort dishes">
          {SORTS.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={sort === s.key}
              title={s.hint}
              className={`surface-toggle__btn${sort === s.key ? " surface-toggle__btn--active" : ""}`}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {headline && <p className="dish-report__headline">{headline}</p>}

      <div className="day-table-wrap">
        <table className="day-table dish-table">
          <thead>
            <tr>
              <th>Dish</th>
              <th title="Rounds started, every mode">Played</th>
              <th title="Rounds that reached game over">Finished</th>
              <th title="Share of finished rounds that were won">Win rate</th>
              <th title="Mean guesses across the rounds that were solved">Avg</th>
              <th title="Guesses used, 1 to 6, then the rounds that ran out">Spread</th>
              <th title="Share of finishers who sent their result on">Shared</th>
              <th title="Times this dish has been the scheduled Special">Served</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const thin = d.completed < DISH_MIN_COMPLETED;
              const avg = avgGuesses(d.guessDistribution);
              // A dish carried by replays isn't a Special that landed; say which
              // it is rather than letting the totals imply.
              const replays = d.byKind.leftover + d.byKind.random;
              return (
                <tr key={d.dishId} className={thin ? "dish-table__row--thin" : undefined}>
                  <td>
                    <span className="ev-when">{d.name}</span>
                    <span className="ev-sub">
                      {d.country}
                      {replays > 0 && ` · ${replays} replay${replays === 1 ? "" : "s"}`}
                    </span>
                  </td>
                  <td>{d.started}</td>
                  <td>{d.completed}</td>
                  <td>
                    {d.completed === 0 ? (
                      "—"
                    ) : (
                      <>
                        {pct(d.solved, d.completed)}%
                        <RangeHint n={d.solved} of={d.completed} />
                      </>
                    )}
                  </td>
                  <td>{avg === null ? "—" : avg.toFixed(2)}</td>
                  <td>
                    <MiniDist dist={d.guessDistribution} fails={d.fails} />
                  </td>
                  <td>{d.completed === 0 ? "—" : `${pct(d.shared, d.completed)}%`}</td>
                  <td>
                    {d.timesServed}
                    {d.lastServed && <span className="ev-sub">{shortDate(d.lastServed)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="dash-note" style={{ marginTop: 8 }}>
        Every mode counts here, not just the Special: a Leftover or a Chef's Choice is still a real first
        attempt at that dish, and at this volume including them is the difference between a dish having
        thirty attempts and having nine. Rows in grey have under {DISH_MIN_COMPLETED} finishes — read those
        as anecdotes.
        {report.untracked > 0 &&
          ` ${report.untracked} round${report.untracked === 1 ? "" : "s"} predate dish tracking and carry no dish; they're left out rather than assigned to one.`}
      </p>
    </section>
  );
}
