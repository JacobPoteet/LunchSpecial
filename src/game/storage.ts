// localStorage persistence: today's round + lifetime stats. No accounts.

import type { GuessFeedback } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";

export type GameStatus = "playing" | "won" | "lost";

export interface RoundState {
  date: string;
  status: GameStatus;
  guesses: GuessFeedback[];
  clues: { index: number; text: string }[];
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

export function hasSeenHowTo(): boolean {
  return localStorage.getItem(HOWTO_KEY) === "1";
}

export function markHowToSeen(): void {
  localStorage.setItem(HOWTO_KEY, "1");
}
