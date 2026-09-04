// After Dark: the public bar API, mounted at /api/night.
//
// Deliberately its own router rather than a fifth branch in the daily's
// resolveTarget(). The two modes share no table, no clue count and no guess
// ceiling, and the one thing they must never share is a pool — a drink round
// that could serve a dish, or be guessed with one, is the whole failure this
// separation exists to prevent.
//
// Path note: "/night" carries none of the shapes ad blockers match. See the
// beacon-path warning in worker/index.ts.

import { Hono } from "hono";
import type {
  DrinkGuessFeedback,
  DrinkPoolEntry,
  NightcapInfo,
  NightcapReveal,
} from "../../shared/types";
import { DRINK_CLUE_COUNT, DRINK_MAX_GUESSES } from "../../shared/types";
import { isPlayableNight, nightNumber } from "../../shared/night";
import { verifyToken } from "../auth";
import { serverToday } from "../db";
import { getCoasters, getDrinkById, getDrinkBySlug, getTargetDrink } from "../drinkdb";
import { computeDrinkFeedback } from "../nightcap";

const app = new Hono<{ Bindings: Env }>();

/** The preview-token payload prefix for a drink. See POST /api/admin/preview. */
const DRINK_PREVIEW = "preview:drink:";

/**
 * Which drink is being played. Precedence: an admin preview token, then a named
 * slug (playtesting), then the night itself.
 *
 * There is no `random` branch. Chef's Choice has no bar equivalent by design —
 * one drink a night and no archive is the whole shape of the mode, and a
 * spoiler-free random pour would quietly hand players a second one.
 */
async function resolveDrink(
  env: Env,
  night: string | undefined,
  preview: string | undefined,
  pinned: string | undefined,
) {
  if (preview) {
    const payload = await verifyToken(preview, env.SESSION_SECRET);
    if (!payload || !payload.startsWith(DRINK_PREVIEW)) {
      return { error: "Invalid or expired preview link" as const };
    }
    const drink = await getDrinkById(env.DB, Number(payload.slice(DRINK_PREVIEW.length)));
    return drink ? { drink } : { error: "Preview drink not found" as const };
  }
  if (pinned) {
    // A drink named outright (`?nightcap=<slug>`, npm run negroni). Spoiler-free
    // for the same reason the dish equivalent is: it never reads the schedule,
    // so it says nothing about which night pours what.
    const drink = await getDrinkBySlug(env.DB, pinned);
    return drink ? { drink } : { error: `No drink with slug "${pinned}"` as const };
  }
  // The Worker cannot know the player's local time and does not try. It checks
  // the claimed night is within a day of ET's, which covers every real UTC
  // offset. See isPlayableNight.
  if (!night || !isPlayableNight(night, serverToday())) return { error: "The bar is closed" as const };
  const drink = await getTargetDrink(env.DB, night);
  return drink ? { drink } : { error: "Nothing on tap" as const };
}

/**
 * The guess pool. A separate list from /api/dishes, which is the point: you
 * cannot order a hamburger at the bar, and the autocomplete should not offer
 * you one.
 */
app.get("/drinks", async (c) => {
  const res = await c.env.DB.prepare(
    "SELECT id, name, slug FROM drinks WHERE is_active = 1 ORDER BY name",
  ).all<DrinkPoolEntry>();
  return c.json(res.results);
});

app.get("/info", async (c) => {
  const night = c.req.query("night");
  const target = await resolveDrink(c.env, night, c.req.query("preview"), c.req.query("nightcap"));
  if ("error" in target) return c.json({ error: target.error }, 400);
  // A preview or a playtest keeps its night's real number when it has a real
  // night, the same dressing the daily's rehearsal modes get.
  const numbered = !!night && isPlayableNight(night, serverToday());
  const info: NightcapInfo = {
    night: night ?? "",
    nightNumber: numbered ? nightNumber(night) : 0,
    maxGuesses: DRINK_MAX_GUESSES,
    ingredientCount: target.drink.ingredients.length,
  };
  return c.json(info);
});

app.post("/guess", async (c) => {
  let body: {
    night?: string;
    drinkId?: number;
    guessNumber?: number;
    preview?: string;
    nightcap?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const guessNumber = Number(body.guessNumber);
  if (!Number.isInteger(guessNumber) || guessNumber < 1 || guessNumber > DRINK_MAX_GUESSES) {
    return c.json({ error: `guessNumber must be 1-${DRINK_MAX_GUESSES}` }, 400);
  }
  const drinkId = Number(body.drinkId);
  if (!Number.isInteger(drinkId)) return c.json({ error: "Unknown drink" }, 400);

  const [target, guess] = await Promise.all([
    resolveDrink(c.env, body.night, body.preview, body.nightcap),
    getDrinkById(c.env.DB, drinkId),
  ]);
  if ("error" in target) return c.json({ error: target.error }, 400);
  if (!guess) return c.json({ error: "Unknown drink" }, 400);

  const feedback: DrinkGuessFeedback = computeDrinkFeedback(guess, target.drink);
  // Coaster N lands after miss N, for N = 1..3. On the fourth guess the round is
  // over either way, so there is nothing to slide across.
  if (!feedback.correct && guessNumber <= DRINK_CLUE_COUNT) {
    const coaster = await c.env.DB.prepare(
      "SELECT text FROM drink_clues WHERE drink_id = ? AND order_index = ?",
    )
      .bind(target.drink.id, guessNumber)
      .first<{ text: string }>();
    if (coaster) feedback.coaster = { index: guessNumber, text: coaster.text };
  }
  return c.json(feedback);
});

// Client-initiated once the round is over, same trust model as the daily.
app.get("/reveal", async (c) => {
  const target = await resolveDrink(
    c.env,
    c.req.query("night"),
    c.req.query("preview"),
    c.req.query("nightcap"),
  );
  if ("error" in target) return c.json({ error: target.error }, 400);
  const d = target.drink;
  const reveal: NightcapReveal = {
    id: d.id,
    name: d.name,
    country: d.country,
    region: d.region,
    spirit: d.spirit,
    temperature: d.temperature,
    profile: d.profile,
    isAlcoholic: d.isAlcoholic,
    ingredients: d.ingredients,
    coasters: await getCoasters(c.env.DB, d.id),
    isFanSubmission: d.isFanSubmission,
  };
  return c.json(reveal);
});

export default app;
