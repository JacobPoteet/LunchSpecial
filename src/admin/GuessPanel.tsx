import { useEffect, useState } from "react";
import type { GuessPick, GuessReport } from "../../shared/types";
import * as api from "./api";
import { shortDate } from "./analyticsUi";

/**
 * What players actually order. The dish report says how a Special landed; this
 * says where the misses went: which wrong dish a Special keeps drawing is the
 * difference between a hard dish and a clue that points the wrong way.
 *
 * Counts only, never rates. Guesses are volume, not people, and a share off a
 * few dozen of them is the thing the rest of this dashboard refuses to print.
 * The ledger has no surface, so the tab's Web/Discord filter doesn't apply.
 * One panel for both menus: the kitchen's on Menu, the bar's on After Dark. They
 * read separate ledgers (dish ids and drink ids never meet), so `catalogue` picks
 * the route and the words, and nothing else differs.
 */

type Catalogue = "dish" | "drink";

const WORDS: Record<
  Catalogue,
  { title: string; wrong: string; by: string; answer: string; wrongCol: string; plural: string; noun: string; foot: string }
> = {
  dish: {
    title: "What people order",
    wrong: "Wrong dishes players reach for",
    by: "Wrong guesses by Special",
    answer: "Special",
    wrongCol: "Most-ordered wrong dishes",
    plural: "Specials",
    noun: "wrong guess",
    foot: "Every dish mode counts.",
  },
  drink: {
    title: "What people pour",
    wrong: "Wrong pours players reach for",
    by: "Wrong guesses by Nightcap",
    answer: "Nightcap",
    wrongCol: "Most-poured wrong drinks",
    plural: "Nightcaps",
    noun: "wrong guess",
    foot: "Four guesses to a Nightcap.",
  },
};

/** Rows of the by-answer table shown before the fold. */
const ROWS_SHOWN = 8;

function PickBars({ picks, noun }: { picks: GuessPick[]; noun: string }) {
  const max = Math.max(1, ...picks.map((p) => p.count));
  return (
    <div className="mix">
      {picks.map((p) => (
        <div
          className="mix__row mix__row--plain mix__row--wide"
          key={p.id}
          title={`${p.name}: ${p.count} ${noun}${p.count === 1 ? "" : "s"}`}
        >
          <span className="mix__label">{p.name}</span>
          <span className="mix__track">
            <span className="mix__bar" style={{ width: `${(p.count / max) * 100}%` }} />
          </span>
          <span className="mix__val">{p.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function GuessPanel({ catalogue = "dish" }: { catalogue?: Catalogue }) {
  const w = WORDS[catalogue];
  const [report, setReport] = useState<GuessReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    api.getGuessReport(catalogue).then(
      (r) => live && setReport(r),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [catalogue]);

  const title = w.title;

  if (error) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="dash-note">Couldn't load the guess report: {error}</p>
      </section>
    );
  }
  if (!report) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="dash-note">Reading the order tickets…</p>
      </section>
    );
  }
  if (report.guesses === 0) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="dash-note">No guesses recorded yet.</p>
      </section>
    );
  }

  const rows = all ? report.rows : report.rows.slice(0, ROWS_SHOWN);

  return (
    <section className="panel">
      <div className="analytics-head">
        <h2>{title}</h2>
      </div>

      <div className="metric-row">
        <div className="metric metric--primary">
          <span className="metric__num">{report.guesses}</span>
          <span className="metric__label">Guesses recorded</span>
        </div>
        <div className="metric">
          <span className="metric__num">{report.rounds}</span>
          <span className="metric__label">Rounds</span>
        </div>
        <div className="metric">
          <span className="metric__num">{report.since ? shortDate(report.since) : "—"}</span>
          <span className="metric__label">Recording since</span>
        </div>
      </div>

      <div className="analytics-split">
        <div>
          <h3 className="analytics-sub">{w.wrong}</h3>
          {report.decoys.length === 0 ? (
            <p className="dash-note">Every recorded guess was right.</p>
          ) : (
            <PickBars picks={report.decoys} noun={w.noun} />
          )}
        </div>
        <div>
          <h3 className="analytics-sub">What they open with</h3>
          <PickBars picks={report.openers} noun="opening guess" />
        </div>
      </div>

      {report.rows.length > 0 && (
        <details className="dash-details dash-details--table">
          <summary>
            <span>
              {w.by} · {report.rows.length}
            </span>
          </summary>
          <div className="day-table-wrap">
            <table className="day-table">
              <thead>
                <tr>
                  <th>{w.answer}</th>
                  <th>Guesses</th>
                  <th>Rounds</th>
                  <th>{w.wrongCol}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="ev-when">{r.name}</span>
                      <span className="ev-sub">{r.country}</span>
                    </td>
                    <td>{r.guesses}</td>
                    <td>{r.rounds}</td>
                    <td>
                      {r.topWrong.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && " · "}
                          {p.name} <span className="ev-sub" style={{ display: "inline" }}>×{p.count}</span>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.rows.length > ROWS_SHOWN && (
            <p className="dash-note" style={{ marginTop: 8 }}>
              <button className="link-btn" onClick={() => setAll(!all)}>
                {all ? "Show fewer" : `Show all ${report.rows.length} ${w.plural}`}
              </button>
            </p>
          )}
        </details>
      )}

      <p className="dash-note" style={{ marginTop: 10 }}>
        Guesses, not people. {w.foot}
        {report.since && ` Since ${shortDate(report.since)}.`}
      </p>
    </section>
  );
}
