// /api/admin/experiments: the change log and its before/after verdicts.

import { Hono } from "hono";
import type { Experiment, ExperimentInput, ExperimentMetric, ExperimentReport } from "../../../shared/types";
import { EXPERIMENT_LIMITS, EXPERIMENT_METRICS } from "../../../shared/types";

import { foldExperimentSeries, type ExperimentHourRow } from "../../experiments";

import { serverToday } from "../../db";

import { isValidDateString } from "../../game";
import { etDayOfUtcStamp, foldPlayerActivity, type PlayerBucketRow } from "../../players";

import { surfaceClause } from "./shared";

const app = new Hono<{ Bindings: Env }>();

// ---- Experiments: did the thing I shipped do anything? ----
//
// Every other endpoint here answers "what is happening". This one exists to
// answer "did my change work", which needs two things nothing else provided: a
// record of when changes went live (the `experiments` table, migrations/0019),
// and a daily series long enough to look at both sides of one.
//
// The series is **all-time and raw**, and both halves of that are deliberate.
// All-time because `daily` stops ~5 weeks back and an experiment from two months
// ago is exactly the one worth re-reading; raw counts because a rate has to be
// pooled over a whole period, and a pre-divided daily percentage can't be
// re-pooled over a different window. Shipping the whole series once lets the tab
// re-window and re-metric every experiment with no further requests.
//
// Path note: "/experiments" is not on the blocker-bait list (analytics, event,
// track, collect, beacon, telemetry, pixel) that forced /recent-rounds and
// /dish-report to be renamed, and an admin fetch fails loudly anyway — src/admin/
// api.ts turns a cancelled request into an explicit ad-blocker message.

function parseExperiment(body: unknown): { input: ExperimentInput } | { error: string } {
  const b = body as Partial<ExperimentInput> | null;
  if (!b || typeof b !== "object") return { error: "Invalid body" };
  const label = typeof b.label === "string" ? b.label.trim() : "";
  if (!label) return { error: "Give the change a name" };
  if (label.length > EXPERIMENT_LIMITS.label) {
    return { error: `Name must be ${EXPERIMENT_LIMITS.label} characters or fewer` };
  }
  const hypothesis = typeof b.hypothesis === "string" ? b.hypothesis.trim() : "";
  if (hypothesis.length > EXPERIMENT_LIMITS.hypothesis) {
    return { error: `Hypothesis must be ${EXPERIMENT_LIMITS.hypothesis} characters or fewer` };
  }
  if (!EXPERIMENT_METRICS.includes(b.metric as never)) return { error: "Pick a metric to watch" };
  if (typeof b.shippedOn !== "string" || !isValidDateString(b.shippedOn)) {
    return { error: "Ship date must be a real YYYY-MM-DD day" };
  }
  return { input: { label, hypothesis, metric: b.metric as ExperimentMetric, shippedOn: b.shippedOn } };
}

app.get("/experiments", async (c) => {
  const { and: surfAnd, where: surfWhere } = surfaceClause(c);
  const today = serverToday();
  const [rowsRes, hourRes, playerRes, trackingRes, visitRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id, label, hypothesis, metric, shipped_on, created_at
         FROM experiments ORDER BY shipped_on DESC, id DESC`,
    ),
    // Same all-time UTC hour buckets the growth curve and rhythm grid read, but
    // carrying the outcome sums too — a rate metric needs its denominator.
    c.env.DB.prepare(
      `SELECT strftime('%Y-%m-%d %H', started_at) AS bucket,
         COUNT(*) AS started,
         COALESCE(SUM(completed), 0) AS completed,
         COALESCE(SUM(solved), 0) AS solved,
         COALESCE(SUM(shared), 0) AS shared
         FROM analytics_rounds WHERE started_at IS NOT NULL${surfAnd}
         GROUP BY bucket`,
    ),
    c.env.DB.prepare(
      `SELECT player_id, strftime('%Y-%m-%d %H', started_at) AS bucket
         FROM analytics_rounds
         WHERE player_id IS NOT NULL AND started_at IS NOT NULL${surfAnd}
         GROUP BY player_id, bucket`,
    ),
    c.env.DB.prepare(
      `SELECT MIN(started_at) AS first_tracked FROM analytics_rounds
         WHERE player_id IS NOT NULL AND started_at IS NOT NULL`,
    ),
    // visit_day is already an ET day, stamped by the beacon handler.
    c.env.DB.prepare(`SELECT visit_day, COUNT(*) AS n FROM analytics_visits${surfWhere} GROUP BY visit_day`),
  ]);

  const activity = foldPlayerActivity(playerRes.results as PlayerBucketRow[]);
  const firstTracked = (trackingRes.results[0] as { first_tracked: string | null } | undefined)?.first_tracked;
  const trackingStart = firstTracked ? etDayOfUtcStamp(firstTracked) : null;
  const visitsByDay = new Map<string, number>();
  for (const r of visitRes.results as { visit_day: string; n: number }[]) visitsByDay.set(r.visit_day, r.n);
  const visitsSince = [...visitsByDay.keys()].sort()[0] ?? null;

  const experiments: Experiment[] = (
    rowsRes.results as {
      id: number;
      label: string;
      hypothesis: string;
      metric: string;
      shipped_on: string;
      created_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    label: r.label,
    hypothesis: r.hypothesis,
    metric: r.metric as ExperimentMetric,
    shippedOn: r.shipped_on,
    createdAt: r.created_at,
  }));

  const report: ExperimentReport = {
    experiments,
    series: foldExperimentSeries(
      hourRes.results as ExperimentHourRow[],
      today,
      activity,
      trackingStart,
      visitsByDay,
      visitsSince,
    ),
  };
  return c.json(report);
});

app.post("/experiments", async (c) => {
  const parsed = parseExperiment(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const e = parsed.input;
  const res = await c.env.DB.prepare(
    `INSERT INTO experiments (label, hypothesis, metric, shipped_on, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
  )
    .bind(e.label, e.hypothesis, e.metric, e.shippedOn)
    .run();
  return c.json({ id: res.meta.last_row_id });
});

app.put("/experiments/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Change not found" }, 404);
  const parsed = parseExperiment(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const e = parsed.input;
  const res = await c.env.DB.prepare(
    `UPDATE experiments SET label = ?, hypothesis = ?, metric = ?, shipped_on = ?, updated_at = datetime('now')
      WHERE id = ?`,
  )
    .bind(e.label, e.hypothesis, e.metric, e.shippedOn, id)
    .run();
  if (res.meta.changes === 0) return c.json({ error: "Change not found" }, 404);
  return c.json({ id });
});

app.delete("/experiments/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Change not found" }, 404);
  const res = await c.env.DB.prepare("DELETE FROM experiments WHERE id = ?").bind(id).run();
  if (res.meta.changes === 0) return c.json({ error: "Change not found" }, 404);
  return c.json({ ok: true });
});

// Activity feed (GitHub #47): the aggregates above tell you *how much* changed,
// this tells you *what just happened*.
//
// It used to return **events** — `analytics_rounds` is one row per round, and a
// UNION un-flattened each into up to three rows so the UI could be a
// chronological log. That cost more than it bought. The reader had to
// re-assemble every game by eye; `LIMIT` sat *inside* the union, so a page
// boundary could cut a round's trio in half and hand back a share whose start had
// fallen off the bottom; and the two timestamps that give a round its duration
// were never in the same row. So it returns rounds — the table's own unit, and
// the unit every question about this feed is actually asked in — and the panel
// draws the three beacons as an arc on one line, expandable to their times.
//
// Alongside them come the **arrivals** (`analytics_visits`), which have never
// appeared here at all. That absence is what made a bounce invisible everywhere
// except as a funnel percentage: opening the game and never guessing writes a
// visit row and nothing else. In the feed a visit is the group header, so the two
// tables meet instead of running as two logs side by side.
//
// The path deliberately avoids "analytics/events" — ad blockers ship filter rules
// for that shape (it's what tracking beacons look like), and they killed the
// request in-browser before it ever reached the Worker.

/** The columns one round needs, before the dish-name join wraps them. */

export default app;
