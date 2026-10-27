// A Discord player's progress, merged (GitHub #251).
//
// The Discord mobile app drops the Activity's storage whenever the app itself
// is quit, so a streak lived only until the next cold launch. For a player who
// authorizes, the Worker keeps a copy of the keys below under a one-way hash of
// their Discord id (worker/playerid.ts), and the client puts it back before the
// board mounts.
//
// This file is the one place that decides what survives when two copies of the
// same player's progress meet: the phone's localStorage and the server's copy,
// or two phones. PURE: both halves import it. Every rule picks a whole record
// from one side, or unions a set. Nothing sums, so a copy replayed twice cannot
// inflate a count, and a merge of a copy with itself changes nothing.

/** The localStorage keys that travel, and nothing else. A key not named here is never sent. */
export const PROGRESS_KEYS = [
  "lunch-special:round",
  "lunch-special:stats",
  "lunch-special:archive",
  "lunch-special:howto-seen",
  "lunch-special:kids-menu-seen",
  "lunch-special:nightcap",
  "lunch-special:night-stats",
  "lunch-special:afterdark-seen",
  "lunch-special:announcements",
  "lunch-special:sound",
] as const;
export type ProgressKey = (typeof PROGRESS_KEYS)[number];

/** Raw localStorage strings by key. Absent means the copy has nothing under it. */
export type Progress = Partial<Record<ProgressKey, string>>;

/** Everything one copy may weigh. A real one is a few KB; this is the ceiling. */
export const MAX_PROGRESS_BYTES = 128 * 1024;

const isKey = (k: string): k is ProgressKey => (PROGRESS_KEYS as readonly string[]).includes(k);

/** The incoming object kept to known keys and string values; null when it is not an object or is too big. */
export function normalizeProgress(raw: unknown): Progress | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const out: Progress = {};
  let size = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (!isKey(key) || typeof value !== "string") continue;
    size += key.length + value.length;
    if (size > MAX_PROGRESS_BYTES) return null;
    out[key] = value;
  }
  return out;
}

function parse(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

interface Played {
  played: number;
  [last: string]: unknown;
}

/** The record with the later last-completed day; ties go to the one that has played more. */
function laterStats(a: string | undefined, b: string | undefined, lastKey: string): string | undefined {
  const pa = parse(a) as Played | undefined;
  const pb = parse(b) as Played | undefined;
  const okA = !!pa && typeof pa.played === "number" && Array.isArray((pa as { dist?: unknown }).dist);
  const okB = !!pb && typeof pb.played === "number" && Array.isArray((pb as { dist?: unknown }).dist);
  if (!okA) return okB ? b : undefined;
  if (!okB) return a;
  const la = typeof pa![lastKey] === "string" ? (pa![lastKey] as string) : "";
  const lb = typeof pb![lastKey] === "string" ? (pb![lastKey] as string) : "";
  if (la !== lb) return la > lb ? a : b;
  return pa!.played >= pb!.played ? a : b;
}

interface Board {
  status?: unknown;
  guesses?: unknown;
}

/** Finished beats in progress; then the board with more guesses on it. */
function fuller(a: Board, b: Board): Board {
  const doneA = a.status === "won" || a.status === "lost";
  const doneB = b.status === "won" || b.status === "lost";
  if (doneA !== doneB) return doneA ? a : b;
  const na = Array.isArray(a.guesses) ? a.guesses.length : 0;
  const nb = Array.isArray(b.guesses) ? b.guesses.length : 0;
  return na >= nb ? a : b;
}

/** The single current board (today's round, tonight's Nightcap): the later day, then the fuller board. */
function laterBoard(a: string | undefined, b: string | undefined, dayKey: string): string | undefined {
  const pa = parse(a) as (Board & Record<string, unknown>) | undefined;
  const pb = parse(b) as (Board & Record<string, unknown>) | undefined;
  const okA = !!pa && typeof pa[dayKey] === "string" && Array.isArray(pa.guesses);
  const okB = !!pb && typeof pb[dayKey] === "string" && Array.isArray(pb.guesses);
  if (!okA) return okB ? b : undefined;
  if (!okB) return a;
  const da = pa![dayKey] as string;
  const db = pb![dayKey] as string;
  if (da !== db) return da > db ? a : b;
  return fuller(pa!, pb!) === pa ? a : b;
}

/** Union of the two archives by date, the fuller board winning a collision. */
function unionArchive(a: string | undefined, b: string | undefined): string | undefined {
  const pa = parse(a);
  const pb = parse(b);
  const objA = typeof pa === "object" && pa !== null && !Array.isArray(pa) ? (pa as Record<string, Board>) : null;
  const objB = typeof pb === "object" && pb !== null && !Array.isArray(pb) ? (pb as Record<string, Board>) : null;
  if (!objA) return objB ? b : undefined;
  if (!objB) return a;
  const out: Record<string, Board> = { ...objA };
  for (const [date, board] of Object.entries(objB)) {
    const held = out[date];
    out[date] = held ? fuller(held, board) : board;
  }
  return JSON.stringify(out);
}

/** Union of two id lists, in order, keeping the most recent ones. */
function unionIds(a: string | undefined, b: string | undefined): string | undefined {
  const pa = parse(a);
  const pb = parse(b);
  const listA = Array.isArray(pa) ? pa.filter((n): n is number => typeof n === "number") : null;
  const listB = Array.isArray(pb) ? pb.filter((n): n is number => typeof n === "number") : null;
  if (!listA) return listB ? b : undefined;
  if (!listB) return a;
  return JSON.stringify([...new Set([...listA, ...listB])].slice(-100));
}

/** A flag nobody un-sets: set on either side is set. */
function eitherFlag(a: string | undefined, b: string | undefined): string | undefined {
  return a === "1" || b === "1" ? "1" : (a ?? b);
}

/** Sound prefs: the toggle count says whose mute was touched more recently in spirit; a wins ties. */
function soundPrefs(a: string | undefined, b: string | undefined): string | undefined {
  const pa = parse(a) as { toggles?: unknown } | undefined;
  const pb = parse(b) as { toggles?: unknown } | undefined;
  const okA = typeof pa === "object" && pa !== null;
  const okB = typeof pb === "object" && pb !== null;
  if (!okA) return okB ? b : undefined;
  if (!okB) return a;
  const ta = typeof pa!.toggles === "number" ? pa!.toggles : 0;
  const tb = typeof pb!.toggles === "number" ? pb!.toggles : 0;
  return tb > ta ? b : a;
}

/**
 * Merge two copies of one player's progress. Symmetric except where a rule
 * names a tie-break (it prefers `a`, which callers pass as the copy they hold).
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const out: Progress = {};
  const set = (key: ProgressKey, value: string | undefined) => {
    if (value !== undefined) out[key] = value;
  };
  set("lunch-special:round", laterBoard(a["lunch-special:round"], b["lunch-special:round"], "date"));
  set("lunch-special:stats", laterStats(a["lunch-special:stats"], b["lunch-special:stats"], "lastCompletedDate"));
  set("lunch-special:archive", unionArchive(a["lunch-special:archive"], b["lunch-special:archive"]));
  set("lunch-special:howto-seen", eitherFlag(a["lunch-special:howto-seen"], b["lunch-special:howto-seen"]));
  set(
    "lunch-special:kids-menu-seen",
    eitherFlag(a["lunch-special:kids-menu-seen"], b["lunch-special:kids-menu-seen"]),
  );
  set("lunch-special:nightcap", laterBoard(a["lunch-special:nightcap"], b["lunch-special:nightcap"], "night"));
  set(
    "lunch-special:night-stats",
    laterStats(a["lunch-special:night-stats"], b["lunch-special:night-stats"], "lastCompletedNight"),
  );
  set(
    "lunch-special:afterdark-seen",
    eitherFlag(a["lunch-special:afterdark-seen"], b["lunch-special:afterdark-seen"]),
  );
  set("lunch-special:announcements", unionIds(a["lunch-special:announcements"], b["lunch-special:announcements"]));
  set("lunch-special:sound", soundPrefs(a["lunch-special:sound"], b["lunch-special:sound"]));
  return out;
}

/** Whether a copy holds anything worth sending: a player who has done nothing yet has no row to write. */
export function hasProgress(p: Progress): boolean {
  return Object.keys(p).length > 0;
}
