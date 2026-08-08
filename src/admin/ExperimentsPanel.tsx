import { useMemo, useState } from "react";
import type {
  Experiment,
  ExperimentDay,
  ExperimentInput,
  ExperimentMetric,
  ExperimentReport,
} from "../../shared/types";
import { EXPERIMENT_LIMITS, EXPERIMENT_METRICS, RATE_METRICS } from "../../shared/types";
import {
  compare,
  DEFAULT_WINDOW_DAYS,
  TARGET_LIFT,
  WINDOW_CHOICES,
  type Comparison,
  type Side,
} from "../../shared/experiment";
import { rangeLabel } from "../../shared/sample";
import { gameToday } from "../../shared/time";
import * as api from "./api";
import { SAMPLE_NOTE, shortDate } from "./analyticsUi";

/**
 * The tab the rest of the dashboard exists to serve.
 *
 * Every other panel answers "what is happening". This one answers "did the thing
 * I shipped do anything", which is the question the game is actually run on —
 * form a hypothesis, ship a change, read the numbers — and which nothing here
 * could answer before, because nothing recorded when changes happened.
 *
 * The design constraint is that at tens of rounds a day, the honest answer is
 * usually **"not yet"**. A dashboard that can't say that will instead show a
 * number that went up, and its owner will ship on it. So "inconclusive" is a
 * first-class verdict here, it comes with how many more days would settle it, and
 * the noise a difference has to beat is printed next to the difference.
 */

export const METRIC_META: Record<ExperimentMetric, { label: string; hint: string; unit: string }> = {
  visitors: { label: "Visitors", hint: "Devices that opened a board per day", unit: "a day" },
  started: { label: "Games started", hint: "Rounds begun per day, every mode", unit: "a day" },
  playRate: { label: "Play rate", hint: "Share of the devices that opened a board which then played", unit: "" },
  players: { label: "Players", hint: "Distinct devices playing per day", unit: "a day" },
  newPlayers: { label: "New players", hint: "Devices whose first-ever play was that day", unit: "a day" },
  finishRate: { label: "Finish rate", hint: "Share of started rounds that reached game over", unit: "" },
  winRate: { label: "Win rate", hint: "Share of finished rounds that were won", unit: "" },
  shareRate: { label: "Share rate", hint: "Share of finishers who sent their result on", unit: "" },
};

const VERDICT_META: Record<Comparison["verdict"], { label: string; cls: string }> = {
  "moved-up": { label: "▲ Moved up", cls: "up" },
  "moved-down": { label: "▼ Moved down", cls: "down" },
  "no-change": { label: "No detectable change", cls: "flat" },
  inconclusive: { label: "Too early to tell", cls: "wait" },
};

/** A side's headline value, in the unit its metric is measured in. */
function valueLabel(side: Side, isRate: boolean): string {
  if (side.value === null) return "—";
  return isRate ? `${side.value}%` : side.value.toFixed(1);
}

/**
 * The sentence under the verdict — what actually happened, in the terms that
 * make it judgeable.
 *
 * For a count it names the day-to-day swing, because that's the bar the
 * difference had to clear. For a rate it names the denominator, because that's
 * what a percentage means nothing without.
 */
function evidence(c: Comparison): string {
  const m = METRIC_META[c.metric];
  if (c.before.value === null || c.after.value === null) {
    const side = c.before.value === null ? "before" : "after";
    return `Not enough data ${side} the change to compare against — ${
      side === "before" ? "this shipped too close to the start of the record" : "give it a few more days"
    }.`;
  }
  if (c.isRate) {
    return `${valueLabel(c.before, true)} of ${c.before.n} → ${valueLabel(c.after, true)} of ${c.after.n}. A percentage off ${c.after.n} round${c.after.n === 1 ? "" : "s"} is only as firm as that number.`;
  }
  const swing = c.before.sd ?? 0;
  return `${valueLabel(c.before, false)} ${m.unit} over ${c.before.days} day${
    c.before.days === 1 ? "" : "s"
  } → ${valueLabel(c.after, false)} ${m.unit} over ${c.after.days}. Day to day this metric swings about ±${swing.toFixed(1)} on its own.`;
}

/** How the verdict should be acted on, which is not the same as what it says. */
function advice(c: Comparison): string | null {
  if (c.verdict === "moved-up" || c.verdict === "moved-down") {
    return "The gap is bigger than this metric's own noise over these windows. That's as close to a result as this volume gets — worth keeping.";
  }
  if (c.daysNeeded === null) {
    return c.verdict === "inconclusive"
      ? "Nothing to project from yet — there'll be a estimate here once both sides have a few days."
      : null;
  }
  if (c.daysNeeded === 0) {
    return `There's enough data now to have caught a ${Math.round(TARGET_LIFT * 100)}% change, and none showed. A smaller effect is still possible — this rules out a big one, not any one.`;
  }
  return `At this traffic, spotting a ${Math.round(
    TARGET_LIFT * 100,
  )}% change would take about ${c.daysNeeded} more day${c.daysNeeded === 1 ? "" : "s"}. Until then the honest answer is "don't know" — not "it didn't work".`;
}

/**
 * The before/after strip: one bar per day, split at the ship date.
 *
 * Deliberately the raw daily values rather than the two aggregates the verdict is
 * computed from. The aggregates are two numbers and can't show you that the
 * "after" is one enormous day and six dead ones, which is the single most common
 * way a promising average turns out to be a link getting shared once.
 */
function BeforeAfter({
  series,
  shippedOn,
  metric,
  windowDays,
  today,
}: {
  series: ExperimentDay[];
  shippedOn: string;
  metric: ExperimentMetric;
  windowDays: number;
  today: string;
}) {
  const dayValue = (d: ExperimentDay): number | null => {
    switch (metric) {
      case "started":
        return d.started;
      case "visitors":
        return d.visitors;
      case "players":
        return d.players;
      case "newPlayers":
        return d.newPlayers;
      case "playRate":
        // Devices over devices — see ratioOf() in shared/experiment.ts.
        return d.visitors === null || d.visitors === 0 || d.players === null
          ? null
          : (d.players / d.visitors) * 100;
      case "finishRate":
        return d.started === 0 ? null : (d.completed / d.started) * 100;
      case "winRate":
        return d.completed === 0 ? null : (d.solved / d.completed) * 100;
      default:
        return d.completed === 0 ? null : (d.shared / d.completed) * 100;
    }
  };
  const ms = (s: string) => Date.parse(`${s}T00:00:00Z`);
  const shown = series.filter((d) => {
    const gap = Math.round((ms(d.date) - ms(shippedOn)) / 86_400_000);
    return d.date <= today && gap >= -windowDays && gap < windowDays;
  });
  if (shown.length === 0) return null;
  const max = Math.max(1, ...shown.map((d) => dayValue(d) ?? 0));

  return (
    <div className="ba">
      {shown.map((d) => {
        const v = dayValue(d);
        const after = d.date >= shippedOn;
        return (
          <div
            className={`ba__col${after ? " ba__col--after" : ""}${d.date === shippedOn ? " ba__col--ship" : ""}`}
            key={d.date}
            title={`${d.date} · ${v === null ? "not measured" : Math.round(v)}${
              RATE_METRICS.includes(metric) ? "%" : ""
            }${after ? " (after)" : " (before)"}`}
          >
            <span
              className={`ba__bar${v === null ? " ba__bar--none" : ""}`}
              style={{ height: `${v === null ? 0 : Math.max(2, (v / max) * 100)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** One experiment, with its read. */
function ExperimentCard({
  experiment,
  series,
  today,
  onEdit,
  onDelete,
}: {
  experiment: Experiment;
  series: ExperimentDay[];
  today: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Each card keeps its own metric and window, so you can interrogate one change
  // from several angles without disturbing the others.
  const [metric, setMetric] = useState<ExperimentMetric>(experiment.metric);
  const [windowDays, setWindowDays] = useState<number>(DEFAULT_WINDOW_DAYS);
  const c = useMemo(
    () => compare(metric, series, experiment.shippedOn, windowDays, today),
    [metric, series, experiment.shippedOn, windowDays, today],
  );
  const verdict = VERDICT_META[c.verdict];
  const note = advice(c);
  // Only the metric the change was *declared* against is the real test; anything
  // else is a second look, and second looks are how you find a wiggle to believe.
  const offPlan = metric !== experiment.metric;

  return (
    <section className="panel xp">
      <div className="analytics-head">
        <h2>
          {experiment.label}
          <span className="dash-count">shipped {shortDate(experiment.shippedOn)}</span>
        </h2>
        <div className="analytics-head__tools">
          <button className="btn btn--ghost btn--small" onClick={onEdit}>
            Edit
          </button>
          <button className="btn btn--ghost btn--small" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {experiment.hypothesis && <p className="xp__hypothesis">{experiment.hypothesis}</p>}

      <div className="xp__controls">
        <label className="xp__control">
          <span>Metric</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value as ExperimentMetric)}>
            {EXPERIMENT_METRICS.map((m) => (
              <option key={m} value={m}>
                {METRIC_META[m].label}
                {m === experiment.metric ? " ★" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="xp__control">
          <span>Window</span>
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
            {WINDOW_CHOICES.map((w) => (
              <option key={w} value={w}>
                ±{w} days
              </option>
            ))}
          </select>
        </label>
      </div>

      {offPlan && (
        <p className="xp__offplan">
          This change was declared against <strong>{METRIC_META[experiment.metric].label}</strong>. Reading a
          different metric is fine for a look around, but a result you went hunting for isn't the same kind of
          evidence as the one you predicted.
        </p>
      )}

      <div className={`xp__verdict xp__verdict--${verdict.cls}`}>
        <strong>{verdict.label}</strong>
        {c.relative !== null && (
          <span className="xp__delta">
            {c.relative > 0 ? "+" : ""}
            {Math.round(c.relative * 100)}%
          </span>
        )}
        <span className="xp__metric">{METRIC_META[metric].label}</span>
      </div>

      <div className="xp__sides">
        <div className="xp__side">
          <span className="xp__side-num">{valueLabel(c.before, c.isRate)}</span>
          <span className="xp__side-label">Before</span>
          {c.isRate && rangeLabel(c.before.rate) && (
            <span className="rate-range" title={SAMPLE_NOTE}>
              {rangeLabel(c.before.rate)}
            </span>
          )}
        </div>
        <span className="xp__arrow" aria-hidden="true">
          →
        </span>
        <div className="xp__side">
          <span className="xp__side-num">{valueLabel(c.after, c.isRate)}</span>
          <span className="xp__side-label">After</span>
          {c.isRate && rangeLabel(c.after.rate) && (
            <span className="rate-range" title={SAMPLE_NOTE}>
              {rangeLabel(c.after.rate)}
            </span>
          )}
        </div>
        <BeforeAfter
          series={series}
          shippedOn={experiment.shippedOn}
          metric={metric}
          windowDays={windowDays}
          today={today}
        />
      </div>

      <p className="dash-note">{evidence(c)}</p>
      {note && <p className="xp__advice">{note}</p>}
    </section>
  );
}

/** The add/edit form. Small enough to be inline; there are only four fields. */
function ExperimentForm({
  initial,
  today,
  onSave,
  onCancel,
  error,
}: {
  initial: Experiment | null;
  today: string;
  onSave: (input: ExperimentInput) => void;
  onCancel: () => void;
  error: string | null;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [hypothesis, setHypothesis] = useState(initial?.hypothesis ?? "");
  const [metric, setMetric] = useState<ExperimentMetric>(initial?.metric ?? "started");
  const [shippedOn, setShippedOn] = useState(initial?.shippedOn ?? today);

  return (
    <section className="panel">
      <h2>{initial ? "Edit change" : "Log a change"}</h2>
      <form
        className="xp__form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ label: label.trim(), hypothesis: hypothesis.trim(), metric, shippedOn });
        }}
      >
        <label className="field">
          <span>What changed</span>
          <input
            value={label}
            maxLength={EXPERIMENT_LIMITS.label}
            placeholder="Softened clue 3 on hard dishes"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Shipped on</span>
          <input type="date" value={shippedOn} max={today} onChange={(e) => setShippedOn(e.target.value)} />
        </label>
        <label className="field">
          <span>Metric to watch</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value as ExperimentMetric)}>
            {EXPERIMENT_METRICS.map((m) => (
              <option key={m} value={m}>
                {METRIC_META[m].label} — {METRIC_META[m].hint}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Hypothesis</span>
          <textarea
            value={hypothesis}
            rows={3}
            maxLength={EXPERIMENT_LIMITS.hypothesis}
            placeholder="Players were bouncing off the 4th guess — an easier third clue should lift the finish rate."
            onChange={(e) => setHypothesis(e.target.value)}
          />
        </label>
        {/* Naming the metric before you look is the whole discipline: pick it
            afterwards and you'll pick whichever one happened to wiggle. */}
        <p className="dash-note">
          Pick the metric <em>before</em> you look at it. Choosing afterwards means choosing whichever number
          happened to move, and there are six of them — one of them always will have.
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="btn-row">
          <button className="btn" type="submit">
            {initial ? "Save" : "Log it"}
          </button>
          <button className="btn btn--ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

/**
 * The report is fetched by Dashboard rather than here, because the Trends tab
 * needs the same experiment list for its chart markers and one all-time query is
 * enough for both.
 */
export default function ExperimentsPanel({
  report,
  error: loadError,
  onChanged,
}: {
  report: ExperimentReport | null;
  error: string | null;
  /** Re-fetch after a write — the series doesn't change, but the log does. */
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Experiment | null>(null);
  const [adding, setAdding] = useState(false);
  const today = gameToday();

  const experiments = report?.experiments ?? null;
  const series = report?.series ?? [];

  const save = async (input: ExperimentInput) => {
    setFormError(null);
    try {
      if (editing) await api.updateExperiment(editing.id, input);
      else await api.createExperiment(input);
      setEditing(null);
      setAdding(false);
      onChanged();
    } catch (e) {
      setFormError((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.deleteExperiment(id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loadError ?? error) {
    return (
      <section className="panel">
        <h2>Experiments</h2>
        <p className="dash-note">Couldn't load the change log: {loadError ?? error}</p>
      </section>
    );
  }
  if (!experiments) {
    return (
      <section className="panel">
        <h2>Experiments</h2>
        <p className="dash-note">Reading the kitchen notes…</p>
      </section>
    );
  }

  const showForm = adding || editing !== null;

  return (
    <>
      <section className="panel">
        <div className="analytics-head">
          <h2>Experiments</h2>
          {!showForm && (
            <button
              className="btn"
              onClick={() => {
                setFormError(null);
                setAdding(true);
              }}
            >
              Log a change
            </button>
          )}
        </div>
        <p className="dash-note">
          Every other tab says what's happening. This one says whether something you did caused it — which
          needs a record of when you did it, and the patience to wait for enough data to tell. At this
          traffic that's usually a couple of weeks, so “too early to tell” is the normal answer and not a
          failure. Each change is measured against the metric you named when you logged it.
        </p>
      </section>

      {showForm && (
        <ExperimentForm
          initial={editing}
          today={today}
          error={formError}
          onSave={save}
          onCancel={() => {
            setEditing(null);
            setAdding(false);
            setFormError(null);
          }}
        />
      )}

      {experiments.length === 0 && !showForm && (
        <section className="panel">
          <p className="dash-note">
            Nothing logged yet. Next time you change something — a clue rewrite, a new mode, an
            announcement, a schedule shake-up — log it here with the metric you expect it to move, and the
            before/after will be waiting.
          </p>
        </section>
      )}

      {experiments.map((x) => (
        <ExperimentCard
          key={x.id}
          experiment={x}
          series={series}
          today={today}
          onEdit={() => {
            setFormError(null);
            setAdding(false);
            setEditing(x);
          }}
          onDelete={() => remove(x.id)}
        />
      ))}
    </>
  );
}
