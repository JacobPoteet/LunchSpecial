// The Kids' Menu, on the Menu tab: of the lunch rounds that reached a fourth
// miss since it shipped, how many opened the card, and how those rounds ended
// beside the ones that didn't. The before/after read on whether it brings
// people back lives on the Experiments tab ("Back after a 4th miss").
//
// The win comparison is descriptive, not causal: a player who opens the menu
// chose to, and the choice and the outcome share causes. The panel says the two
// numbers and nothing about why.

import { useEffect, useState } from "react";
import type { KidsMenuReport } from "../../shared/types";
import { rangeLabel, type Rate } from "../../shared/sample";
import * as api from "./api";
import { SAMPLE_NOTE } from "./analyticsUi";

function RateMetric({ label, rate, primary }: { label: string; rate: Rate | null; primary?: boolean }) {
  const range = rangeLabel(rate);
  return (
    <div className={primary ? "metric metric--primary" : "metric"}>
      <span className="metric__num">{rate ? `${rate.pct}%` : "—"}</span>
      <span className="metric__label">
        {label}
        {rate && ` · of ${rate.of}`}
      </span>
      {range && (
        <span className="rate-range" title={SAMPLE_NOTE}>
          {range}
        </span>
      )}
    </div>
  );
}

export default function KidsMenuPanel() {
  const [report, setReport] = useState<KidsMenuReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.getKidsMenuReport().then(
      (r) => live && setReport(r),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="panel">
      <div className="analytics-head">
        <h2>Kids' Menu</h2>
      </div>
      {error && <p className="dash-note">Couldn't load the Kids' Menu: {error}</p>}
      {!error && !report && <p className="dash-note">Counting crayons…</p>}
      {report && report.measuredFrom === null && <p className="dash-note">Not measured yet.</p>}
      {report && report.measuredFrom !== null && (
        <>
          <div className="metric-row">
            <div className="metric">
              <span className="metric__num">{report.reached}</span>
              <span className="metric__label">Reached a 4th miss</span>
            </div>
            <RateMetric label="Opened it" rate={report.opened} primary />
            <RateMetric label="Won, opened" rate={report.wonAfterOpen} />
            <RateMetric label="Won, didn't" rate={report.wonWithout} />
          </div>
          <p className="dash-note">
            Since {report.measuredFrom} · {report.menuOrders} order{report.menuOrders === 1 ? "" : "s"} off the card ·
            lunch rounds only
          </p>
        </>
      )}
    </section>
  );
}
