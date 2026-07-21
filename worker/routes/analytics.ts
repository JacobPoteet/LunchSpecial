// Anonymous engagement beacons. Fire-and-forget from the client; no auth
// (same client-trust model as the rest of the game). One row per round, keyed
// by a client-generated round_id. Never records guess content.

import { Hono } from "hono";
import { MAX_GUESSES, ROUND_KINDS, SURFACES, type RoundKind, type Surface } from "../../shared/types";
import { isValidDateString } from "../game";

const app = new Hono<{ Bindings: Env }>();

interface Base {
  roundId: string;
  puzzleNumber: number;
  date: string;
  kind: RoundKind;
  surface: Surface;
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
  await c.env.DB.prepare(
    `INSERT INTO analytics_rounds (round_id, puzzle_number, play_date, kind, surface, player_id, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(round_id) DO NOTHING`,
  )
    .bind(b.roundId, b.puzzleNumber, b.date, b.kind, b.surface, playerId)
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
  // records. `kind`/`surface` are only set on insert — a prior /start already fixed them.
  // `completed_at` keeps the FIRST completion time (a replayed beacon must not
  // move it) — it's what the admin activity feed timestamps the event with.
  await c.env.DB.prepare(
    `INSERT INTO analytics_rounds (round_id, puzzle_number, play_date, kind, surface, started_at, guesses, solved, completed, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, 1, datetime('now'), datetime('now'))
     ON CONFLICT(round_id) DO UPDATE SET
       guesses = excluded.guesses, solved = excluded.solved, completed = 1,
       completed_at = COALESCE(analytics_rounds.completed_at, excluded.completed_at),
       updated_at = excluded.updated_at`,
  )
    .bind(b.roundId, b.puzzleNumber, b.date, b.kind, b.surface, guesses, solved)
    .run();
  return c.json({ ok: true });
});

app.post("/share", async (c) => {
  const b = base(await c.req.json().catch(() => null));
  if (!b) return c.json({ error: "Invalid analytics payload" }, 400);
  // Idempotent: re-sharing just re-sets the flag. `shared_at` keeps the first
  // share's time, like `completed_at` above.
  await c.env.DB.prepare(
    `INSERT INTO analytics_rounds (round_id, puzzle_number, play_date, kind, surface, started_at, shared, shared_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), 1, datetime('now'), datetime('now'))
     ON CONFLICT(round_id) DO UPDATE SET shared = 1,
       shared_at = COALESCE(analytics_rounds.shared_at, excluded.shared_at),
       updated_at = excluded.updated_at`,
  )
    .bind(b.roundId, b.puzzleNumber, b.date, b.kind, b.surface)
    .run();
  return c.json({ ok: true });
});

export default app;
