// Anonymous engagement beacons. Fire-and-forget from the client; no auth
// (same client-trust model as the rest of the game). One row per round, keyed
// by a client-generated round_id. Never records guess content.

import { Hono, type Context } from "hono";
import { normalizeSource, SOURCE_DIRECT } from "../../shared/attribution";
import { MAX_GUESSES, ROUND_KINDS, SURFACES, type RoundKind, type Surface } from "../../shared/types";
import { getSeededDish, getTargetDish, serverToday } from "../db";
import { getTargetDrink } from "../drinkdb";
import { isValidDateString } from "../game";

const app = new Hono<{ Bindings: Env }>();

interface Base {
  roundId: string;
  puzzleNumber: number;
  /**
   * The ET play date, or -- on a `nightcap` -- the LOCAL night key. Stored in
   * `play_date` either way, which is why nothing may group that column across
   * kinds. See migrations/0041.
   */
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
  if (kind === "nightcap") return null; // a Nightcap has a drink, not a dish
  try {
    const dish = kind === "random" ? (seed ? await getSeededDish(env.DB, seed) : null) : await getTargetDish(env.DB, date);
    return dish?.id ?? null;
  } catch {
    return null; // analytics must never break gameplay
  }
}

/**
 * The drink a Nightcap played, resolved the way the bar resolves it: the booked
 * pour for that night, or the night's deterministic fallback. `date` is the
 * LOCAL night key here, not an ET day.
 *
 * Null for every other kind, and null on any lookup miss — a round with no drink
 * is reported as untracked rather than assigned to one, the same rule dish_id
 * follows.
 */
async function resolveDrinkId(env: Env, kind: RoundKind, night: string): Promise<number | null> {
  if (kind !== "nightcap") return null;
  try {
    const drink = await getTargetDrink(env.DB, night);
    return drink?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * The device's UTC offset in minutes, east-positive, clamped to the real range.
 *
 * Client-supplied, like `source`, so it is re-validated here regardless of what
 * arrived. Anything outside UTC-12..UTC+14 is dropped to NULL rather than
 * stored, because an impossible offset in the hour profile is worse than a
 * missing one: a gap reports as unmeasured, a bad value reports as a place
 * nobody lives.
 */
function tzOffsetOf(body: unknown): number | null {
  const raw = (body as { tzOffset?: unknown } | null)?.tzOffset;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const mins = Math.trunc(raw);
  return mins >= -720 && mins <= 840 ? mins : null;
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

/**
 * A device opened a real, playable round today — the top of the funnel
 * (migrations/0020).
 *
 * "Started" means the first submitted guess, so without this everyone who loads
 * the game and never guesses is invisible, and "did more visitors actually play"
 * is unanswerable. This fires on the board being ready instead.
 *
 * Deliberately thin: the client sends only its anonymous device id and surface.
 * The **day is stamped here**, not sent — a visit belongs to the ET day it
 * happened on, which the client has no authority over — and the country comes
 * from the edge like every other beacon. One row per device per day, so the
 * INSERT is idempotent and the client can fire whenever it likes.
 *
 * Path is "/seated" (a guest is seated before they order) for the same reason as
 * every other path here: "visit", "view", "pageview" and "track" are the shapes
 * ad blockers match, and a blocked fire-and-forget beacon is indistinguishable
 * from a delivered one — those players would simply never appear.
 */
app.post("/seated", async (c) => {
  const raw = (await c.req.json().catch(() => null)) as {
    playerId?: unknown;
    surface?: unknown;
    source?: unknown;
  } | null;
  const playerId = raw?.playerId;
  // No usable device id means nothing to dedupe on, and a row per page load
  // would overcount visitors rather than undercount them. Drop it.
  if (typeof playerId !== "string" || playerId.length < 8 || playerId.length > 64) {
    return c.json({ error: "Invalid payload" }, 400);
  }
  const surface = SURFACES.includes(raw?.surface as never) ? (raw!.surface as Surface) : "web";
  // Where they came from (migrations/0024). Unlike every other field on every
  // other beacon, this one originates in a URL the player controls, so it is
  // re-normalised here regardless of what the client did with it — the client's
  // pass exists to survive an in-app navigation, not to be trusted. Absent or
  // malformed becomes `direct` rather than NULL, which is reserved for rows
  // written before the column existed.
  const source = normalizeSource(raw?.source) ?? SOURCE_DIRECT;
  // DO NOTHING, so the day's FIRST touch wins: a device that opened the game
  // directly this morning and clicked an ad at lunch keeps `direct`, because the
  // ad did not bring them here today.
  await c.env.DB.prepare(
    `INSERT INTO analytics_visits (visit_day, player_id, surface, country, source, first_seen_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(visit_day, player_id) DO NOTHING`,
  )
    .bind(serverToday(), playerId, surface, countryOf(c), source)
    .run();
  return c.json({ ok: true });
});

/**
 * The player reached for the mute button (migrations/0025).
 *
 * The one beacon here that isn't about a round, and the smallest thing on this
 * router on purpose. It records a *state* per device — where they ended up, and
 * how many times they changed their mind — because that's the whole of what's
 * interesting, and a row per press would be an ever-growing table answering a
 * question nobody asks twice.
 *
 * `toggles` is taken from the client rather than incremented here (`excluded`,
 * not `sound_prefs.toggles + 1`) so that a device whose row is missing — wiped
 * from the Activity tab, or never written because a beacon was blocked — comes
 * back with its real local count instead of restarting at one. The client's
 * localStorage is the ledger; this table is the copy. It's clamped because it's
 * client-supplied, and it is emphatically not a number anything depends on.
 */
app.post("/sound", async (c) => {
  const raw = (await c.req.json().catch(() => null)) as {
    playerId?: unknown;
    surface?: unknown;
    muted?: unknown;
    toggles?: unknown;
  } | null;
  const playerId = raw?.playerId;
  if (typeof playerId !== "string" || playerId.length < 8 || playerId.length > 64) {
    return c.json({ error: "Invalid payload" }, 400);
  }
  if (typeof raw?.muted !== "boolean") return c.json({ error: "Invalid payload" }, 400);
  const surface = SURFACES.includes(raw?.surface as never) ? (raw!.surface as Surface) : "web";
  const toggles =
    typeof raw.toggles === "number" && Number.isFinite(raw.toggles)
      ? Math.min(Math.max(Math.trunc(raw.toggles), 1), 100000)
      : 1;

  await c.env.DB.prepare(
    `INSERT INTO sound_prefs (player_id, muted, toggles, surface, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(player_id) DO UPDATE SET muted = excluded.muted,
       toggles = MAX(sound_prefs.toggles, excluded.toggles),
       surface = excluded.surface,
       updated_at = excluded.updated_at`,
  )
    .bind(playerId, raw.muted ? 1 : 0, toggles, surface)
    .run();
  return c.json({ ok: true });
});

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
  const [dishId, drinkId] = await Promise.all([
    resolveDishId(c.env, b.kind, b.date, seedOf(raw)),
    resolveDrinkId(c.env, b.kind, b.date),
  ]);
  await c.env.DB.prepare(
    `INSERT INTO analytics_rounds (round_id, puzzle_number, play_date, kind, surface, country, player_id, dish_id, drink_id, tz_offset, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(round_id) DO NOTHING`,
  )
    .bind(b.roundId, b.puzzleNumber, b.date, b.kind, b.surface, countryOf(c), playerId, dishId, drinkId, tzOffsetOf(raw))
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
  const [dishId, drinkId] = await Promise.all([
    resolveDishId(c.env, b.kind, b.date, seedOf(raw)),
    resolveDrinkId(c.env, b.kind, b.date),
  ]);
  await c.env.DB.prepare(
    `INSERT INTO analytics_rounds (round_id, puzzle_number, play_date, kind, surface, country, dish_id, drink_id, tz_offset, started_at, guesses, solved, completed, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, 1, datetime('now'), datetime('now'))
     ON CONFLICT(round_id) DO UPDATE SET
       guesses = excluded.guesses, solved = excluded.solved, completed = 1,
       completed_at = COALESCE(analytics_rounds.completed_at, excluded.completed_at),
       updated_at = excluded.updated_at`,
  )
    .bind(b.roundId, b.puzzleNumber, b.date, b.kind, b.surface, countryOf(c), dishId, drinkId, tzOffsetOf(raw), guesses, solved)
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
  const [dishId, drinkId] = await Promise.all([
    resolveDishId(c.env, b.kind, b.date, seedOf(raw)),
    resolveDrinkId(c.env, b.kind, b.date),
  ]);
  await c.env.DB.prepare(
    `INSERT INTO analytics_rounds (round_id, puzzle_number, play_date, kind, surface, country, dish_id, drink_id, started_at, shared, shared_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 1, datetime('now'), datetime('now'))
     ON CONFLICT(round_id) DO UPDATE SET shared = 1,
       shared_at = COALESCE(analytics_rounds.shared_at, excluded.shared_at),
       updated_at = excluded.updated_at`,
  )
    .bind(b.roundId, b.puzzleNumber, b.date, b.kind, b.surface, countryOf(c), dishId, drinkId)
    .run();
  return c.json({ ok: true });
});

export default app;
