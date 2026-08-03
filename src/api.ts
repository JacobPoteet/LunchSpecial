// Thin fetch wrappers around the public game API.

import type {
  Announcement,
  AnnouncementSeenInput,
  DailyInfo,
  DishRequestInput,
  DishSummary,
  GuessFeedback,
  RevealInfo,
  RoundKind,
  Surface,
} from "../shared/types";
import { gameToday } from "../shared/time";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    // A rejected fetch never reaches the server: offline, DNS, or a content
    // blocker cancelling the request in-browser. The raw TypeError reads as
    // "Failed to fetch", which tells a player nothing — name the likely causes
    // instead, the same way the admin client does.
    throw new Error("Couldn't reach the kitchen — check your connection or any ad/content blocker.");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body === null) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body;
}

function withParams(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export function fetchDishes(): Promise<DishSummary[]> {
  return request("/api/dishes");
}

export function fetchDaily(date: string, preview?: string, random?: string, special?: string): Promise<DailyInfo> {
  return request(withParams("/api/daily", { date, preview, random, special }));
}

export function postGuess(body: {
  date: string;
  dishId: number;
  guessNumber: number;
  preview?: string;
  random?: string;
  /** Playtest only: the slug of the dish this round was pinned to. */
  special?: string;
}): Promise<GuessFeedback> {
  return request("/api/guess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchReveal(date: string, preview?: string, random?: string, special?: string): Promise<RevealInfo> {
  return request(withParams("/api/reveal", { date, preview, random, special }));
}

/** Submit a player's dish suggestion for the menu (lands in the admin inbox). */
export function submitDishRequest(body: DishRequestInput): Promise<{ ok: true }> {
  return request("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Notices the diner has posted for this player. `returning` is this device's own
 * answer to "have I ever finished a game here" — the server uses it to withhold
 * returning-only notices from first-timers.
 */
export function fetchAnnouncements(returning: boolean): Promise<Announcement[]> {
  return request(withParams("/api/announcements", { returning: returning ? "1" : undefined }));
}

/**
 * Record that a notice reached this device. Fire-and-forget (`beacon` below) for
 * the same reason the round beacons are: a player reading a note from the
 * kitchen should never wait on, or be shown, a failed write. Deduped
 * server-side per device, so calling it twice costs nothing.
 */
export function markAnnouncementSeen(body: AnnouncementSeenInput): void {
  beacon("/api/announcements/seen", body);
}

/**
 * The current puzzle date as YYYY-MM-DD. Rolls over at midnight ET for every
 * player, regardless of their own timezone (GitHub #33), so everyone plays the
 * same Special at the same wall-clock moment.
 */
export function localToday(): string {
  return gameToday();
}

// ---- Anonymous analytics beacons (fire-and-forget; never block gameplay) ----
//
// These POST to "/api/rounds/*", deliberately not "/api/analytics/*": ad
// blockers block the latter by pattern, and because a beacon is fire-and-forget
// a blocked one looks exactly like a delivered one — those players just never
// showed up in the numbers. Keep the paths boring. (See worker/index.ts.)

/** Opaque per-round id linking start → completion → share. */
export function newAnalyticsId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function beacon(path: string, body: unknown): void {
  try {
    void fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // analytics must never break the game
  }
}

export function beaconStart(b: {
  roundId: string;
  puzzleNumber: number;
  date: string;
  kind: RoundKind;
  surface: Surface;
  playerId: string;
  // A random (Chef's Choice) round's dish is picked from this seed; the server
  // resolves it so the admin feed can name the dish (it's never in the schedule).
  seed?: string;
}): void {
  beacon("/api/rounds/start", b);
}

export function beaconComplete(b: {
  roundId: string;
  puzzleNumber: number;
  date: string;
  kind: RoundKind;
  surface: Surface;
  guesses: number;
  solved: boolean;
  seed?: string;
}): void {
  beacon("/api/rounds/complete", b);
}

export function beaconShare(b: {
  roundId: string;
  puzzleNumber: number;
  date: string;
  kind: RoundKind;
  surface: Surface;
}): void {
  beacon("/api/rounds/share", b);
}
