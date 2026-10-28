// Which Special a request is playing — shared by every route that compares a
// guess to it: /daily, /guess and /reveal in routes/public.ts and the Kids' Menu
// in routes/kidsmenu.ts.

import { verifyToken } from "./auth";
import { getDishById, getDishBySlug, getSeededDish, getTargetDish } from "./db";
import { isPlayableDate } from "./game";
import { playerError } from "../shared/errors";

/**
 * Resolve the Special being played. Precedence: a preview token (admin test
 * play), then a named dish slug (playtesting), then a random-dish seed (free
 * play / "random recipe"), then a scheduled date — today's daily or any earlier
 * puzzle from the archive.
 */
export async function resolveTarget(
  env: Env,
  date: string | undefined,
  preview: string | undefined,
  random: string | undefined,
  special: string | undefined,
) {
  if (preview) {
    const payload = await verifyToken(preview, env.SESSION_SECRET);
    // Digits only after the prefix: a drink preview (`preview:drink:5`) shares
    // the prefix and must be refused here, not looked up as dish NaN.
    const id = /^preview:(\d+)$/.exec(payload ?? "")?.[1];
    if (!id) return playerError("Invalid or expired preview link", "bad_link");
    const dish = await getDishById(env.DB, Number(id));
    return dish ? { dish, rehearsal: true } : playerError("Preview dish not found", "not_found");
  }
  if (special) {
    // A dish named outright (`?special=<slug>` — `npm run ramen` and friends).
    // Spoiler-free for the same reason `random` is: it never reads the
    // schedule, so it says nothing about which day serves what. The slugs it
    // takes are already public in /api/dishes.
    const dish = await getDishBySlug(env.DB, special);
    return dish ? { dish, rehearsal: true } : playerError(`No dish with slug "${special}"`, "not_found");
  }
  if (random) {
    // A random dish (deterministic per seed). Spoiler-free — it never touches
    // the schedule — so, unlike a dated request, it needs no gating.
    const dish = await getSeededDish(env.DB, random);
    return dish ? { dish, rehearsal: false } : playerError("No dish available", "no_dish");
  }
  // A dated request: today's daily, or a past puzzle replayed from the archive.
  // Future dates are rejected so upcoming Specials aren't spoiled.
  if (!date || !isPlayableDate(date)) return playerError("Invalid date", "bad_date");
  const dish = await getTargetDish(env.DB, date);
  return dish ? { dish, rehearsal: false } : playerError("No dish available", "no_dish");
}
