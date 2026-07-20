import { Hono } from "hono";
import type { DailyInfo, DishSummary, GuessFeedback, RevealInfo } from "../../shared/types";
import { DISH_REQUEST_LIMITS, MAX_GUESSES, SURFACES } from "../../shared/types";
import { verifyToken } from "../auth";
import { getClues, getDishById, getSeededDish, getTargetDish } from "../db";
import { computeFeedback, isPlayableDate, puzzleNumber } from "../game";

const app = new Hono<{ Bindings: Env }>();

/**
 * Resolve the Special being played. Precedence: a preview token (admin test
 * play), then a random-dish seed (free play / "random recipe"), then a
 * scheduled date — today's daily or any earlier puzzle from the archive.
 */
async function resolveTarget(
  env: Env,
  date: string | undefined,
  preview: string | undefined,
  random: string | undefined,
) {
  if (preview) {
    const payload = await verifyToken(preview, env.SESSION_SECRET);
    if (!payload || !payload.startsWith("preview:")) return { error: "Invalid or expired preview link" as const };
    const dish = await getDishById(env.DB, Number(payload.slice("preview:".length)));
    return dish ? { dish } : { error: "Preview dish not found" as const };
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
  const target = await resolveTarget(c.env, date, preview, random);
  if ("error" in target) return c.json({ error: target.error }, 400);
  const ephemeral = Boolean(preview) || Boolean(random);
  const info: DailyInfo = {
    date: date ?? "",
    puzzleNumber: ephemeral ? 0 : puzzleNumber(date!),
    maxGuesses: MAX_GUESSES,
    ingredientCount: target.dish.ingredients.length,
  };
  return c.json(info);
});

app.post("/guess", async (c) => {
  let body: { date?: string; dishId?: number; guessNumber?: number; preview?: string; random?: string };
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
    resolveTarget(c.env, body.date, body.preview, body.random),
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

// Full answer once the round is over. Client-initiated, same trust model as Wordle.
app.get("/reveal", async (c) => {
  const target = await resolveTarget(c.env, c.req.query("date"), c.req.query("preview"), c.req.query("random"));
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
  };
  return c.json(reveal);
});

export default app;
