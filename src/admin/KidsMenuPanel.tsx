// The Kids' Menu, on the Menu tab: of the lunch rounds that reached a fourth
// miss since it shipped, how many opened the card, and how those rounds ended
// beside the ones that didn't. The before/after read on whether it brings
// people back lives on the Experiments tab ("Back after a 4th miss").
//
// The win comparison is descriptive, not causal: a player who opens the menu
// chose to, and the choice and the outcome share causes. The panel says the two
// numbers and nothing about why. The two reads under it hold more still (worker/
// kidsmenu.ts): wins against a blind pick off the same cards, and opened vs
// didn't within boards that would have printed the same size of card.

import { useEffect, useState } from "react";
import { KIDS_MENU_SIZES, type KidsMenuReport } from "../../shared/types";
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span className="metric__num">{value}</span>
      <span className="metric__label">{label}</span>
    </div>
  );
}

const sizeLabel = ([low, high]: readonly [number, number | null]) =>
  high === null ? `${low}+` : low === high ? `${low}` : `${low}–${high}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function RateCell({ rate }: { rate: Rate | null }) {
  if (!rate) return <td>—</td>;
  const range = rangeLabel(rate);
  return (
    <td>
      {rate.pct}% · of {rate.of}
      {range && (
        <span className="rate-range" title={SAMPLE_NOTE}>
          {" "}
          {range}
        </span>
      )}
    </td>
  );
}

function CardSizes({ cards }: { cards: NonNullable<KidsMenuReport["cards"]> }) {
  const max = Math.max(1, ...cards.sizes);
  return (
    <>
      <div className="metric-row">
        <Metric label="Median" value={cards.median} />
        <Metric label="p90" value={cards.p90} />
        <Metric label="Opened again at 5th miss" value={cards.reopened} />
      </div>
      <div className="dist">
        {cards.sizes.map((n, i) => (
          <div className="dist__row" key={i} style={{ "--w": `${8 + (n / max) * 80}%` } as React.CSSProperties}>
            <span>{sizeLabel(KIDS_MENU_SIZES[i])}</span>
            <span className="dist__bar">{n}</span>
          </div>
        ))}
      </div>
      <p className="dash-note">
        Dishes on the card, first open · {plural(cards.opens, "round", "rounds")} since {cards.measuredFrom}
      </p>
    </>
  );
}

function LikeBoards({ like }: { like: KidsMenuReport["likeBoards"] }) {
  const d = like.difference;
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <>
      <div className="day-table-wrap">
        <table className="day-table">
          <thead>
            <tr>
              <th>Card size at 4th miss</th>
              <th>Won, opened</th>
              <th>Won, didn&apos;t</th>
            </tr>
          </thead>
          <tbody>
            {like.rows.map((row, i) => (
              <tr key={i}>
                <td>{sizeLabel(KIDS_MENU_SIZES[i])}</td>
                <RateCell rate={row.opened} />
                <RateCell rate={row.without} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dash-note">
        {d === null
          ? "No size with rounds on both sides"
          : `Opened − didn't: ${sign(d.pts)} pts (${sign(d.low)} to ${sign(d.high)})${d.low > 0 || d.high < 0 ? "" : " · within noise"}`}
        {like.unmeasured > 0 && ` · ${like.unmeasured} without a full board on file`}
        {like.agreement.of > 0 && ` · rebuilt size matches the card ${like.agreement.n} of ${like.agreement.of}`}
      </p>
    </>
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
            Since {report.measuredFrom} · {plural(report.reachedDevices, "device", "devices")} ·{" "}
            {plural(report.menuOrders, "order", "orders")} off the card
            {report.orderHits && `, ${report.orderHits.pct}% the Special`} · lunch rounds only
          </p>

          <h3>Card size</h3>
          {report.cards ? <CardSizes cards={report.cards} /> : <p className="dash-note">No sizes on file yet.</p>}

          <h3>Against a blind pick</h3>
          {report.chance.won ? (
            <>
              <div className="metric-row">
                <RateMetric label="Won off the card" rate={report.chance.won} primary />
                <Metric label="Blind pick" value={`${report.chance.blindPct}%`} />
              </div>
              <p className="dash-note">Finished rounds that opened it, same cards.</p>
            </>
          ) : (
            <p className="dash-note">Nothing finished off the card yet.</p>
          )}

          <h3>Like boards</h3>
          <LikeBoards like={report.likeBoards} />
        </>
      )}
    </section>
  );
}
