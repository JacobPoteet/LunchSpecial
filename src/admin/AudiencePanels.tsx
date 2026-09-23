import type {
  ActiveWindow,
  ArrivalFunnel,
  AudienceReport,
  CameBack,
  WeeklyActive,
  WeeklyCohort,
} from "../../shared/types";
import { countChange, rangeLabel, rate, separated, SMALL_SAMPLE_MIN } from "../../shared/sample";
import { shortDate, type SurfaceFilter } from "./analyticsUi";

/**
 * The audience reads off /audience: the weekly-active KPI (Today), the weekly
 * new-vs-returning chart (Trends), and the first-visit funnel and cohort grid
 * (Players). One module because they share one definition of "active" — a
 * device that started a round — and a second copy of that sentence would drift.
 */

const COLUMNS: { key: "all" | "web" | "discord"; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "web", label: "Web" },
  { key: "discord", label: "Discord" },
];

const ACTIVE_NOTE =
  "A device counts as active on a day it started at least one round, in any mode. Opening the board without guessing doesn't count; that's the funnel's job.";

function Loading({ title, error }: { title: string; error: string | null }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <p className="dash-note">{error ? `Couldn't load the audience reads: ${error}` : "Counting heads…"}</p>
    </section>
  );
}

/** "▲ 3 (+6%)" plus the noise verdict, or null when there's nothing to compare against. */
function ChangeLine({ now, before }: { now: number; before: number }) {
  if (now === 0 && before === 0) return null;
  const c = countChange(now, before);
  const arrow = c.delta > 0 ? "▲" : c.delta < 0 ? "▼" : "=";
  const size = c.delta === 0 ? "no change" : `${Math.abs(c.delta)}${c.pct === null ? "" : ` (${c.pct > 0 ? "+" : ""}${c.pct}%)`}`;
  return (
    <span className={`wkpi__change${c.clear ? (c.delta > 0 ? " wkpi__change--up" : " wkpi__change--down") : ""}`}>
      <span aria-hidden="true">{arrow}</span> {size} vs the week before
      <span className="wkpi__verdict">{c.clear ? "a real move" : "within week-to-week noise"}</span>
    </span>
  );
}

function KpiColumn({ label, now, before, lead }: { label: string; now: ActiveWindow; before: ActiveWindow; lead: boolean }) {
  return (
    <div className={`wkpi__col${lead ? " wkpi__col--lead" : ""}`}>
      <span className="wkpi__label">{label}</span>
      <span className="wkpi__num">{now.active}</span>
      <span className="wkpi__split">
        <span className="wkpi__dot wkpi__dot--new" /> {now.new} new ·{" "}
        <span className="wkpi__dot wkpi__dot--returning" /> {now.returning} returning
      </span>
      <ChangeLine now={now.active} before={before.active} />
    </div>
  );
}

/**
 * The Today tab's lead number: devices that played in the last seven complete
 * days, every surface side by side. Today is left out because it's a part-day:
 * comparing a Wednesday morning with a whole prior Wednesday would read as a
 * drop every morning.
 */
export function WeeklyKpi({ data, error }: { data: AudienceReport | null; error: string | null }) {
  if (!data) return <Loading title="Last 7 days" error={error} />;
  const { lastWeek, priorWeek } = data.bySurface.all;
  return (
    <section className="panel">
      <h2>
        Last 7 days · {shortDate(lastWeek.from)} to {shortDate(lastWeek.to)}
      </h2>
      <div className="wkpi" title={ACTIVE_NOTE}>
        {COLUMNS.map((c) => (
          <KpiColumn
            key={c.key}
            label={c.key === "all" ? "Devices that played" : c.label}
            now={data.bySurface[c.key].lastWeek}
            before={data.bySurface[c.key].priorWeek}
            lead={c.key === "all"}
          />
        ))}
      </div>
      <p className="dash-note">
        Against {shortDate(priorWeek.from)} to {shortDate(priorWeek.to)}. Today is left out until it's over.
        "New" means the device's first round fell in the window. The noise call treats each week as a
        count and asks whether the gap clears two standard deviations. Consecutive weeks share their
        regulars, so it errs toward "noise".
      </p>
    </section>
  );
}

/**
 * Weekly active devices, stacked: returning at the base, new on top. The lead
 * chart on Trends, ahead of the running total, because a running total can
 * only climb and it hides exactly the shape this one shows: fewer new devices
 * each week while the regulars hold.
 */
export function WeeklyActiveChart({
  data,
  error,
  surface,
}: {
  data: AudienceReport | null;
  error: string | null;
  surface: SurfaceFilter;
}) {
  if (!data) return <Loading title="Devices playing each week" error={error} />;
  const weeks = data.bySurface[surface].weeks;
  if (weeks.length === 0) {
    return (
      <section className="panel">
        <h2>Devices playing each week</h2>
        <p className="dash-note">No tracked players yet.</p>
      </section>
    );
  }
  const max = Math.max(1, ...weeks.map((w) => w.new + w.returning));
  const full = weeks.filter((w) => w.daysElapsed === 7);
  const note = weeklyNote(full);

  return (
    <section className="panel">
      <h2>Devices playing each week</h2>
      {note && <p className="retention__headline">{note}</p>}
      <div className="wau-legend">
        <span>
          <span className="wkpi__dot wkpi__dot--returning" /> Returning
        </span>
        <span>
          <span className="wkpi__dot wkpi__dot--new" /> New that week
        </span>
      </div>
      <div className="wau" role="img" aria-label={weeksAria(weeks)}>
        {weeks.map((w) => {
          const total = w.new + w.returning;
          const h = (total / max) * 100;
          const partial = w.daysElapsed < 7;
          return (
            <div
              className={`wau__col${partial ? " wau__col--partial" : ""}`}
              key={w.weekStart}
              title={`Week of ${w.weekStart}: ${total} devices (${w.new} new, ${w.returning} returning)${
                partial ? ` · ${w.daysElapsed} of 7 days so far` : ""
              }${w.firstTracked ? " · first tracked week: new includes devices from before tracking" : ""}`}
            >
              <span className="wau__bar" style={{ height: `${h}%` }}>
                <span className="wau__seg wau__seg--new" style={{ height: `${total ? (w.new / total) * 100 : 0}%` }} />
                <span
                  className="wau__seg wau__seg--returning"
                  style={{ height: `${total ? (w.returning / total) * 100 : 0}%` }}
                />
              </span>
              <span className="wau__num" style={{ bottom: `${h}%` }}>
                {total}
              </span>
              <span className="wau__tick">{partial ? "so far" : shortDate(w.weekStart)}</span>
            </div>
          );
        })}
      </div>
      <details className="dash-details">
        <summary>What this counts</summary>
        <p className="dash-note">
          {ACTIVE_NOTE} Weeks open on Monday, ET. A device is "new" in the week of its first round and
          "returning" in every week after, so each device is counted once per week however often it played.
          The last column is the week still running, its bar faded, with its days so far in the hover.
          {data.trackingStart &&
            ` Player tracking started ${data.trackingStart}, so the first week's "new" includes devices that had played before tracking began.`}
        </p>
      </details>
    </section>
  );
}

function weeksAria(weeks: WeeklyActive[]): string {
  return `Devices playing each week: ${weeks
    .map((w) => `week of ${w.weekStart}, ${w.new} new and ${w.returning} returning`)
    .join("; ")}.`;
}

/** Devices in the last full week before the chart's sentence is printed. */
const WEEKLY_NOTE_MIN = 10;

/**
 * The sentence over the chart: last full week against the best one, for each
 * half. Only printed with four full weeks behind it, the same caution as the
 * growth trend's minimum.
 */
function weeklyNote(full: WeeklyActive[]): string | null {
  if (full.length < 4) return null;
  const last = full.at(-1)!;
  // A sentence can't carry its denominator the way a bar can, so it waits
  // until the week it describes is more than a handful of people.
  if (last.new + last.returning < WEEKLY_NOTE_MIN) return null;
  const peakNew = full.reduce((a, b) => (b.new > a.new ? b : a));
  const peakRet = full.reduce((a, b) => (b.returning > a.returning ? b : a));
  const newPart =
    last.new < peakNew.new * 0.6
      ? `New devices are down to ${last.new} a week, from ${peakNew.new} in the week of ${shortDate(peakNew.weekStart)}`
      : `${last.new} new devices last week`;
  const retPart =
    last.returning >= peakRet.returning * 0.8
      ? `returning ones are holding at ${last.returning}`
      : `returning ones are at ${last.returning}, off a best of ${peakRet.returning}`;
  return `${newPart}; ${retPart}.`;
}

/**
 * Weekly cohorts: every row a week of first rounds, every column a later week,
 * each cell the share of that cohort that played again in it. The triangle's
 * blank edge is weeks that haven't finished, never zeros.
 */
export function CohortGrid({
  data,
  error,
  surface,
}: {
  data: AudienceReport | null;
  error: string | null;
  surface: SurfaceFilter;
}) {
  if (!data) return <Loading title="Do new players stick around?" error={error} />;
  const cohorts = data.bySurface[surface].cohorts;
  const width = Math.max(0, ...cohorts.map((c) => c.back.length));
  return (
    <section className="panel">
      <h2>Do new players stick around?</h2>
      {cohorts.length === 0 || width === 0 ? (
        <p className="dash-note">No cohort has had a full week to come back yet.</p>
      ) : (
        <>
          {cohortNote(cohorts) && <p className="retention__headline">{cohortNote(cohorts)}</p>}
          <div className="day-table-wrap">
            <table className="day-table cohort">
              <thead>
                <tr>
                  <th>First played</th>
                  <th title="Devices whose first round fell in this week">Devices</th>
                  {Array.from({ length: width }, (_, k) => (
                    <th key={k} title={`Share that played again ${k + 1} week${k === 0 ? "" : "s"} later`}>
                      +{k + 1}w
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <CohortRow key={c.weekStart} cohort={c} width={width} />
                ))}
              </tbody>
            </table>
          </div>
          <details className="dash-details">
            <summary>How to read it</summary>
            <p className="dash-note">
              Each row is the devices whose first round fell in that week (Monday start, ET). Each cell is
              the share of them that played again in the week that many weeks later, whether or not they
              also played in the weeks between. Read down a column to see whether newer players stick
              better than older ones. A blank cell is a week that hasn't finished yet, not a zero. Rows under{" "}
              {SMALL_SAMPLE_MIN} devices are set in grey: one person moves them by several points.
            </p>
          </details>
        </>
      )}
    </section>
  );
}

function CohortRow({ cohort, width }: { cohort: WeeklyCohort; width: number }) {
  const small = cohort.size < SMALL_SAMPLE_MIN;
  return (
    <tr className={small ? "cohort__row--small" : undefined}>
      <td>
        {shortDate(cohort.weekStart)}
        {cohort.firstTracked && (
          <span title="The first tracked week: it also holds devices that played before tracking began"> *</span>
        )}
      </td>
      <td>{cohort.size}</td>
      {Array.from({ length: width }, (_, k) => {
        const n = cohort.back[k];
        if (n === undefined || n === null) return <td key={k} className="cohort__cell cohort__cell--open" />;
        const p = Math.round((n / cohort.size) * 100);
        return (
          <td
            key={k}
            className="cohort__cell"
            // The same one-hue intensity as the heatmap. Zero gets no fill.
            style={p === 0 ? undefined : { background: `color-mix(in srgb, var(--teal) ${8 + p * 1.4}%, transparent)` }}
            title={`${n} of ${cohort.size} played in week +${k + 1}`}
          >
            {p}%
          </td>
        );
      })}
    </tr>
  );
}

/** Pooled week+1 return over every cohort that has one, and whether the recent half beats the early half. */
function cohortNote(cohorts: WeeklyCohort[]): string | null {
  const answered = cohorts.filter((c) => typeof c.back[0] === "number");
  const size = answered.reduce((n, c) => n + c.size, 0);
  if (answered.length < 2 || size < SMALL_SAMPLE_MIN) return null;
  const back = answered.reduce((n, c) => n + (c.back[0] as number), 0);
  const pooled = rate(back, size)!;
  return `${pooled.pct}% of new devices play again the following week, pooled over ${answered.length} cohorts and ${size} devices.`;
}

/**
 * The funnel split by whether that day was the device's first, per surface.
 * The pooled funnel mixes regulars (who nearly always guess) with first-timers
 * (who often don't), so its play rate describes neither group. Side by side
 * is what shows the web's first-visit problem.
 */
export function ArrivalSplit({ data, error }: { data: AudienceReport | null; error: string | null }) {
  const title = "First visit or coming back?";
  if (!data) return <Loading title={title} error={error} />;
  if (data.visitsSince === null) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="dash-note">Arrivals haven't been counted yet.</p>
      </section>
    );
  }
  const cols: { key: string; label: string; f: ArrivalFunnel; first: boolean }[] = [
    { key: "wf", label: "Web · first visit", f: data.bySurface.web.firstVisit, first: true },
    { key: "df", label: "Discord · first visit", f: data.bySurface.discord.firstVisit, first: true },
    { key: "wr", label: "Web · returning", f: data.bySurface.web.returning, first: false },
    { key: "dr", label: "Discord · returning", f: data.bySurface.discord.returning, first: false },
  ];
  const stages: { label: string; help: string; of: (f: ArrivalFunnel) => number }[] = [
    { label: "Made a guess", help: "Started a round the same ET day", of: (f) => f.played },
    { label: "Finished", help: "Reached game over on a round that day", of: (f) => f.finished },
    { label: "Shared", help: "Sent a result on that day", of: (f) => f.shared },
  ];
  const lines = arrivalNotes(data.bySurface);

  return (
    <section className="panel">
      <h2>{title}</h2>
      {lines.length > 0 && (
        <div className="retention__headline">
          {lines.map((l) => (
            <p key={l} style={{ margin: 0 }}>
              {l}
            </p>
          ))}
        </div>
      )}
      <div className="day-table-wrap">
        <table className="day-table arrivals">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Arrived</td>
              {cols.map((c) => (
                <td key={c.key}>{c.f.arrived}</td>
              ))}
            </tr>
            {stages.map((s) => (
              <tr key={s.label}>
                <td title={s.help}>{s.label}</td>
                {cols.map((c) => (
                  <RateCell key={c.key} n={s.of(c.f)} of={c.f.arrived} />
                ))}
              </tr>
            ))}
            <tr>
              <td title="Played or opened the game again within 7 days, counted only once those 7 days are up">
                Back within 7 days
              </td>
              {cols.map((c) =>
                c.first ? (
                  <RateCell key={c.key} n={backOf(c.f).returned} of={backOf(c.f).atRisk} />
                ) : (
                  <td key={c.key} className="arrivals__na" title="Returning arrivals are the repeat-visit ladder's job">
                    see below
                  </td>
                ),
              )}
            </tr>
          </tbody>
        </table>
      </div>
      <details className="dash-details">
        <summary>What this counts</summary>
        <p className="dash-note">
          Device-days since {shortDate(data.visitsSince)}, when arrivals started being counted. A first visit is
          the first day a device ever showed up, whether it opened the board or played. Each percentage is of
          that column's arrivals, and thin ones carry their range. "Back within 7 days" only counts arrivals
          whose 7 days are up. Arrival counts are one per device per day, so a regular who came on ten days
          is ten returning arrivals.
        </p>
      </details>
    </section>
  );
}

const backOf = (f: ArrivalFunnel): CameBack => {
  const a = f.cameBack.ifPlayed;
  const b = f.cameBack.ifBounced;
  return { returned: a.returned + b.returned, atRisk: a.atRisk + b.atRisk, pending: a.pending + b.pending };
};

function RateCell({ n, of }: { n: number; of: number }) {
  const r = rate(n, of);
  if (r === null) return <td className="arrivals__na">—</td>;
  const range = rangeLabel(r);
  return (
    <td title={`${n} of ${of}`}>
      <span className="arrivals__bar" style={{ width: `${r.pct}%` }} />
      <span className="arrivals__pct">{r.pct}%</span>
      {range && <span className="rate-range"> {range}</span>}
    </td>
  );
}

/**
 * The sentences over the table. Each is only said when the two rates it
 * compares are separated, the same test the dish report uses.
 */
function arrivalNotes(by: AudienceReport["bySurface"]): string[] {
  const out: string[] = [];
  const webPlay = rate(by.web.firstVisit.played, by.web.firstVisit.arrived);
  const discPlay = rate(by.discord.firstVisit.played, by.discord.firstVisit.arrived);
  if (webPlay && discPlay && separated(webPlay, discPlay)) {
    out.push(
      `${webPlay.pct}% of first-time web arrivals make a guess, against ${discPlay.pct}% on Discord.`,
    );
  }
  const played = by.all.firstVisit.cameBack.ifPlayed;
  const bounced = by.all.firstVisit.cameBack.ifBounced;
  const a = rate(played.returned, played.atRisk);
  const b = rate(bounced.returned, bounced.atRisk);
  if (a && b && separated(a, b)) {
    out.push(
      `First-timers who guessed came back within a week ${a.pct}% of the time; those who didn't, ${b.pct}%. That's a correlation, not proof a guess causes the return.`,
    );
  }
  return out;
}
