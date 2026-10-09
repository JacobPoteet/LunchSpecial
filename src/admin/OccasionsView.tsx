// The Events page: when the diner dresses up, who saw it, and what it moved.
//
// "Events" on the nav because that is what you call them; "occasions" in the
// code and on the wire, because ad blockers match "event" in a URL (see
// shared/conventions.test.ts). Each costume is handcrafted in
// src/occasions/<id>/; this page only books it and reads it back.
//
// Three reads per costumed run, in the order you'd ask them:
//
//   1. Reach. Distinct devices that saw the costume (occasion_views), per day,
//      per room and surface; how many came back on another day of it; how
//      many found the ghost under the cloche; how many replayed one of its
//      days afterwards from Leftovers.
//   2. Impact. Rounds started, finished and shared against the same weekdays
//      just before it, lunch and Nightcap apart; first-time players the same
//      way. A before/after on one run is a reading, not proof.
//   3. The schedule, so a run you're reading sits beside the next one.
//
// Static like the rest of the back office: nothing here animates.

import { useCallback, useEffect, useState } from "react";
import {
  OCCASIONS,
  occasionRuns,
  shareVerdict,
  type AdminOccasions,
  type OccasionReach,
  type OccasionReport,
  type OccasionRunReport,
  type OccasionTally,
} from "../../shared/occasions";
import { countChange, rangeLabel, rate } from "../../shared/sample";
import { addDays } from "../../shared/time";
import { SurfaceToggle, shortDate, type SurfaceFilter } from "./analyticsUi";
import * as api from "./api";
import OccasionsPanel from "./OccasionsPanel";

/** A percentage of `of`, with its interval when `of` is thin. "—" when there's nothing to divide by. */
function Pct({ n, of }: { n: number; of: number }) {
  const r = rate(n, of);
  if (!r) return <>—</>;
  const range = rangeLabel(r);
  return (
    <>
      {r.pct}%{range && <span className="rate-range"> {range}</span>}
    </>
  );
}

function Metric({ num, label, sub }: { num: React.ReactNode; label: string; sub?: React.ReactNode }) {
  return (
    <div className="metric">
      <span className="metric__num">{num}</span>
      <span className="metric__label">{label}</span>
      {sub && <span className="occasion-metric__sub">{sub}</span>}
    </div>
  );
}

/** Devices per day of the run. Every bar one hue: the days are a sequence. */
function DailyReach({ daily }: { daily: OccasionReach["daily"] }) {
  const peak = Math.max(1, ...daily.map((d) => d.devices));
  return (
    <div
      className="spark occasion-spark"
      role="img"
      aria-label={daily.map((d) => `${shortDate(d.date)}: ${d.devices}`).join(", ")}
    >
      {daily.map((d) => (
        <div className="spark__col" key={d.date} title={`${d.date} · ${d.devices} device${d.devices === 1 ? "" : "s"}`}>
          <span className="spark__num">{d.devices}</span>
          <span
            className="spark__bar occasion-spark__bar"
            style={{ height: `${d.devices === 0 ? 0 : 6 + (d.devices / peak) * 94}%` }}
          />
          <span className="spark__tick">{shortDate(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

function Reach({ reach, live }: { reach: OccasionReach; live: boolean }) {
  if (reach.measuredFrom === null) {
    return (
      <p className="dash-note">
        Unmeasured: this run ended before sightings were recorded. Its rounds are still counted under Impact.
      </p>
    );
  }
  return (
    <>
      {reach.measuredFrom !== null && reach.daily.length > 0 && reach.measuredFrom > reach.daily[0].date && (
        <p className="dash-note">Measured from {shortDate(reach.measuredFrom)}; the days before it are unmeasured.</p>
      )}
      <div className="metric-row">
        <Metric
          num={reach.devices}
          label={live ? "Reached so far" : "Devices reached"}
          sub={
            <>
              <span className="badge">web {reach.bySurface.web}</span>{" "}
              <span className="badge badge--off">discord {reach.bySurface.discord}</span>
            </>
          }
        />
        <Metric num={reach.byRoom.diner} label="In the diner" />
        <Metric num={reach.byRoom.bar} label="At the bar" sub={<Pct n={reach.byRoom.bar} of={reach.devices} />} />
        <Metric
          num={reach.returned}
          label="Came back another day"
          sub={<Pct n={reach.returned} of={reach.devices} />}
        />
        <Metric
          num={reach.knocked}
          label="Found the ghost"
          sub={<Pct n={reach.knocked} of={reach.byRoom.diner} />}
        />
        <Metric num={reach.after} label="Replayed it later" />
      </div>
      {reach.daily.length > 1 && <DailyReach daily={reach.daily} />}
      <p className="dash-note">
        Devices, each counted once however often it looked. "Found the ghost" is out of devices that saw the diner;
        "replayed it later" is a Leftover from one of these days, opened after the run.
      </p>
    </>
  );
}

function ImpactRows({ label, run, before }: { label: string; run: OccasionTally; before: OccasionTally }) {
  if (run.started === 0 && before.started === 0) return null;
  const change = countChange(run.started, before.started);
  return (
    <>
      <tr>
        <th scope="row" rowSpan={2}>
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
        <td>
          <Pct n={run.completed} of={run.started} />
        </td>
        <td>
          <Pct n={run.shared} of={run.completed} />
        </td>
      </tr>
      <tr>
        <td>Weeks before</td>
        <td>{before.started}</td>
        <td>
          <Pct n={before.completed} of={before.started} />
        </td>
        <td>
          <Pct n={before.shared} of={before.completed} />
        </td>
      </tr>
    </>
  );
}

function Impact({ run }: { run: OccasionRunReport }) {
  const firsts = countChange(run.firstTimers.run, run.firstTimers.baseline);
  return (
    <>
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
            <ImpactRows label="Lunch" run={run.lunch.run} before={run.lunch.baseline} />
            <ImpactRows label="Nightcap" run={run.night.run} before={run.night.baseline} />
          </tbody>
        </table>
      </div>
      <p className="occasion-first">
        <strong>{run.firstTimers.run}</strong> first-time player{run.firstTimers.run === 1 ? "" : "s"} in costume
        against <strong>{run.firstTimers.baseline}</strong> the weeks before
        {firsts.pct !== null && (
          <>
            {" "}
            ({firsts.pct > 0 ? "+" : ""}
            {firsts.pct}%{firsts.clear ? "" : ", within the noise"})
          </>
        )}
        .
      </p>
      <p className="dash-note">
        Against {shortDate(run.baseline.start)} – {shortDate(run.baseline.end)}, the same weekdays. Finished is per
        round started, shared per round finished. Rounds count on their own day, so a Nightcap counts on its night.
      </p>
    </>
  );
}

function RunCard({ run }: { run: OccasionRunReport }) {
  return (
    <section className="panel occasion-run">
      <div className="occasion-run__head">
        <h2 className="occasion-run__title">
          {OCCASIONS[run.occasionId].name} · {shortDate(run.start)} – {shortDate(run.end)}
        </h2>
        <span className={run.pending ? "badge" : "badge badge--off"}>{run.pending ? "on now" : "finished"}</span>
      </div>
      <h3 className="occasion-run__section">Reach</h3>
      <Reach reach={run.reach} live={run.pending} />
      <h3 className="occasion-run__section">Impact</h3>
      <Impact run={run} />
    </section>
  );
}

export default function OccasionsView() {
  const [occasions, setOccasions] = useState<AdminOccasions | null>(null);
  const [occasionError, setOccasionError] = useState<string | null>(null);
  const [report, setReport] = useState<OccasionReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [surface, setSurface] = useState<SurfaceFilter>("all");

  const loadOccasions = useCallback(() => {
    api.getOccasions().then(setOccasions, (e: Error) => setOccasionError(e.message));
  }, []);
  useEffect(loadOccasions, [loadOccasions]);

  useEffect(() => {
    let live = true;
    setReport(null);
    api.getOccasionReport(surface === "all" ? undefined : surface).then(
      (r) => live && setReport(r),
      (e: Error) => live && setReportError(e.message),
    );
    return () => {
      live = false;
    };
    // A booking change can move a run, so the report re-reads with it.
  }, [surface, occasions]);

  // The runs still to come, from the same fold the game runs.
  const upcoming =
    occasions && report
      ? occasionRuns(report.today, addDays(report.today, 400), occasions.bookings).filter(
          (r) => r.start > report.today,
        )
      : [];

  return (
    <>
      <div className="occasion-view__bar">
        <h2 className="occasion-view__title">Events</h2>
        <SurfaceToggle value={surface} onChange={setSurface} />
      </div>

      {reportError && <p className="form-error">Couldn't load the event report: {reportError}</p>}
      {!report && !reportError && <p style={{ color: "var(--cream)" }}>Counting the costumes…</p>}
      {report && report.runs.length === 0 && (
        <section className="panel">
          <p className="dash-note" style={{ margin: 0 }}>
            No event has run yet.
            {upcoming[0] &&
              ` ${OCCASIONS[upcoming[0].occasionId].name} opens ${shortDate(upcoming[0].start)}; its reach and impact show up here from its first day.`}
          </p>
        </section>
      )}
      {report?.runs.map((run) => (
        <RunCard key={`${run.occasionId}-${run.start}`} run={run} />
      ))}

      <OccasionsPanel data={occasions} error={occasionError} onChanged={loadOccasions} />

      {upcoming.length > 0 && (
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Coming up</h2>
          <ul className="occasion-bookings">
            {upcoming.slice(0, 6).map((r) => (
              <li className="occasion-bookings__row" key={`${r.occasionId}-${r.start}`}>
                <span className="occasion-bookings__span">
                  {shortDate(r.start)} – {shortDate(r.end)}
                  {r.start.slice(0, 4) !== report!.today.slice(0, 4) && ` ${r.start.slice(0, 4)}`}
                </span>
                <span>{OCCASIONS[r.occasionId].name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
