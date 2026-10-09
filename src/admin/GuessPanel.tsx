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
 * Dishes only: Nightcap guesses carry drink ids and belong on After Dark.
 */

/** Rows of the by-Special table shown before the fold. */
const ROWS_SHOWN = 8;

function PickBars({ picks, noun }: { picks: GuessPick[]; noun: string }) {
  const max = Math.max(1, ...picks.map((p) => p.count));
  return (
    <div className="mix">
      {picks.map((p) => (
        <div
          className="mix__row mix__row--plain mix__row--wide"
          key={p.dishId}
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

export default function GuessPanel() {
  const [report, setReport] = useState<GuessReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    api.getGuessReport().then(
      (r) => live && setReport(r),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, []);

  const title = "What people order";

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
        <p className="dash-note">
          No guesses recorded yet. They are written as players guess, from the release that added the guess ledger
          onward; earlier days are unmeasured, not empty.
        </p>
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
          <h3 className="analytics-sub">Wrong dishes players reach for</h3>
          {report.decoys.length === 0 ? (
            <p className="dash-note">Every recorded guess was right.</p>
          ) : (
            <PickBars picks={report.decoys} noun="wrong guess" />
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
            <span>Wrong guesses by Special · {report.rows.length}</span>
          </summary>
          <div className="day-table-wrap">
            <table className="day-table">
              <thead>
                <tr>
                  <th>Special</th>
                  <th title="Guesses recorded against it, right and wrong">Guesses</th>
                  <th title="Rounds those guesses came from">Rounds</th>
                  <th>Most-ordered wrong dishes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dishId}>
                    <td>
                      <span className="ev-when">{r.name}</span>
                      <span className="ev-sub">{r.country}</span>
                    </td>
                    <td>{r.guesses}</td>
                    <td>{r.rounds}</td>
                    <td>
                      {r.topWrong.map((p, i) => (
                        <span key={p.dishId}>
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
                {all ? "Show fewer" : `Show all ${report.rows.length} Specials`}
              </button>
            </p>
          )}
        </details>
      )}

      <p className="dash-note" style={{ marginTop: 10 }}>
        Counts of guesses, not people. Every dish mode counts. No Web/Discord filter: guesses carry no surface. Days before
        {report.since ? ` ${shortDate(report.since)}` : " recording began"} are unmeasured.
      </p>
    </section>
  );
}
