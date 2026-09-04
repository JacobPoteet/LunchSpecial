// Thin fetch wrappers around the public game API.

import type {
  Announcement,
  AnnouncementSeenInput,
  DailyInfo,
  DishRequestInput,
  DishSummary,
  DrinkGuessFeedback,
  DrinkSummary,
  GuessFeedback,
  NightcapInfo,
  NightcapReveal,
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

// ---- After Dark ----
//
// A separate pool endpoint, not a filter on /api/dishes. You cannot order a
// hamburger at the bar and the autocomplete must not offer you one.

export function fetchDrinks(): Promise<DrinkSummary[]> {
  return request("/api/night/drinks");
}

export function fetchNightcap(night: string, preview?: string, pinned?: string): Promise<NightcapInfo> {
  return request(withParams("/api/night/info", { night, preview, nightcap: pinned }));
}

export function postDrinkGuess(body: {
  night: string;
  drinkId: number;
  guessNumber: number;
  preview?: string;
  /** Playtest only: the slug this round was pinned to. */
  nightcap?: string;
}): Promise<DrinkGuessFeedback> {
  return request("/api/night/guess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchNightcapReveal(
  night: string,
  preview?: string,
  pinned?: string,
): Promise<NightcapReveal> {
  return request(withParams("/api/night/reveal", { night, preview, nightcap: pinned }));
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

/**
 * The device opened a real, playable round — the top of the funnel.
 *
 * Fired on the board being ready rather than on the first guess, because "games
 * started" means the first guess and everyone who loads and never plays was
 * otherwise invisible. Deliberately carries no date: a visit belongs to the ET
 * day it happened on, which the server stamps.
 *
 * `source` is the arrival's `utm_source` (migrations/0024) and is the one field
 * on any beacon that the client can't be trusted on — it starts in the URL — so
 * the Worker re-validates it and stores `direct` for anything absent or
 * malformed. Sent in the body rather than on the path: `?utm_source=` in a
 * request URL is a shape content blockers strip, and a stripped param here would
 * quietly re-label paid traffic as organic.
 */
export function beaconSeated(b: { playerId: string; surface: Surface; source?: string }): void {
  beacon("/api/rounds/seated", b);
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
  /**
   * The device's UTC offset in minutes, east-positive. Nightcaps only, and the
   * only beacon field that is a fact about the player's clock rather than about
   * the game — the bar's window is local, so without it the hour profile is
   * noise. Re-validated server-side; see migrations/0041.
   */
  tzOffset?: number;
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
  /** See beaconStart. */
  tzOffset?: number;
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

/**
 * The player reached for the mute button.
 *
 * The one beacon on this list that isn't about the game. It exists because it's
 * a fun thing to know and costs a single upsert — explicitly *not* a
 * measurement of anyone's audio experience, which is unknowable from here: a
 * player on a muted phone, a player with the tab volume down and a player who
 * never noticed there was sound are all indistinguishable from a device that
 * simply never toggled. It answers "does anyone touch this button", and the
 * repeat count answers "do they keep reaching for it". Nothing on the dashboard
 * quotes a rate off it.
 *
 * Only fired for a device that already has a player id — a mute click must not
 * be the thing that mints one, the same rule the admin feed's `peekPlayerId`
 * follows.
 */
export function beaconSound(b: {
  playerId: string;
  surface: Surface;
  muted: boolean;
  toggles: number;
}): void {
  beacon("/api/rounds/sound", b);
}
