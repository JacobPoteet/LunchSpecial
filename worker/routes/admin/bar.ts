// /api/admin/drinks, /nights, /drink-preview, /showcase and /night-report:
// After Dark's back bar.

import { Hono } from "hono";
import type {
  AdminDrinkDetail,
  AdminDrinkInput,
  AdminDrinkRow,
  AfterDarkReport,
  NightEntry,
  Profile,
  Region,
  Spirit,
  Temperature,
} from "../../../shared/types";
import {
  DRINK_CLUE_COUNT,
  NIGHT_EPOCH_DATE,
  NIGHT_REPEAT_WINDOW_DAYS,
  PROFILES,
  REGIONS,
  SPIRITS,
  TEMPERATURES,
} from "../../../shared/types";

import { foldCrossover, foldNightReport, type CrossoverRow, type DrinkMetaRow, type NightRoundRow } from "../../nightstats";

import { pickUnserved, unservedDishes, type ShuffleDishRow } from "../../shuffle";

import { createToken, PREVIEW_TTL_MS } from "../../auth";
import { serverToday } from "../../db";
import { getTargetDrink, rowToDrink, type DrinkDbRow } from "../../drinkdb";
import { SHOWCASE_PAYLOAD, SHOWCASE_TTL_DAYS, showcaseTtlMs } from "../../showcase";
import { isValidDateString } from "../../game";

import { addDays } from "../../../shared/time";

import { slugify, surfaceClause } from "./shared";

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// After Dark: the back bar.
//
// Deliberately parallel to the dish routes above rather than generic over a
// table name. Two attributes differ, the clue count differs, the schedule's key
// is a local night rather than an ET day, and the one thing that must never
// happen is a query aimed at the wrong catalogue.
// ---------------------------------------------------------------------------

interface AdminDrinkDbRow extends DrinkDbRow {
  coaster_count: number;
  last_poured: string | null;
  next_booked: string | null;
  times_poured: number;
}

function toAdminDrinkRow(row: AdminDrinkDbRow): AdminDrinkRow {
  const drink = rowToDrink(row);
  return {
    ...drink,
    coasterCount: row.coaster_count,
    lastPoured: row.last_poured,
    nextBooked: row.next_booked,
    timesPoured: row.times_poured,
    pourable: drink.ingredients.length >= 3 && row.coaster_count === DRINK_CLUE_COUNT,
  };
}

app.get("/drinks", async (c) => {
  // Tonight in ET. The board's nights are local days and this is not, which is
  // fine for "has it been poured lately" and would not be for anything a player
  // sees — the admin is one person in one timezone, and the alternative is
  // asking the browser what night it is to answer a question about history.
  const today = serverToday();
  const res = await c.env.DB
    .prepare(
      `SELECT d.*,
         (SELECT COUNT(*) FROM drink_clues c WHERE c.drink_id = d.id) AS coaster_count,
         (SELECT MAX(s.night) FROM drink_schedule s WHERE s.drink_id = d.id AND s.night <= ?) AS last_poured,
         (SELECT COUNT(*) FROM drink_schedule s WHERE s.drink_id = d.id AND s.night <= ?) AS times_poured,
         (SELECT MIN(s.night) FROM drink_schedule s WHERE s.drink_id = d.id AND s.night > ?) AS next_booked
       FROM drinks d ORDER BY d.name`,
    )
    .bind(today, today, today)
    .all<AdminDrinkDbRow>();
  return c.json(res.results.map(toAdminDrinkRow));
});

app.get("/drinks/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [drinkRes, coasterRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT * FROM drinks WHERE id = ?").bind(id),
    c.env.DB.prepare("SELECT text FROM drink_clues WHERE drink_id = ? ORDER BY order_index").bind(id),
  ]);
  const row = drinkRes.results[0] as DrinkDbRow | undefined;
  if (!row) return c.json({ error: "Drink not found" }, 404);
  const coasters = (coasterRes.results as { text: string }[]).map((r) => r.text);
  const detail: AdminDrinkDetail = { ...rowToDrink(row), coasters };
  return c.json(detail);
});

function validateDrinkInput(raw: unknown): { drink: AdminDrinkInput } | { error: string } {
  const b = raw as Partial<AdminDrinkInput> | null;
  if (!b) return { error: "Invalid JSON body" };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "A name is required" };
  const country = typeof b.country === "string" ? b.country.trim() : "";
  if (!country) return { error: "A country is required" };
  if (!REGIONS.includes(b.region as never)) return { error: "Invalid region" };
  if (!SPIRITS.includes(b.spirit as never)) return { error: "Invalid base spirit" };
  if (!TEMPERATURES.includes(b.temperature as never)) return { error: "Invalid temperature" };
  if (!PROFILES.includes(b.profile as never)) return { error: "Invalid profile" };
  const ingredients = Array.isArray(b.ingredients)
    ? b.ingredients.filter((i): i is string => typeof i === "string" && i.trim().length > 0).map((i) => i.trim().toLowerCase())
    : [];
  // Coasters are stored as given, blanks and all: a half-written drink is a
  // legitimate saved state, and `pourable` is what decides whether it can be
  // booked. Only the count of non-empty ones is capped.
  const coasters = Array.isArray(b.coasters)
    ? b.coasters.slice(0, DRINK_CLUE_COUNT).map((t) => (typeof t === "string" ? t.trim() : ""))
    : [];
  return {
    drink: {
      name,
      country,
      region: b.region as Region,
      spirit: b.spirit as Spirit,
      temperature: b.temperature as Temperature,
      profile: b.profile as Profile,
      ingredients,
      isAlcoholic: b.isAlcoholic !== false,
      isActive: b.isActive !== false,
      isFanSubmission: b.isFanSubmission === true,
      coasters,
    },
  };
}

/** Replace a drink's coasters wholesale. Blank rows are dropped, not stored. */
async function replaceCoasters(db: D1Database, drinkId: number, coasters: string[]): Promise<void> {
  const statements = [db.prepare("DELETE FROM drink_clues WHERE drink_id = ?").bind(drinkId)];
  coasters.forEach((text, i) => {
    if (text.trim().length === 0) return;
    statements.push(
      db
        .prepare("INSERT INTO drink_clues (drink_id, order_index, text) VALUES (?, ?, ?)")
        .bind(drinkId, i + 1, text.trim()),
    );
  });
  await db.batch(statements);
}

const DRINK_COLUMNS = `name = ?, slug = ?, country = ?, region = ?, spirit = ?, temperature = ?,
  profile = ?, ingredients = ?, is_alcoholic = ?, is_active = ?, is_fan_submission = ?`;

function drinkBindings(d: AdminDrinkInput): (string | number)[] {
  return [
    d.name,
    slugify(d.name),
    d.country,
    d.region,
    d.spirit,
    d.temperature,
    d.profile,
    JSON.stringify(d.ingredients),
    d.isAlcoholic ? 1 : 0,
    d.isActive ? 1 : 0,
    d.isFanSubmission ? 1 : 0,
  ];
}

app.post("/drinks", async (c) => {
  const parsed = validateDrinkInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const d = parsed.drink;
  try {
    const res = await c.env.DB
      .prepare(
        `INSERT INTO drinks (name, slug, country, region, spirit, temperature, profile, ingredients,
           is_alcoholic, is_active, is_fan_submission)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(...drinkBindings(d))
      .first<{ id: number }>();
    await replaceCoasters(c.env.DB, res!.id, d.coasters);
    return c.json({ id: res!.id });
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes("UNIQUE") ? "A drink with that name already exists" : "Save failed";
    return c.json({ error: msg }, 400);
  }
});

app.put("/drinks/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = validateDrinkInput(await c.req.json().catch(() => null));
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);
  const d = parsed.drink;
  try {
    const res = await c.env.DB
      .prepare(`UPDATE drinks SET ${DRINK_COLUMNS}, updated_at = datetime('now') WHERE id = ?`)
      .bind(...drinkBindings(d), id)
      .run();
    if (res.meta.changes === 0) return c.json({ error: "Drink not found" }, 404);
    await replaceCoasters(c.env.DB, id, d.coasters);
    return c.json({ id });
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes("UNIQUE") ? "A drink with that name already exists" : "Save failed";
    return c.json({ error: msg }, 400);
  }
});

app.delete("/drinks/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const booked = await c.env.DB
    .prepare("SELECT night FROM drink_schedule WHERE drink_id = ? AND night >= ? LIMIT 1")
    .bind(id, serverToday())
    .first<{ night: string }>();
  if (booked) {
    return c.json({ error: `Drink is booked for ${booked.night} — clear that night first` }, 409);
  }
  const [, drinkRes] = await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM drink_clues WHERE drink_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM drinks WHERE id = ?").bind(id),
  ]);
  if (drinkRes.meta.changes === 0) return c.json({ error: "Drink not found" }, 404);
  return c.json({ ok: true });
});

/**
 * The ingredient vocabulary, pooled across BOTH catalogues.
 *
 * A bar and a kitchen share a pantry: lime, sugar, cinnamon and cream are all
 * in both. Two spellings of one ingredient means two ingredients and the
 * feedback silently under-reports for every row holding either, so the
 * autocomplete has to offer what the other catalogue already settled on.
 */
app.get("/drink-ingredients", async (c) => {
  const [drinkRes, dishRes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT ingredients FROM drinks"),
    c.env.DB.prepare("SELECT ingredients FROM dishes"),
  ]);
  const all = new Set<string>();
  for (const res of [drinkRes, dishRes]) {
    for (const row of res.results as { ingredients: string }[]) {
      for (const ing of JSON.parse(row.ingredients) as string[]) all.add(ing);
    }
  }
  return c.json([...all].sort());
});

// ---- The nightly board ----

app.get("/nights", async (c) => {
  const today = serverToday();
  const from = c.req.query("from") ?? addDays(today, -7);
  const to = c.req.query("to") ?? addDays(today, 45);
  if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
    return c.json({ error: "Invalid night range" }, 400);
  }
  const res = await c.env.DB
    .prepare(
      `SELECT s.night, s.drink_id, d.name FROM drink_schedule s JOIN drinks d ON d.id = s.drink_id
       WHERE s.night BETWEEN ? AND ? ORDER BY s.night`,
    )
    .bind(from, to)
    .all<{ night: string; drink_id: number; name: string }>();
  const byNight = new Map(res.results.map((r) => [r.night, r]));
  const entries: NightEntry[] = [];
  for (let n = from; n <= to; n = addDays(n, 1)) {
    const row = byNight.get(n);
    entries.push({ night: n, drinkId: row?.drink_id ?? null, drinkName: row?.name ?? null });
  }
  return c.json(entries);
});

app.put("/nights", async (c) => {
  let body: { night?: string; drinkId?: number | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.night || !isValidDateString(body.night)) return c.json({ error: "Invalid night" }, 400);
  // A night is a local day and `serverToday` is an ET one, so the lock is a day
  // looser than the dish board's on purpose: locking "today" in ET would lock a
  // night that has not started yet for players west of it.
  if (body.night < addDays(serverToday(), -1)) return c.json({ error: "Past nights are locked" }, 400);
  if (body.drinkId == null) {
    await c.env.DB.prepare("DELETE FROM drink_schedule WHERE night = ?").bind(body.night).run();
    return c.json({ ok: true });
  }
  const drink = await c.env.DB
    .prepare(
      `SELECT d.id, d.ingredients,
         (SELECT COUNT(*) FROM drink_clues c WHERE c.drink_id = d.id) AS coaster_count
       FROM drinks d WHERE d.id = ?`,
    )
    .bind(body.drinkId)
    .first<{ id: number; ingredients: string; coaster_count: number }>();
  if (!drink) return c.json({ error: "Drink not found" }, 404);
  if ((JSON.parse(drink.ingredients) as string[]).length < 3 || drink.coaster_count !== DRINK_CLUE_COUNT) {
    return c.json(
      { error: `Drink needs at least 3 ingredients and exactly ${DRINK_CLUE_COUNT} coasters before booking` },
      400,
    );
  }
  await c.env.DB
    .prepare(
      "INSERT INTO drink_schedule (night, drink_id) VALUES (?, ?) ON CONFLICT(night) DO UPDATE SET drink_id = excluded.drink_id",
    )
    .bind(body.night, body.drinkId)
    .run();
  return c.json({ ok: true });
});

/**
 * Fill empty nights in the next 30 with least-recently-poured drinks.
 *
 * The repeat window is NIGHT_REPEAT_WINDOW_DAYS rather than the dish board's 60.
 * See the constant: it was forced when the bar held 40 drinks and is headroom now.
 */
app.post("/nights/autofill", async (c) => {
  const today = serverToday();
  const windowEnd = addDays(today, 29);
  const blockStart = addDays(today, -NIGHT_REPEAT_WINDOW_DAYS);

  const booked = await c.env.DB
    .prepare("SELECT night, drink_id FROM drink_schedule WHERE night >= ?")
    .bind(blockStart)
    .all<{ night: string; drink_id: number }>();
  const takenNights = new Set(booked.results.filter((r) => r.night >= today).map((r) => r.night));
  const recentlyPoured = new Set(booked.results.map((r) => r.drink_id));

  const drinks = await c.env.DB
    .prepare(
      `SELECT d.id, d.ingredients,
         (SELECT COUNT(*) FROM drink_clues c WHERE c.drink_id = d.id) AS coaster_count,
         (SELECT MAX(s.night) FROM drink_schedule s WHERE s.drink_id = d.id AND s.night < ?) AS last_poured
       FROM drinks d WHERE d.is_active = 1`,
    )
    .bind(today)
    .all<{ id: number; ingredients: string; coaster_count: number; last_poured: string | null }>();

  const eligible = drinks.results
    .filter(
      (d) =>
        d.coaster_count === DRINK_CLUE_COUNT &&
        (JSON.parse(d.ingredients) as string[]).length >= 3 &&
        !recentlyPoured.has(d.id),
    )
    .sort((a, b) => (a.last_poured ?? "").localeCompare(b.last_poured ?? ""));

  const statements = [];
  let filled = 0;
  for (let n = today; n <= windowEnd && filled < eligible.length; n = addDays(n, 1)) {
    if (takenNights.has(n)) continue;
    statements.push(
      c.env.DB.prepare("INSERT INTO drink_schedule (night, drink_id) VALUES (?, ?)").bind(n, eligible[filled].id),
    );
    filled++;
  }
  if (statements.length > 0) await c.env.DB.batch(statements);
  return c.json({ filled: statements.length });
});

/** Roll a never-poured drink onto one night. Same fold as the dish shuffle. */
app.post("/nights/shuffle", async (c) => {
  let body: { night?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.night || !isValidDateString(body.night)) return c.json({ error: "Invalid night" }, 400);
  if (body.night < addDays(serverToday(), -1)) return c.json({ error: "Past nights are locked" }, 400);

  const res = await c.env.DB
    .prepare(
      `SELECT d.id, d.name, d.ingredients,
         (SELECT COUNT(*) FROM drink_clues c WHERE c.drink_id = d.id) AS clue_count,
         EXISTS (SELECT 1 FROM drink_schedule s WHERE s.drink_id = d.id) AS ever_scheduled
       FROM drinks d WHERE d.is_active = 1`,
    )
    .all<ShuffleDishRow>();

  const pool = unservedDishes(res.results, DRINK_CLUE_COUNT);
  const pick = pickUnserved(pool, Math.random());
  if (!pick) {
    return c.json(
      { error: "Every pourable drink has been on at some point — nothing left to shuffle" },
      409,
    );
  }
  await c.env.DB
    .prepare(
      "INSERT INTO drink_schedule (night, drink_id) VALUES (?, ?) ON CONFLICT(night) DO UPDATE SET drink_id = excluded.drink_id",
    )
    .bind(body.night, pick.id)
    .run();
  return c.json({ night: body.night, drinkId: pick.id, drinkName: pick.name, remaining: pool.length });
});

/**
 * A token for an untracked test pour (`/?bar=1&preview=…`, 24h).
 *
 * This is the only way past the clock in production, and it is the whole reason
 * it exists: the bar is open for seven hours a night, and "does the tab look
 * right" is a question you ask at two in the afternoon. Same 24h TTL and same
 * untracked round as the dish preview.
 *
 * The payload is prefixed `preview:drink:`, which the daily's resolveTarget
 * rejects — it parses the remainder as a dish id and gets NaN — so a bar token
 * cannot be pointed at the kitchen or the reverse.
 */
app.post("/drink-preview", async (c) => {
  let body: { drinkId?: number; night?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  let drinkId: number | null = null;
  if (typeof body.night === "string") {
    const target = await getTargetDrink(c.env.DB, body.night);
    drinkId = target?.id ?? null;
    if (drinkId === null) return c.json({ error: "Nothing on tap that night" }, 404);
  } else {
    const drink = await c.env.DB
      .prepare("SELECT id FROM drinks WHERE id = ?")
      .bind(Number(body.drinkId))
      .first();
    if (!drink) return c.json({ error: "Drink not found" }, 404);
    drinkId = Number(body.drinkId);
  }
  const token = await createToken(`preview:drink:${drinkId}`, PREVIEW_TTL_MS, c.env.SESSION_SECRET);
  return c.json({ token, url: `/?bar=1&preview=${encodeURIComponent(token)}` });
});

/**
 * A showcase link (`/?s=…`) — the demo link.
 *
 * Lands on a finished, won Special with the bar's band already lit, so someone
 * who has never played sees the hand-off into After Dark without waiting for
 * 8pm or playing six guesses to earn the door. Every gate in this game was
 * built for a player who comes back daily; a stranger with five minutes trips
 * all three of them.
 *
 * Three things it deliberately is:
 *
 * 1. **Untracked.** It is a preview in every sense the beacons care about — no
 *    round is recorded, no visit fires, and it cannot move a dashboard figure.
 *    That is what keeps `outsideHours` on the After Dark tab a reading of
 *    wound-forward clocks rather than a bucket full of demos.
 * 2. **Pointed at the real pour.** It names no drink, unlike a drink preview,
 *    so it serves whatever is actually on tap that night.
 * 3. **Longer-lived than a preview.** 24h suits "does the tab look right"; a
 *    link you put in an email has to survive the reply.
 *
 * And one thing it is not: revocable. The token is stateless HMAC, so there is
 * no list to strike it from — killing one early means rotating SESSION_SECRET,
 * which invalidates every session and every other preview at the same time.
 * That is why the lifetimes are a closed set and why the response says when it
 * dies, rather than leaving the caller to guess.
 */
app.post("/showcase", async (c) => {
  let body: { days?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const ttl = showcaseTtlMs(body.days);
  if (ttl === null) {
    return c.json({ error: `days must be one of ${SHOWCASE_TTL_DAYS.join(", ")}` }, 400);
  }
  const token = await createToken(SHOWCASE_PAYLOAD, ttl, c.env.SESSION_SECRET);
  // `?s=`, not `?s=`. Seven characters of a link somebody has to paste
  // into an email, spent on a word only this app would read.
  return c.json({
    token,
    url: `/?s=${encodeURIComponent(token)}`,
    expiresAt: new Date(Date.now() + ttl).toISOString(),
  });
});

/**
 * Everything the After Dark tab reads, in one response.
 *
 * Its own endpoint rather than more fields on /analytics, because it answers a
 * different question and a different one only. The surface filter applies (the
 * bar runs in the Activity too); the day picker does not — the bar's unit is a
 * night, not an ET day, and pointing an ET day picker at it would be the
 * dashboard telling a small lie every time somebody used it.
 */
app.get("/night-report", async (c) => {
  const { and: surfAnd } = surfaceClause(c);
  const today = serverToday();

  const [roundsRes, metaRes, crossRes, boardRes, poolRes] = await c.env.DB.batch([
    // Grouped as coarsely as the fold allows: one row per distinct combination
    // rather than one per round, which keeps this to a few hundred rows at any
    // volume the bar will plausibly see.
    // `local_hour` is computed HERE rather than in the fold, and the whole
    // reason is half-hour zones. A UTC hour bucket spans two local hours in
    // India (+5:30), Nepal (+5:45), Newfoundland (-3:30) and Chatham (+12:45),
    // so no amount of arithmetic on the bucket can say which of the two the
    // player's clock showed. `started_at` still has the minutes, so shifting it
    // by the stored offset gives the hour exactly.
    c.env.DB.prepare(
      `SELECT play_date,
         CASE WHEN tz_offset IS NULL THEN NULL ELSE
           CAST(strftime('%H', started_at, printf('%+d minutes', tz_offset)) AS INTEGER)
         END AS local_hour,
         completed, solved, shared, guesses, drink_id, COUNT(*) AS n
       FROM analytics_rounds
       WHERE kind = 'nightcap' AND started_at IS NOT NULL${surfAnd}
       GROUP BY play_date, local_hour, completed, solved, shared, guesses, drink_id`,
    ),
    c.env.DB.prepare(
      `SELECT d.id, d.name, d.country, d.spirit, d.is_alcoholic FROM drinks d`,
    ),
    // The crossover input: for each device and day, did it finish a Special and
    // did it start a Nightcap?
    //
    // Joined on `play_date` across two kinds whose play_date means different
    // things: an ET day for lunch, a local night for the bar.
    //
    // They agree for the ordinary case, which is the whole of the evening. A
    // player who eats during day D and drinks between 20:00 and midnight has
    // both keys on D, and so does one who drinks at 01:00 the next morning --
    // that is exactly what the night key rolling back over the small hours is
    // for.
    //
    // They disagree in one window: a player who plays LUNCH between midnight
    // and 03:00 gets the Special dated D+1 while still being out on night D, so
    // that pairing is not counted. It is a real gap and a small one (it needs
    // someone to start both halves in the same three-hour window on opposite
    // sides of the boundary), and closing it would mean pairing night D with
    // both ET day D and D+1, which double-counts the ordinary case to rescue
    // the rare one. Reported as it is instead.
    //
    // Narrowed to NIGHT_EPOCH_DATE forward, which is the fix for the number
    // this panel used to print. Lunch has been served since EPOCH_DATE and the
    // bar opened weeks later; without the bound, every device that finished a
    // Special before After Dark existed sat in the denominator of "did anyone
    // come back for a drink", and none of them could have. The pooled rate was
    // reading eligibility as refusal.
    c.env.DB
      .prepare(
        `SELECT player_id, play_date AS day,
           MAX(kind = 'daily' AND completed = 1) AS finished_lunch,
           MAX(kind = 'nightcap') AS started_nightcap
         FROM analytics_rounds
         WHERE player_id IS NOT NULL AND kind IN ('daily', 'nightcap')
           AND play_date >= ?${surfAnd}
         GROUP BY player_id, play_date`,
      )
      .bind(NIGHT_EPOCH_DATE),
    c.env.DB
      .prepare(
        `SELECT s.night, s.drink_id, d.name FROM drink_schedule s
         JOIN drinks d ON d.id = s.drink_id WHERE s.night IN (?, ?)`,
      )
      .bind(today, addDays(today, 1)),
    c.env.DB
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM drinks d
              WHERE d.is_active = 1
                AND NOT EXISTS (SELECT 1 FROM drink_schedule s WHERE s.drink_id = d.id)) AS never_poured,
           (SELECT COUNT(*) FROM drink_schedule WHERE night >= ?) AS booked_ahead`,
      )
      .bind(today),
  ]);

  const booked = new Map(
    (boardRes.results as { night: string; drink_id: number; name: string }[]).map((r) => [r.night, r]),
  );
  const entry = (night: string): NightEntry => {
    const row = booked.get(night);
    return { night, drinkId: row?.drink_id ?? null, drinkName: row?.name ?? null };
  };
  const pool = (poolRes.results[0] ?? {}) as { never_poured?: number; booked_ahead?: number };

  const payload: AfterDarkReport = {
    board: {
      tonight: entry(today),
      tomorrow: entry(addDays(today, 1)),
      neverPoured: pool.never_poured ?? 0,
      bookedAhead: pool.booked_ahead ?? 0,
    },
    report: foldNightReport(
      roundsRes.results as unknown as NightRoundRow[],
      metaRes.results as unknown as DrinkMetaRow[],
    ),
    // ET today is what "still being played" means here: tonight's key is
    // today's date almost everywhere, and a device far enough east to be on
    // tomorrow's already is censored by the same comparison.
    crossover: foldCrossover(crossRes.results as unknown as CrossoverRow[], today),
  };
  return c.json(payload);
});

export default app;
