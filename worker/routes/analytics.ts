// Anonymous engagement beacons. Fire-and-forget from the client; no auth
// (same client-trust model as the rest of the game). One row per round, keyed
// by a client-generated round_id. Never records guess content.

import { Hono, type Context } from "hono";
import { MAX_GUESSES, ROUND_KINDS, SURFACES, type RoundKind, type Surface } from "../../shared/types";
import { getSeededDish, getTargetDish } from "../db";
import { isValidDateString } from "../game";

const app = new Hono<{ Bindings: Env }>();

interface Base {
  roundId: string;
  puzzleNumber: number;
  date: string;
  kind: RoundKind;
  surface: Surface;
}

/**
 * The dish this round played, resolved the same way gameplay does: a `random`
 * (Chef's Choice) round is a deterministic pick from its `seed`; every other
 * kind is the scheduled dish (or the date's deterministic fallback). Stored on
 * the row so the admin feed can name the dish for random rounds, whose dish is
 * never in the `schedule` table. Best-effort — a lookup miss just stores NULL
 * (the feed still falls back to the schedule join for scheduled kinds).
 */
async function resolveDishId(env: Env, kind: RoundKind, date: string, seed: string | null): Promise<number | null> {
  try {
    const dish = kind === "random" ? (seed ? await getSeededDish(env.DB, seed) : null) : await getTargetDish(env.DB, date);
    return dish?.id ?? null;
  } catch {
    return null; // analytics must never break gameplay
  }
}

/**
 * The country this beacon came from (GitHub #92), as Cloudflare's edge resolved
 * it: ISO 3166-1 alpha-2, or one of its two non-country answers — `T1` (Tor exit)
 * and `XX` (couldn't be determined).
 *
 * Read from the request rather than the payload on purpose. The client has no
 * say in it (nothing to spoof, no extra bytes on a fire-and-forget beacon), and
 * `request.cf` is populated for every request that reaches the Worker. Local dev
 * and any unexpected value fall through to null, which the dashboard reports as
 * untracked rather than as an unknown country — the same "unmeasured, not zero"
 * rule the player split follows.
 */
function countryOf(c: Context<{ Bindings: Env }>): string | null {
  const cf = (c.req.raw as { cf?: { country?: unknown } }).cf;
  const raw = typeof cf?.country === "string" ? cf.country : c.req.header("CF-IPCountry");
  const code = raw?.trim().toUpperCase();
  return code && /^[A-Z0-9]{2}$/.test(code) ? code : null;
}

/** The `?random=<seed>` a random round was played on, if the client sent it. */
function seedOf(body: unknown): string | null {
  const s = (body as { seed?: unknown } | null)?.seed;
  return typeof s === "string" && s.length > 0 && s.length <= 64 ? s : null;
}

/** Validate the fields every beacon carries. */
function base(body: unknown): Base | null {
  const b = body as (Partial<Base> & { kind?: string; surface?: string }) | null;
  if (!b || typeof b.roundId !== "string" || b.roundId.length < 8 || b.roundId.length > 64) return null;
  const puzzleNumber = Number(b.puzzleNumber);
  if (!Number.isInteger(puzzleNumber) || puzzleNumber < 0) return null;
  if (typeof b.date !== "string" || !isValidDateString(b.date)) return null;
  // Older clients omit `kind`; treat those as the daily (the only kind that
  // used to fire beacons). Anything not in the enum is rejected.
  const kind = b.kind === undefined ? "daily" : (b.kind as RoundKind);
  if (!ROUND_KINDS.includes(kind)) return null;
  // Older clients (pre-Discord split) omit `surface`; default to the open web.
  const surface = b.surface === undefined ? "web" : (b.surface as Surface);
  if (!SURFACES.includes(surface)) return null;
  return { roundId: b.roundId, puzzleNumber, date: b.date, kind, surface };
}

app.post("/start", async (c) => {
  const raw = (await c.req.json().catch(() => null)) as (Partial<Base> & { playerId?: unknown }) | null;
  const b = base(raw);
  if (!b) return c.json({ error: "Invalid analytics payload" }, 400);
  // Anonymous per-device id (random UUID from localStorage). Optional — older
  // clients omit it — so a bad/absent value just stores NULL. Powers the
  // new-vs-returning player split in the admin dashboard.
  const playerId =
    typeof raw!.playerId === "string" && raw!.playerId.length >= 8 && raw!.playerId.length <= 64
      ? raw!.playerId
      : null;
  const dishId = await resolveDishId(c.env, b.kind, b.date, seedOf(raw));
  await c.env.DB.prepare(
    `INSERT INTO analytics_rounds (round_id, puzzle_number, play_date, kind, surface, country, player_id, dish_id, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(round_id) DO NOTHING`,
  )
    .bind(b.roundId, b.puzzleNumber, b.date, b.kind, b.surface, countryOf(c), playerId, dishId)
    .run();
  return c.json({ ok: true });
});

app.post("/complete", async (c) => {
  const raw = (await c.req.json().catch(() => null)) as (Partial<Base> & { guesses?: number; solved?: boolean }) | null;
  const b = base(raw);
  if (!b) return c.json({ error: "Invalid analytics payload" }, 400);
  const guesses = Number(raw!.guesses);
  if (!Number.isInteger(guesses) || guesses < 1 || guesses > MAX_GUESSES) {
    return c.json({ error: "guesses must be 1-6" }, 400);
  }
  const solved = raw!.solved === true ? 1 : 0;
  // Upsert so a missed /start (e.g. a round begun before analytics shipped) still
  // records. `kind`/`surface`/`country`/`dish_id` are only set on insert — a prior
  // /start already fixed them, so the conflict path leaves them alone. `completed_at`
  // keeps the FIRST completion time (a replayed beacon must not move it) — it's
  // what the admin activity feed timestamps the event with.
  const dishId = await resolveDishId(c.env, b.kind, b.date, seedOf(raw));
  await c.env.DB.prepare(
    `INSERT INTO analytics_rounds (round_id, puzzle_number, play_date, kind, surface, country, dish_id, started_at, guesses, solved, completed, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, 1, datetime('now'), datetime('now'))
     ON CONFLICT(round_id) DO UPDATE SET
       guesses = excluded.guesses, solved = excluded.solved, completed = 1,
       completed_at = COALESCE(analytics_rounds.completed_at, excluded.completed_at),
       updated_at = excluded.updated_at`,
  )
    .bind(b.roundId, b.puzzleNumber, b.date, b.kind, b.surface, countryOf(c), dishId, guesses, solved)
    .run();
  return c.json({ ok: true });
});

app.post("/share", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const b = base(raw);
  if (!b) return c.json({ error: "Invalid analytics payload" }, 400);
  // Idempotent: re-sharing just re-sets the flag. `shared_at` keeps the first
  // share's time, like `completed_at` above. `dish_id`/`country` are insert-only;
  // only the share button's kinds (daily/leftover) reach here, so a date lookup
  // suffices.
  const dishId = await resolveDishId(c.env, b.kind, b.date, seedOf(raw));
  await c.env.DB.prepare(
    `INSERT INTO analytics_rounds (round_id, puzzle_number, play_date, kind, surface, country, dish_id, started_at, shared, shared_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 1, datetime('now'), datetime('now'))
     ON CONFLICT(round_id) DO UPDATE SET shared = 1,
       shared_at = COALESCE(analytics_rounds.shared_at, excluded.shared_at),
       updated_at = excluded.updated_at`,
  )
    .bind(b.roundId, b.puzzleNumber, b.date, b.kind, b.surface, countryOf(c), dishId)
    .run();
  return c.json({ ok: true });
});

export default app;
