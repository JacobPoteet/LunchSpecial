// Which costume the page is wearing, and the costume itself.
//
// The decision is shared/occasions.ts (pure, tested). This module supplies its
// inputs and keeps the result where every slot can read it:
//
// - **The day** is the round's own, set by the page that owns the round:
//   GamePage passes its puzzle date, NightPage its night key. Both are fixed at
//   entry, so a costume never changes mid-round.
// - **The bookings** come from /api/occasions. The last answer is kept in
//   localStorage so the first paint already wears the right costume; an empty
//   cache is fine, because the code's windows cover every unbooked season.
// - **`?occasion=<id>` or `?occasion=none`** overrides both. Honoured in
//   production on purpose: it is cosmetic and nothing else. The Worker stamps a
//   round's occasion from its date and never hears about this.
//
// The costume is a lazy chunk (src/occasions/<id>/), so a player in May never
// downloads a bat. `<html data-occasion>` is stamped the moment the day is
// known, and the slots fill in when the chunk lands.

import { useEffect, useSyncExternalStore } from "react";
import { isOccasionId, occasionOn, type OccasionBooking, type OccasionId } from "../../shared/occasions";
import { resolveMode } from "../../shared/mode";
import { gameToday } from "../../shared/time";
import { fetchOccasions } from "../api";
import { setSfxOccasion } from "../audio/engine";
import { currentNight } from "../game/night";
import type { OccasionKit } from "./kit";

/** Each costume, loaded only when it is worn. One line per occasion. */
const KITS: Record<OccasionId, () => Promise<OccasionKit>> = {
  halloween: () => import("./halloween").then((m) => m.default),
};

const CACHE_KEY = "lunch-special:occasions";

/** `?occasion=` on this page load: an id, "none", or nothing. */
function readOverride(): OccasionId | "none" | null {
  try {
    const value = new URLSearchParams(window.location.search).get("occasion");
    if (value === "none") return "none";
    return isOccasionId(value) ? value : null;
  } catch {
    return null;
  }
}

function readCache(): OccasionBooking[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((b: OccasionBooking) => isOccasionId(b?.occasionId)) : [];
  } catch {
    return [];
  }
}

function writeCache(list: OccasionBooking[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // A private window: the next load folds against the code's windows alone.
  }
}

export interface OccasionState {
  /** The occasion being worn, or null on a plain day. */
  id: OccasionId | null;
  /** Its costume, once the chunk has landed. */
  kit: OccasionKit | null;
  /** Every booking, for anything that marks other days (the Leftovers calendar). */
  bookings: OccasionBooking[];
}

const override = readOverride();
let bookings: OccasionBooking[] = readCache();
let day: string | null = null;
let kits = new Map<OccasionId, OccasionKit>();
let state: OccasionState = { id: null, kit: null, bookings };
const listeners = new Set<() => void>();
let fetched = false;

/** The occasion a given day wears on this page, override included. */
export function occasionFor(d: string, list: readonly OccasionBooking[] = bookings): OccasionId | null {
  if (override === "none") return null;
  if (override) return override;
  return occasionOn(d, list);
}

function publish(): void {
  const id = day ? occasionFor(day) : null;
  const next: OccasionState = { id, kit: id ? (kits.get(id) ?? null) : null, bookings };
  if (next.id === state.id && next.kit === state.kit && next.bookings === state.bookings) return;
  state = next;
  if (id) document.documentElement.dataset.occasion = id;
  else delete document.documentElement.dataset.occasion;
  setSfxOccasion(id);
  for (const fn of listeners) fn();
  if (id && !kits.has(id)) void loadKit(id);
}

const inFlight = new Map<OccasionId, Promise<void>>();

function loadKit(id: OccasionId): Promise<void> {
  const pending = inFlight.get(id);
  if (pending) return pending;
  const job = KITS[id]().then(
    (kit) => {
      kits = new Map(kits).set(id, kit);
      publish();
    },
    () => {
      // A chunk that won't load is a plain day with the attribute's CSS still on.
      // The game is the product; the costume is never worth an error.
    },
  );
  inFlight.set(id, job);
  return job;
}

function refreshBookings(): void {
  if (fetched) return;
  fetched = true;
  fetchOccasions().then(
    (list) => {
      const clean = list.filter((b) => isOccasionId(b.occasionId));
      writeCache(clean);
      bookings = clean;
      publish();
    },
    () => {},
  );
}

/**
 * Put the page in costume for `d`. Returns the undo, for an effect's cleanup.
 * The undo only clears what it set, so a page swapping for another one in the
 * same tick doesn't strip the newcomer's costume.
 */
export function wearOccasion(d: string): () => void {
  day = d;
  publish();
  refreshBookings();
  return () => {
    if (day !== d) return;
    day = null;
    publish();
  };
}

/** The page's costume, for as long as it is mounted. */
export function useWearOccasion(d: string): void {
  useEffect(() => wearOccasion(d), [d]);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** What the page is wearing. Re-renders when the costume lands or the bookings change. */
export function useOccasion(): OccasionState {
  return useSyncExternalStore(subscribe, () => state);
}

/**
 * Dress the page before React mounts, so the first frame is already in
 * costume. The day is read off the URL the same way the page will read it: the
 * night key in the bar, the round's date in the diner. Waits for the costume a
 * short while and no longer: a slow chunk fills its slots when it arrives.
 */
export async function primeOccasion(): Promise<void> {
  try {
    if (window.location.pathname.startsWith("/admin")) return;
    const search = window.location.search;
    const d = new URLSearchParams(search).has("bar")
      ? currentNight()
      : resolveMode({ search, pathname: window.location.pathname, dev: import.meta.env.DEV, today: gameToday() }).date;
    wearOccasion(d);
    const id = occasionFor(d);
    if (!id) return;
    await Promise.race([loadKit(id), new Promise((resolve) => setTimeout(resolve, 800))]);
  } catch {
    // Never in the way of the mount.
  }
}
