import { Hono } from "hono";
import type { DailyInfo, DishSummary, GuessFeedback, RevealInfo } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";
import { verifyToken } from "../auth";
import { getClues, getDishById, getSeededDish, getTargetDish } from "../db";
import { computeFeedback, isAllowedRequestDate, puzzleNumber } from "../game";

const app = new Hono<{ Bindings: Env }>();

/** Local-dev "free play" — random-dish testing — never enabled in production. */
function freeplayEnabled(env: Env): boolean {
  return `${env.DEV_FREEPLAY}` === "true";
}

/**
 * Resolve the Special being played. Precedence: a preview token (admin test
 * play), then a dev-only free-play random seed, then the daily schedule.
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
  if (random && freeplayEnabled(env)) {
    const dish = await getSeededDish(env.DB, random);
    return dish ? { dish } : { error: "No dish available" as const };
  }
  if (!date || !isAllowedRequestDate(date)) return { error: "Invalid date" as const };
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
  const ephemeral = Boolean(preview) || (Boolean(random) && freeplayEnabled(c.env));
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
  const target = await resolveTarget(c.env, body.date, body.preview, body.random);
  if ("error" in target) return c.json({ error: target.error }, 400);
  const guess = await getDishById(c.env.DB, Number(body.dishId));
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
