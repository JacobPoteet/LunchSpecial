// Did a costume move anything? One card per costumed run, on the Trends tab.
//
// Each run is set against the same number of days just before it, moved back
// to whole weeks so the weekdays match (shared/occasions.ts baselineFor). A
// Special and a Nightcap are counted apart, never pooled. Rates are pooled
// over the period, and a rate off fewer than 30 rounds carries its range.
//
// A before/after on one run is a reading, not proof: anything else that
// changed that week shows up here too. The change log (Experiments) is where a
// costume would be tested properly.

import { OCCASIONS, shareVerdict, type OccasionReport, type OccasionTally } from "../../shared/occasions";
import { countChange, rangeLabel, rate } from "../../shared/sample";
import { shortDate } from "./analyticsUi";

function RateCell({ n, of }: { n: number; of: number }) {
  const r = rate(n, of);
  if (!r) return <td>—</td>;
  const range = rangeLabel(r);
  return (
    <td>
      {r.pct}%{range && <span className="rate-range"> {range}</span>}
    </td>
  );
}

function Rows({ label, run, before }: { label: string; run: OccasionTally; before: OccasionTally }) {
  if (run.started === 0 && before.started === 0) return null;
  const change = countChange(run.started, before.started);
  return (
    <>
      <tr>
        <th scope="rowgroup" rowSpan={2}>
          {label}
        </th>
        <td>In costume</td>
        <td>
          {run.started}
          {change.pct !== null && (
            <span className="rate-range">
              {" "}
              ({change.pct > 0 ? "+" : ""}
              {change.pct}%{change.clear ? "" : ", within the noise"})
            </span>
          )}
        </td>
        <RateCell n={run.completed} of={run.started} />
        <RateCell n={run.shared} of={run.completed} />
      </tr>
      <tr>
        <td>Weeks before</td>
        <td>{before.started}</td>
        <RateCell n={before.completed} of={before.started} />
        <RateCell n={before.shared} of={before.completed} />
      </tr>
    </>
  );
}

export default function OccasionReportPanel({ report, error }: { report: OccasionReport | null; error: string | null }) {
  if (error) {
    return (
      <section className="panel">
        <h2>Occasions</h2>
        <p className="dash-note">Couldn't load the occasion report: {error}</p>
      </section>
    );
  }
  if (!report || report.runs.length === 0) return null;

  return (
    <section className="panel">
      <h2>Occasions · in costume against the weeks before</h2>
      {report.runs.map((run) => (
        <div className="occasion-report" key={`${run.occasionId}-${run.start}`}>
          <h3 className="occasion-report__title">
            {OCCASIONS[run.occasionId].name} · {shortDate(run.start)} – {shortDate(run.end)}
          </h3>
          <p className="dish-report__headline">{shareVerdict(run.lunch.run, run.lunch.baseline, run.pending)}</p>
          <div className="day-table-wrap">
            <table className="day-table">
              <thead>
                <tr>
                  <th />
                  <th />
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Shared</th>
                </tr>
              </thead>
              <tbody>
                <Rows label="Lunch" run={run.lunch.run} before={run.lunch.baseline} />
                <Rows label="Nightcap" run={run.night.run} before={run.night.baseline} />
              </tbody>
            </table>
          </div>
          <p className="dash-note">
            Compared with {shortDate(run.baseline.start)} – {shortDate(run.baseline.end)}, the same weekdays. Finished is
            per round started; shared is per round finished. Counted by the round's own day, so a Nightcap counts on its
            night.
          </p>
        </div>
      ))}
    </section>
  );
}
