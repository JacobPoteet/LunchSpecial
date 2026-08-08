// localStorage persistence: today's round + lifetime stats. No accounts.

import type { GuessFeedback } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";

export type GameStatus = "playing" | "won" | "lost";

export interface RoundState {
  date: string;
  status: GameStatus;
  guesses: GuessFeedback[];
  clues: { index: number; text: string }[];
  /** Anonymous analytics round id; set when the board first opens. */
  analyticsId?: string;
}

export interface Stats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  /** dist[i] = wins in i+1 guesses */
  dist: number[];
  lastCompletedDate: string | null;
}

const STATE_KEY = "lunch-special:round";
const STATS_KEY = "lunch-special:stats";
const HOWTO_KEY = "lunch-special:howto-seen";
const ARCHIVE_KEY = "lunch-special:archive";
const PLAYER_KEY = "lunch-special:player";
const ANNOUNCEMENTS_KEY = "lunch-special:announcements";

/**
 * Stable, anonymous per-device id (a random UUID) kept in localStorage. Sent with
 * the "start" analytics beacon so the dashboard can tell new players (first-ever
 * play) from returning ones. No accounts, no personal data — same anonymous model
 * as the round id. Generated lazily on first play and reused forever after.
 */
export function getPlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(PLAYER_KEY, id);
    return id;
  } catch {
    // Storage blocked (e.g. private mode) — fall back to an ephemeral id so the
    // beacon still has a shape; it just won't persist across sessions.
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Read-only peek at this device's player id — null if it's never played here.
 * The admin activity feed uses it to filter its own test rounds in or out;
 * unlike getPlayerId() it must NOT mint an id, or merely opening the dashboard
 * would create one that appears in zero rows.
 */
export function peekPlayerId(): string | null {
  try {
    return localStorage.getItem(PLAYER_KEY);
  } catch {
    return null;
  }
}

/** sessionStorage key for the ET day this tab has already reported a visit for. */
const SEATED_KEY = "lunch-special:seated";

/**
 * Whether the visit beacon still needs to fire for `day` on this device.
 *
 * Two ledgers, the same shape the announcement modal uses: this one decides
 * whether to *send*, the server's composite primary key decides what to *count*.
 * Neither is sufficient alone — sessionStorage is per-tab and cleared often, so
 * it can't be the source of truth for a visitor count; and without it every mode
 * switch (which navigates by assigning a URL) would fire a redundant beacon.
 *
 * sessionStorage rather than localStorage on purpose: a new browser session is a
 * new arrival worth re-reporting, and the server deduplicates by day anyway, so
 * the failure mode is one wasted request rather than a missed visitor.
 */
export function markSeated(day: string): boolean {
  try {
    if (sessionStorage.getItem(SEATED_KEY) === day) return false;
    sessionStorage.setItem(SEATED_KEY, day);
    return true;
  } catch {
    // Storage blocked — send it and let the server's primary key dedupe.
    return true;
  }
}

export function emptyRound(date: string): RoundState {
  return { date, status: "playing", guesses: [], clues: [] };
}

export function loadRound(date: string): RoundState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RoundState;
      if (parsed.date === date && Array.isArray(parsed.guesses)) return parsed;
    }
  } catch {
    // corrupted state — start fresh
  }
  return emptyRound(date);
}

export function saveRound(state: RoundState): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function emptyStats(): Stats {
  return {
    played: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    dist: Array.from({ length: MAX_GUESSES }, () => 0),
    lastCompletedDate: null,
  };
}

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Stats;
      if (typeof parsed.played === "number" && Array.isArray(parsed.dist)) return parsed;
    }
  } catch {
    // corrupted stats — start fresh
  }
  return emptyStats();
}

function previousDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** Record a finished round exactly once per date. */
export function recordResult(date: string, won: boolean, guessCount: number): Stats {
  const stats = loadStats();
  if (stats.lastCompletedDate === date) return stats;
  stats.played += 1;
  if (won) {
    stats.wins += 1;
    stats.currentStreak = stats.lastCompletedDate === previousDate(date) ? stats.currentStreak + 1 : 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    if (guessCount >= 1 && guessCount <= stats.dist.length) stats.dist[guessCount - 1] += 1;
  } else {
    stats.currentStreak = 0;
  }
  stats.lastCompletedDate = date;
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  return stats;
}

// ---- Archive rounds (previous days) ----
//
// Rounds for past puzzles, keyed by date, kept separate from today's round and
// from lifetime Stats — replaying the archive never touches the daily streak.

export function loadArchive(): Record<string, RoundState> {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, RoundState>;
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    // corrupted archive — start fresh
  }
  return {};
}

export function loadArchiveRound(date: string): RoundState {
  const stored = loadArchive()[date];
  return stored && Array.isArray(stored.guesses) ? stored : emptyRound(date);
}

export function saveArchiveRound(state: RoundState): void {
  const archive = loadArchive();
  archive[state.date] = state;
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
}

/** Finished-or-in-progress status per archive date, for the calendar. */
export function archiveStatuses(): Record<string, GameStatus> {
  const out: Record<string, GameStatus> = {};
  for (const [date, round] of Object.entries(loadArchive())) out[date] = round.status;
  return out;
}

export function hasSeenHowTo(): boolean {
  return localStorage.getItem(HOWTO_KEY) === "1";
}

export function markHowToSeen(): void {
  localStorage.setItem(HOWTO_KEY, "1");
}

// ---- Announcements ----
//
// Which notices this device has already been shown. Kept here rather than asked
// of the server so the modal can decide instantly, offline, with no round-trip
// between the how-to closing and the notice opening. The server keeps its own
// per-device row for the admin's reach numbers (announcement_views); this is
// only about not showing the same note twice.

/** Ids to remember. Notices are short-lived, so an old id can safely fall off. */
const SEEN_ANNOUNCEMENTS_MAX = 100;

export function seenAnnouncements(): number[] {
  try {
    const raw = localStorage.getItem(ANNOUNCEMENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((n): n is number => typeof n === "number");
    }
  } catch {
    // corrupted list — treat everything as unseen
  }
  return [];
}

/** Remember a notice as shown. Idempotent; keeps the most recent ids. */
export function rememberAnnouncementSeen(id: number): void {
  try {
    const seen = seenAnnouncements();
    if (seen.includes(id)) return;
    const next = [...seen, id].slice(-SEEN_ANNOUNCEMENTS_MAX);
    localStorage.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked — the player may see the notice again next visit. That's
    // a better failure than crashing the board over a note.
  }
}

/**
 * Whether this device counts as a *returning* player for notice eligibility:
 * it has finished at least one game here. Someone halfway through their first
 * round is still new, which is the distinction the audience toggle is for.
 */
export function isReturningPlayer(): boolean {
  return loadStats().played > 0;
}
