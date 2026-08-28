import { Hono } from "hono";
import type {
  Announcement,
  AnnouncementAudience,
  DailyInfo,
  DishSummary,
  GuessFeedback,
  RevealInfo,
} from "../../shared/types";
import { DISH_REQUEST_LIMITS, MAX_GUESSES, SURFACES } from "../../shared/types";
import { isEligible } from "../announcements";
import { verifyToken } from "../auth";
import { getClues, getDishById, getDishBySlug, getSeededDish, getTargetDish, serverToday } from "../db";
import { computeFeedback, isPlayableDate, puzzleNumber } from "../game";

const app = new Hono<{ Bindings: Env }>();

/**
 * Resolve the Special being played. Precedence: a preview token (admin test
 * play), then a named dish slug (playtesting), then a random-dish seed (free
 * play / "random recipe"), then a scheduled date — today's daily or any earlier
 * puzzle from the archive.
 */
async function resolveTarget(
  env: Env,
  date: string | undefined,
  preview: string | undefined,
  random: string | undefined,
  special: string | undefined,
) {
  if (preview) {
    const payload = await verifyToken(preview, env.SESSION_SECRET);
    if (!payload || !payload.startsWith("preview:")) return { error: "Invalid or expired preview link" as const };
    const dish = await getDishById(env.DB, Number(payload.slice("preview:".length)));
    return dish ? { dish } : { error: "Preview dish not found" as const };
  }
  if (special) {
    // A dish named outright (`?special=<slug>` — `npm run ramen` and friends).
    // Spoiler-free for the same reason `random` is: it never reads the
    // schedule, so it says nothing about which day serves what. The slugs it
    // takes are already public in /api/dishes.
    const dish = await getDishBySlug(env.DB, special);
    return dish ? { dish } : { error: `No dish with slug "${special}"` as const };
  }
  if (random) {
    // A random dish (deterministic per seed). Spoiler-free — it never touches
    // the schedule — so, unlike a dated request, it needs no gating.
    const dish = await getSeededDish(env.DB, random);
    return dish ? { dish } : { error: "No dish available" as const };
  }
  // A dated request: today's daily, or a past puzzle replayed from the archive.
  // Future dates are rejected so upcoming Specials aren't spoiled.
  if (!date || !isPlayableDate(date)) return { error: "Invalid date" as const };
  const dish = await getTargetDish(env.DB, date);
  return dish ? { dish } : { error: "No dish available" as const };
}

app.get("/dishes", async (c) => {
  const res = await c.env.DB.prepare("SELECT id, name FROM dishes WHERE is_active = 1 ORDER BY name").all<DishSummary>();
  return c.json(res.results);
});

app.get("/daily", async (c) => {
  const date = c.req.query("date");
  const preview = c.req.query("preview");
  const random = c.req.query("random");
  const special = c.req.query("special");
  const target = await resolveTarget(c.env, date, preview, random, special);
  if ("error" in target) return c.json({ error: target.error }, 400);
  // A random round sits outside the numbering entirely. A preview or a playtest
  // round is a dress rehearsal for the daily, so it keeps its date's real
  // number — that's what the receipt and the share grid print. (On the daily
  // path resolveTarget has already vetted the date; on the other two it never
  // looked at it, hence the check.)
  const numbered = !random && !!date && isPlayableDate(date);
  const info: DailyInfo = {
    date: date ?? "",
    puzzleNumber: numbered ? puzzleNumber(date) : 0,
    maxGuesses: MAX_GUESSES,
    ingredientCount: target.dish.ingredients.length,
  };
  return c.json(info);
});

app.post("/guess", async (c) => {
  // `dishId` is the dish being guessed; `special` (a slug) is the dish being
  // played, when a playtest round pinned it.
  let body: {
    date?: string;
    dishId?: number;
    guessNumber?: number;
    preview?: string;
    random?: string;
    special?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const guessNumber = Number(body.guessNumber);
  if (!Number.isInteger(guessNumber) || guessNumber < 1 || guessNumber > MAX_GUESSES) {
    return c.json({ error: "guessNumber must be 1-6" }, 400);
  }
  const dishId = Number(body.dishId);
  if (!Number.isInteger(dishId)) return c.json({ error: "Unknown dish" }, 400);
  // The target and the guessed dish are independent — resolve them in parallel.
  const [target, guess] = await Promise.all([
    resolveTarget(c.env, body.date, body.preview, body.random, body.special),
    getDishById(c.env.DB, dishId),
  ]);
  if ("error" in target) return c.json({ error: target.error }, 400);
  if (!guess) return c.json({ error: "Unknown dish" }, 400);

  const feedback: GuessFeedback = computeFeedback(guess, target.dish);
  if (!feedback.correct && guessNumber < MAX_GUESSES) {
    const clue = await c.env.DB
      .prepare("SELECT text FROM clues WHERE dish_id = ? AND order_index = ?")
      .bind(target.dish.id, guessNumber)
      .first<{ text: string }>();
    if (clue) feedback.clue = { index: guessNumber, text: clue.text };
  }
  return c.json(feedback);
});

/** Trim a field, coerce blank/absent to null, and cap its length. */
function cleanField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// A player-submitted dish suggestion. Public + anonymous (same client-trust model
// as the analytics beacons); lands in the admin review inbox (dish_requests table).
app.post("/requests", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { name?: unknown; country?: unknown; note?: unknown; surface?: unknown; playerId?: unknown }
    | null;
  const name = cleanField(body?.name, DISH_REQUEST_LIMITS.name);
  if (!name) return c.json({ error: "A dish name is required" }, 400);
  const country = cleanField(body?.country, DISH_REQUEST_LIMITS.country);
  const note = cleanField(body?.note, DISH_REQUEST_LIMITS.note);
  const surface = SURFACES.includes(body?.surface as never) ? (body!.surface as string) : "web";
  const playerId =
    typeof body?.playerId === "string" && body.playerId.length >= 8 && body.playerId.length <= 64
      ? body.playerId
      : null;

  // Ignore an exact duplicate from the same device so a double-tap (or the same
  // player resubmitting the same idea) doesn't clutter the inbox.
  if (playerId) {
    const dupe = await c.env.DB
      .prepare("SELECT 1 FROM dish_requests WHERE player_id = ? AND name = ? COLLATE NOCASE LIMIT 1")
      .bind(playerId, name)
      .first();
    if (dupe) return c.json({ ok: true, duplicate: true });
  }

  await c.env.DB
    .prepare(
      `INSERT INTO dish_requests (name, country, note, surface, player_id, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(name, country, note, surface, playerId)
    .run();
  return c.json({ ok: true });
});

// ---- Announcements ----
//
// Paths are "/api/announcements" and "/api/announcements/seen". None of the
// blocker-bait words apply here (no analytics/event/track/collect/beacon/
// telemetry/pixel — see worker/index.ts), and the two failure modes are both
// visible rather than silent: a blocked GET means no notice appears at all, and
// a blocked "seen" POST shows up in the admin panel as reach far below the
// day's player count. If reach ever looks impossibly low, suspect the path.

interface AnnouncementRow {
  id: number;
  header: string;
  body: string;
  audience: AnnouncementAudience;
  start_date: string;
  end_date: string;
  is_active: number;
}

/**
 * The notices this player should see right now. `returning=1` is the client
 * saying it has finished a game on this device before; unverifiable by design
 * (there are no accounts), and the worst a lie buys you is a notice slightly
 * early. The response carries content only — a notice you aren't eligible for
 * never leaves the Worker, so the client can't learn it exists.
 */
app.get("/announcements", async (c) => {
  const today = serverToday();
  const returning = c.req.query("returning") === "1";
  const res = await c.env.DB.prepare(
    `SELECT id, header, body, audience, start_date, end_date, is_active
       FROM announcements
       WHERE is_active = 1 AND start_date <= ? AND end_date >= ?
       ORDER BY start_date, id`,
  )
    .bind(today, today)
    .all<AnnouncementRow>();

  // The SQL has already narrowed by window; re-checking through isEligible keeps
  // the audience rule in exactly one place (worker/announcements.ts) rather than
  // half here and half in a WHERE clause.
  const list: Announcement[] = res.results
    .filter((r) =>
      isEligible(
        { startDate: r.start_date, endDate: r.end_date, isActive: r.is_active === 1, audience: r.audience },
        { today, returning },
      ),
    )
    .map((r) => ({ id: r.id, header: r.header, body: r.body }));
  return c.json(list);
});

/**
 * Record that a notice was actually put on screen. One row per (notice, device),
 * so a player who clears storage and sees it again is still one player reached.
 * Fire-and-forget from the client: it never blocks the modal, and a failure here
 * must never surface to a player who just wanted to read a note from the diner.
 */
app.post("/announcements/seen", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { id?: unknown; playerId?: unknown; surface?: unknown }
    | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Unknown announcement" }, 400);
  const playerId = body?.playerId;
  if (typeof playerId !== "string" || playerId.length < 8 || playerId.length > 64) {
    return c.json({ error: "Invalid player id" }, 400);
  }
  const surface = SURFACES.includes(body?.surface as never) ? (body!.surface as string) : "web";

  try {
    await c.env.DB.prepare(
      `INSERT INTO announcement_views (announcement_id, player_id, surface, seen_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(announcement_id, player_id) DO NOTHING`,
    )
      .bind(id, playerId, surface)
      .run();
  } catch (err) {
    // Almost certainly the FK: the notice was deleted between being served and
    // being read. Nothing to record, and nothing worth a 500 over.
    console.error(JSON.stringify({ message: "announcement view not recorded", id, error: String(err) }));
  }
  return c.json({ ok: true });
});

// Full answer once the round is over. Client-initiated, same trust model as Wordle.
app.get("/reveal", async (c) => {
  const target = await resolveTarget(
    c.env,
    c.req.query("date"),
    c.req.query("preview"),
    c.req.query("random"),
    c.req.query("special"),
  );
  if ("error" in target) return c.json({ error: target.error }, 400);
  const d = target.dish;
  const reveal: RevealInfo = {
    id: d.id,
    name: d.name,
    country: d.country,
    region: d.region,
    course: d.course,
    temperature: d.temperature,
    protein: d.protein,
    ingredients: d.ingredients,
    clues: await getClues(c.env.DB, d.id),
    isFanSubmission: d.isFanSubmission,
  };
  return c.json(reveal);
});

export default app;
