import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type {
  AdminDashboard,
  AdminDishDetail,
  AdminDishInput,
  AdminDishRow,
  AnalyticsDay,
  AnalyticsPeriod,
  AnalyticsSummary,
  DishRequest,
  PlayerSplit,
  RoundKind,
  ScheduleEntry,
  StartedByKind,
  Surface,
} from "../../shared/types";
import { COURSES, MAX_GUESSES, PROTEINS, REGIONS, SURFACES, TEMPERATURES } from "../../shared/types";
import {
  createToken,
  passwordMatches,
  PREVIEW_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  verifyToken,
} from "../auth";
import { rowToDish, serverToday, type DishDbRow } from "../db";
import { isValidDateString } from "../game";
import { gameHour, gameToday, msUntilGameMidnight } from "../../shared/time";

const app = new Hono<{ Bindings: Env }>();

async function isLoggedIn(c: Context, secret: string) {
  const cookie = getCookie(c, SESSION_COOKIE);
  if (!cookie) return false;
  return (await verifyToken(cookie, secret)) === "session";
}

app.post("/login", async (c) => {
  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.password || !(await passwordMatches(body.password, c.env.ADMIN_PASSWORD))) {
    return c.json({ error: "Wrong password" }, 401);
  }
  const token = await createToken("session", SESSION_TTL_MS, c.env.SESSION_SECRET);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return c.json({ ok: true });
});

app.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/session", async (c) => {
  return c.json({ loggedIn: await isLoggedIn(c, c.env.SESSION_SECRET) });
});

// Everything below requires a valid session.
app.use("*", async (c, next) => {
  if (!(await isLoggedIn(c, c.env.SESSION_SECRET))) {
    return c.json({ error: "Not logged in" }, 401);
  }
  await next();
});

interface AdminDishDbRow extends DishDbRow {
  clue_count: number;
  last_served: string | null;
}

function toAdminRow(row: AdminDishDbRow): AdminDishRow {
  const dish = rowToDish(row);
  return {
    ...dish,
    clueCount: row.clue_count,
    lastServed: row.last_served,
    schedulable: dish.ingredients.length >= 3 && row.clue_count === 5,
  };
}

app.get("/dishes", async (c) => {
  const res = await c.env.DB
    .prepare(
      `SELECT d.*,
         (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count,
         (SELECT MAX(s.date) FROM schedule s WHERE s.dish_id = d.id AND s.date <= ?) AS last_served
       FROM dishes d ORDER BY d.name`,
    )
    .bind(serverToday())
    .all<AdminDishDbRow>();
  return c.json(res.results.map(toAdminRow));
});

app.get("/dishes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [dishRes, cluesRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT * FROM dishes WHERE id = ?").bind(id),
    c.env.DB.prepare("SELECT text FROM clues WHERE dish_id = ? ORDER BY order_index").bind(id),
  ]);
  const row = dishRes.results[0] as DishDbRow | undefined;
  if (!row) return c.json({ error: "Dish not found" }, 404);
  const clues = (cluesRes.results as { text: string }[]).map((r) => r.text);
  const detail: AdminDishDetail = { ...rowToDish(row), clues };
  return c.json(detail);
});

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateDishInput(body: unknown): { dish: AdminDishInput } | { error: string } {
  const b = body as Partial<AdminDishInput>;
  if (!b || typeof b.name !== "string" || !b.name.trim()) return { error: "Name is required" };
  if (typeof b.country !== "string" || !b.country.trim()) return { error: "Country is required" };
  if (!REGIONS.includes(b.region as never)) return { error: "Invalid region" };
  if (!COURSES.includes(b.course as never)) return { error: "Invalid course" };
  if (!TEMPERATURES.includes(b.temperature as never)) return { error: "Invalid temperature" };
  if (!PROTEINS.includes(b.protein as never)) return { error: "Invalid protein" };
  if (!Array.isArray(b.ingredients) || b.ingredients.some((i) => typeof i !== "string")) {
    return { error: "Ingredients must be a list of strings" };
  }
  if (!Array.isArray(b.clues) || b.clues.length > 5 || b.clues.some((t) => typeof t !== "string")) {
    return { error: "Clues must be a list of up to 5 strings" };
  }
  const ingredients = [...new Set(b.ingredients.map((i) => i.trim().toLowerCase()).filter(Boolean))];
  const clues = b.clues.map((t) => t.trim()).filter(Boolean);
  return {
    dish: {
      name: b.name.trim(),
      country: b.country.trim(),
      region: b.region!,
      course: b.course!,
      temperature: b.temperature!,
      protein: b.protein!,
      ingredients,
      isActive: b.isActive !== false,
      clues,
    },
  };
}

async function replaceClues(db: D1Database, dishId: number, clues: string[]) {
  const statements = [db.prepare("DELETE FROM clues WHERE dish_id = ?").bind(dishId)];
  clues.forEach((text, i) => {
    statements.push(
      db.prepare("INSERT INTO clues (dish_id, order_index, text) VALUES (?, ?, ?)").bind(dishId, i + 1, text),
    );
  });
  await db.batch(statements);
}

app.post("/dishes", async (c) => {
  const parsed = validateDishInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const d = parsed.dish;
  try {
    const res = await c.env.DB
      .prepare(
        `INSERT INTO dishes (name, slug, country, region, course, temperature, protein, ingredients, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(
        d.name,
        slugify(d.name),
        d.country,
        d.region,
        d.course,
        d.temperature,
        d.protein,
        JSON.stringify(d.ingredients),
        d.isActive ? 1 : 0,
      )
      .first<{ id: number }>();
    await replaceClues(c.env.DB, res!.id, d.clues);
    return c.json({ id: res!.id });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes("UNIQUE") ? "A dish with that name already exists" : "Save failed";
    return c.json({ error: msg }, 400);
  }
});

app.put("/dishes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = validateDishInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const d = parsed.dish;
  try {
    const res = await c.env.DB
      .prepare(
        `UPDATE dishes SET name = ?, slug = ?, country = ?, region = ?, course = ?, temperature = ?,
           protein = ?, ingredients = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(
        d.name,
        slugify(d.name),
        d.country,
        d.region,
        d.course,
        d.temperature,
        d.protein,
        JSON.stringify(d.ingredients),
        d.isActive ? 1 : 0,
        id,
      )
      .run();
    if (res.meta.changes === 0) return c.json({ error: "Dish not found" }, 404);
    await replaceClues(c.env.DB, id, d.clues);
    return c.json({ id });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes("UNIQUE") ? "A dish with that name already exists" : "Save failed";
    return c.json({ error: msg }, 400);
  }
});

app.delete("/dishes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const future = await c.env.DB
    .prepare("SELECT date FROM schedule WHERE dish_id = ? AND date >= ? LIMIT 1")
    .bind(id, serverToday())
    .first<{ date: string }>();
  if (future) {
    return c.json({ error: `Dish is scheduled for ${future.date} — unschedule it first` }, 409);
  }
  const [, dishRes] = await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM clues WHERE dish_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM dishes WHERE id = ?").bind(id),
  ]);
  if (dishRes.meta.changes === 0) return c.json({ error: "Dish not found" }, 404);
  return c.json({ ok: true });
});

// Canonical ingredient vocabulary for the tag-input autocomplete.
app.get("/ingredients", async (c) => {
  const res = await c.env.DB.prepare("SELECT ingredients FROM dishes").all<{ ingredients: string }>();
  const all = new Set<string>();
  for (const row of res.results) {
    for (const ing of JSON.parse(row.ingredients) as string[]) all.add(ing);
  }
  return c.json([...all].sort());
});

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

app.get("/schedule", async (c) => {
  const today = serverToday();
  const from = c.req.query("from") ?? addDays(today, -7);
  const to = c.req.query("to") ?? addDays(today, 45);
  if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
    return c.json({ error: "Invalid date range" }, 400);
  }
  const res = await c.env.DB
    .prepare(
      `SELECT s.date, s.dish_id, d.name FROM schedule s JOIN dishes d ON d.id = s.dish_id
       WHERE s.date BETWEEN ? AND ? ORDER BY s.date`,
    )
    .bind(from, to)
    .all<{ date: string; dish_id: number; name: string }>();
  const byDate = new Map(res.results.map((r) => [r.date, r]));
  const entries: ScheduleEntry[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = byDate.get(d);
    entries.push({ date: d, dishId: row?.dish_id ?? null, dishName: row?.name ?? null });
  }
  return c.json(entries);
});

app.put("/schedule", async (c) => {
  let body: { date?: string; dishId?: number | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const today = serverToday();
  if (!body.date || !isValidDateString(body.date)) return c.json({ error: "Invalid date" }, 400);
  if (body.date < today) return c.json({ error: "Past days are locked" }, 400);
  if (body.dishId == null) {
    await c.env.DB.prepare("DELETE FROM schedule WHERE date = ?").bind(body.date).run();
    return c.json({ ok: true });
  }
  const dish = await c.env.DB
    .prepare(
      `SELECT d.id, d.ingredients, (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count
       FROM dishes d WHERE d.id = ?`,
    )
    .bind(body.dishId)
    .first<{ id: number; ingredients: string; clue_count: number }>();
  if (!dish) return c.json({ error: "Dish not found" }, 404);
  if ((JSON.parse(dish.ingredients) as string[]).length < 3 || dish.clue_count !== 5) {
    return c.json({ error: "Dish needs at least 3 ingredients and exactly 5 clues before scheduling" }, 400);
  }
  await c.env.DB
    .prepare("INSERT INTO schedule (date, dish_id) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET dish_id = excluded.dish_id")
    .bind(body.date, body.dishId)
    .run();
  return c.json({ ok: true });
});

// Fill empty days in the next 30 with least-recently-served complete dishes,
// avoiding any dish served or scheduled within 60 days.
app.post("/schedule/autofill", async (c) => {
  const today = serverToday();
  const windowEnd = addDays(today, 29);
  const blockStart = addDays(today, -60);

  const scheduled = await c.env.DB
    .prepare("SELECT date, dish_id FROM schedule WHERE date >= ?")
    .bind(blockStart)
    .all<{ date: string; dish_id: number }>();
  const takenDates = new Set(scheduled.results.filter((r) => r.date >= today).map((r) => r.date));
  const recentlyUsed = new Set(scheduled.results.map((r) => r.dish_id));

  const dishes = await c.env.DB
    .prepare(
      `SELECT d.id, d.ingredients,
         (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count,
         (SELECT MAX(s.date) FROM schedule s WHERE s.dish_id = d.id AND s.date < ?) AS last_served
       FROM dishes d WHERE d.is_active = 1`,
    )
    .bind(today)
    .all<{ id: number; ingredients: string; clue_count: number; last_served: string | null }>();

  const eligible = dishes.results
    .filter(
      (d) =>
        d.clue_count === 5 &&
        (JSON.parse(d.ingredients) as string[]).length >= 3 &&
        !recentlyUsed.has(d.id),
    )
    // Never-served first, then least recently served.
    .sort((a, b) => (a.last_served ?? "").localeCompare(b.last_served ?? ""));

  const statements = [];
  let filled = 0;
  for (let d = today; d <= windowEnd && filled < eligible.length; d = addDays(d, 1)) {
    if (takenDates.has(d)) continue;
    statements.push(
      c.env.DB.prepare("INSERT INTO schedule (date, dish_id) VALUES (?, ?)").bind(d, eligible[filled].id),
    );
    filled++;
  }
  if (statements.length > 0) await c.env.DB.batch(statements);
  return c.json({ filled: statements.length });
});

app.post("/preview", async (c) => {
  let body: { dishId?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const dish = await c.env.DB.prepare("SELECT id FROM dishes WHERE id = ?").bind(Number(body.dishId)).first();
  if (!dish) return c.json({ error: "Dish not found" }, 404);
  const token = await createToken(`preview:${body.dishId}`, PREVIEW_TTL_MS, c.env.SESSION_SECRET);
  return c.json({ token, url: `/?preview=${encodeURIComponent(token)}` });
});

// ---- Player dish requests (review inbox) ----

interface DishRequestDbRow {
  id: number;
  name: string;
  country: string | null;
  note: string | null;
  surface: string;
  created_at: string;
}

app.get("/requests", async (c) => {
  const res = await c.env.DB
    .prepare("SELECT id, name, country, note, surface, created_at FROM dish_requests ORDER BY created_at DESC, id DESC")
    .all<DishRequestDbRow>();
  const requests: DishRequest[] = res.results.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    note: r.note,
    surface: SURFACES.includes(r.surface as never) ? (r.surface as Surface) : "web",
    createdAt: r.created_at,
  }));
  return c.json(requests);
});

app.delete("/requests/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const res = await c.env.DB.prepare("DELETE FROM dish_requests WHERE id = ?").bind(id).run();
  if (res.meta.changes === 0) return c.json({ error: "Request not found" }, 404);
  return c.json({ ok: true });
});

app.get("/dashboard", async (c) => {
  const today = serverToday();
  const [todayRes, upcomingRes, dishesRes] = await c.env.DB.batch([
    c.env.DB
      .prepare("SELECT s.dish_id, d.name FROM schedule s JOIN dishes d ON d.id = s.dish_id WHERE s.date = ?")
      .bind(today),
    c.env.DB.prepare("SELECT date FROM schedule WHERE date >= ? AND date <= ?").bind(today, addDays(today, 59)),
    c.env.DB.prepare(
      `SELECT d.id, d.name, d.ingredients,
         (SELECT COUNT(*) FROM clues c WHERE c.dish_id = d.id) AS clue_count
       FROM dishes d WHERE d.is_active = 1`,
    ),
  ]);
  const todayRow = todayRes.results[0] as { dish_id: number; name: string } | undefined;

  const scheduledSet = new Set((upcomingRes.results as { date: string }[]).map((r) => r.date));
  let scheduledAhead = 0;
  let firstGap: string | null = null;
  for (let d = today, i = 0; i < 60; d = addDays(d, 1), i++) {
    if (scheduledSet.has(d)) {
      if (firstGap === null) scheduledAhead++;
    } else if (firstGap === null) {
      firstGap = d;
    }
  }

  const warnings: AdminDashboard["warnings"] = [];
  for (const d of dishesRes.results as { id: number; name: string; ingredients: string; clue_count: number }[]) {
    if (d.clue_count !== 5) {
      warnings.push({ kind: "missing-clues", dishId: d.id, dishName: d.name, detail: `${d.clue_count}/5 clues` });
    }
    const count = (JSON.parse(d.ingredients) as string[]).length;
    if (count < 3) {
      warnings.push({ kind: "few-ingredients", dishId: d.id, dishName: d.name, detail: `${count} ingredients` });
    }
  }

  const dashboard: AdminDashboard = {
    today: { date: today, dishId: todayRow?.dish_id ?? null, dishName: todayRow?.name ?? null },
    scheduledAhead,
    firstGap,
    warnings,
  };
  return c.json(dashboard);
});

const zeroByKind = (): StartedByKind => ({ daily: 0, leftover: 0, random: 0 });

// Anonymous engagement aggregates (see migrations/0005_add_analytics.sql and
// 0007_add_analytics_kind.sql). A round is one of three kinds — the daily
// Special, a leftover (archive replay), or a chef's special (random recipe).
app.get("/analytics", async (c) => {
  const today = serverToday();

  // Optional surface filter (web / discord). Absent or unrecognised → all
  // surfaces. The value is whitelisted against the SURFACES enum, so it's safe
  // to splice the literal straight into the SQL (no bind-param reshuffling
  // across the eight queries below). `surfAnd` extends an existing WHERE;
  // `surfWhere` starts one for the queries that otherwise have none.
  const surfaceParam = c.req.query("surface");
  const surface = SURFACES.includes(surfaceParam as never) ? (surfaceParam as Surface) : null;
  const surfAnd = surface ? ` AND surface = '${surface}'` : "";
  const surfWhere = surface ? ` WHERE surface = '${surface}'` : "";

  // started_at is stored in UTC; SQLite has no named-timezone support, so we
  // fold UTC instants into ET days/hours in JS below. Compute the ET-"today"
  // UTC window (and a ~5-week lower bound for the daily series) from the same
  // midnight-ET countdown the rollover uses.
  const nextMidnightUtcMs = Date.now() + msUntilGameMidnight();
  const utcStamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  const dailyLowerBound = utcStamp(nextMidnightUtcMs - 36 * 86_400_000);

  // All-time totals carry a per-kind split of `started` (COUNT(*)).
  const allTimeTotalsSql =
    `SELECT COUNT(*) AS started,
       COALESCE(SUM(completed), 0) AS completed,
       COALESCE(SUM(solved), 0) AS solved,
       COALESCE(SUM(shared), 0) AS shared,
       COALESCE(SUM(completed = 1 AND solved = 0), 0) AS fails,
       COALESCE(SUM(kind = 'daily'), 0) AS started_daily,
       COALESCE(SUM(kind = 'leftover'), 0) AS started_leftover,
       COALESCE(SUM(kind = 'random'), 0) AS started_random
     FROM analytics_rounds${surfWhere}`;
  // Today's Special engagement — the daily puzzle only, so replays/random never
  // dilute its completion, win rate, or guess distribution.
  const todayTotalsSql =
    `SELECT COUNT(*) AS started,
       COALESCE(SUM(completed), 0) AS completed,
       COALESCE(SUM(solved), 0) AS solved,
       COALESCE(SUM(shared), 0) AS shared,
       COALESCE(SUM(completed = 1 AND solved = 0), 0) AS fails
     FROM analytics_rounds WHERE play_date = ? AND kind = 'daily'${surfAnd}`;
  const distSql = (where: string) =>
    `SELECT guesses, COUNT(*) AS n FROM analytics_rounds
       WHERE completed = 1 AND solved = 1 AND guesses BETWEEN 1 AND ?${where}${surfAnd}
       GROUP BY guesses`;

  const [
    allTimeTotalsRes,
    allTimeDistRes,
    todayTotalsRes,
    todayDistRes,
    todayDishRes,
    dailyRes,
    hourlyRes,
    playerRes,
  ] = await c.env.DB.batch([
      c.env.DB.prepare(allTimeTotalsSql),
      c.env.DB.prepare(distSql("")).bind(MAX_GUESSES),
      c.env.DB.prepare(todayTotalsSql).bind(today),
      c.env.DB.prepare(distSql(" AND play_date = ? AND kind = 'daily'")).bind(MAX_GUESSES, today),
      c.env.DB
        .prepare("SELECT d.name FROM schedule s JOIN dishes d ON d.id = s.dish_id WHERE s.date = ?")
        .bind(today),
      // Daily series: bucket started_at by UTC hour + kind, folded into ET days
      // below. "Games started" is a started-at metric, so a leftover replayed
      // today lands on today — not on the old puzzle's date.
      c.env.DB
        .prepare(
          `SELECT strftime('%Y-%m-%d %H', started_at) AS bucket, kind,
             COUNT(*) AS started,
             COALESCE(SUM(completed), 0) AS completed,
             COALESCE(SUM(solved), 0) AS solved,
             COALESCE(SUM(shared), 0) AS shared
           FROM analytics_rounds
           WHERE started_at IS NOT NULL AND started_at >= ?${surfAnd}
           GROUP BY bucket, kind`,
        )
        .bind(dailyLowerBound),
      c.env.DB.prepare(
        // Started-at is stored in UTC. ET has DST, so we bucket by UTC hour and
        // fold each bucket into its ET hour-of-day (the offset is whole hours).
        `SELECT strftime('%Y-%m-%d %H', started_at) AS bucket, COUNT(*) AS n
           FROM analytics_rounds WHERE started_at IS NOT NULL${surfAnd} GROUP BY bucket`,
      ),
      // New-vs-returning input: one row per (player, active UTC hour). Folded to
      // ET days in JS; a player's earliest ET day is when they were "new", every
      // later active ET day makes them "returning". Rows before player_id shipped
      // (NULL) are excluded — the split is only meaningful going forward.
      c.env.DB.prepare(
        `SELECT player_id, strftime('%Y-%m-%d %H', started_at) AS bucket
           FROM analytics_rounds
           WHERE player_id IS NOT NULL AND started_at IS NOT NULL${surfAnd}
           GROUP BY player_id, bucket`,
      ),
    ]);

  const emptyTotals = { started: 0, completed: 0, solved: 0, shared: 0, fails: 0 };
  const toPeriod = (
    totalsResult: D1Result,
    distResult: D1Result,
    startedByKind: StartedByKind,
    players: PlayerSplit,
  ): AnalyticsPeriod => {
    const { fails, ...totals } =
      (totalsResult.results[0] as AnalyticsPeriod["totals"] & { fails: number }) ?? emptyTotals;
    const guessDistribution = Array.from({ length: MAX_GUESSES }, () => 0);
    for (const r of distResult.results as { guesses: number; n: number }[]) {
      guessDistribution[r.guesses - 1] = r.n;
    }
    return { totals, startedByKind, guessDistribution, fails, players };
  };

  // New vs returning players. Fold each player's active UTC-hour buckets into ET
  // days; their earliest ET day is a "new" tally that day, every later active ET
  // day is a "returning" tally. All-time `new` is the total distinct players and
  // `returning` is those who came back on at least one later day.
  const activeDaysByPlayer = new Map<string, Set<string>>();
  for (const r of playerRes.results as { player_id: string; bucket: string }[]) {
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    const et = gameToday(instant);
    let set = activeDaysByPlayer.get(r.player_id);
    if (!set) {
      set = new Set();
      activeDaysByPlayer.set(r.player_id, set);
    }
    set.add(et);
  }
  const newByDay = new Map<string, number>();
  const returningByDay = new Map<string, number>();
  let allTimeNew = 0;
  let allTimeReturning = 0;
  for (const days of activeDaysByPlayer.values()) {
    const sorted = [...days].sort();
    const firstDay = sorted[0];
    newByDay.set(firstDay, (newByDay.get(firstDay) ?? 0) + 1);
    allTimeNew += 1;
    let returned = false;
    for (const d of sorted) {
      if (d === firstDay) continue;
      returningByDay.set(d, (returningByDay.get(d) ?? 0) + 1);
      returned = true;
    }
    if (returned) allTimeReturning += 1;
  }
  const playersOn = (date: string): PlayerSplit => ({
    new: newByDay.get(date) ?? 0,
    returning: returningByDay.get(date) ?? 0,
  });

  const at = (allTimeTotalsRes.results[0] ?? {}) as Record<string, number>;
  const allTimeByKind: StartedByKind = {
    daily: at.started_daily ?? 0,
    leftover: at.started_leftover ?? 0,
    random: at.started_random ?? 0,
  };

  // Fold the started_at buckets into ET days, splitting `started` by kind.
  // Player fields (newPlayers/returningPlayers) are computed separately via
  // playersOn() and merged in when the daily array is built, so they're not part
  // of this per-kind started/completed accumulator.
  type DayAccum = Omit<AnalyticsDay, "date" | "newPlayers" | "returningPlayers">;
  const dayMap = new Map<string, DayAccum>();
  for (const r of dailyRes.results as {
    bucket: string;
    kind: RoundKind;
    started: number;
    completed: number;
    solved: number;
    shared: number;
  }[]) {
    // Rebuild the instant at mid-hour to stay clear of any boundary rounding.
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    const et = gameToday(instant);
    let acc = dayMap.get(et);
    if (!acc) {
      acc = { started: 0, startedByKind: zeroByKind(), completed: 0, solved: 0, shared: 0 };
      dayMap.set(et, acc);
    }
    acc.started += r.started;
    if (r.kind in acc.startedByKind) acc.startedByKind[r.kind] += r.started;
    acc.completed += r.completed;
    acc.solved += r.solved;
    acc.shared += r.shared;
  }
  // Oldest first; keep the most recent 30 ET days that saw activity.
  const daily: AnalyticsDay[] = [...dayMap.keys()]
    .sort()
    .slice(-30)
    .map((date) => {
      const p = playersOn(date);
      return { date, ...dayMap.get(date)!, newPlayers: p.new, returningPlayers: p.returning };
    });
  const todayByKind = dayMap.get(today)?.startedByKind ?? zeroByKind();

  const allTime = toPeriod(allTimeTotalsRes, allTimeDistRes, allTimeByKind, {
    new: allTimeNew,
    returning: allTimeReturning,
  });
  const todayPeriod = toPeriod(todayTotalsRes, todayDistRes, todayByKind, playersOn(today));
  const todayDish = todayDishRes.results[0] as { name: string } | undefined;

  // Fold each UTC hour-bucket ("YYYY-MM-DD HH", UTC) into its ET hour of day.
  const hourly = Array.from({ length: 24 }, () => 0);
  for (const r of hourlyRes.results as { bucket: string; n: number }[]) {
    const instant = new Date(`${r.bucket.replace(" ", "T")}:30:00Z`);
    if (Number.isNaN(instant.getTime())) continue;
    hourly[gameHour(instant)] += r.n;
  }

  const summary: AnalyticsSummary = {
    totals: allTime.totals,
    startedByKind: allTime.startedByKind,
    guessDistribution: allTime.guessDistribution,
    fails: allTime.fails,
    players: allTime.players,
    today: { date: today, dishName: todayDish?.name ?? null, ...todayPeriod },
    daily,
    hourly,
  };
  return c.json(summary);
});

export default app;
