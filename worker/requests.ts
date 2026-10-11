// PURE request logic: does a suggestion name something already served? No DB,
// no Hono; unit tested in requests.test.ts.

import { foldAccents } from "../shared/search";

/**
 * The key two names are compared on: case, accents, punctuation and spacing
 * ignored, so "leche flan", "Leche Flan" and "Leche-flan" are one dish.
 */
export function requestKey(name: string): string {
  return foldAccents(name.toLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** One past booking: the name it went out under and the day (or night). */
export interface Served {
  name: string;
  date: string;
}

/**
 * The most recent booking whose name matches the request, if it was served
 * before `today`. Today and later never match: a dish on today's board or
 * booked for next week is not news a suggestion box should give away.
 */
export function findServed(requested: string, served: Served[], today: string): Served | null {
  const key = requestKey(requested);
  if (!key) return null;
  let best: Served | null = null;
  for (const s of served) {
    if (s.date >= today || requestKey(s.name) !== key) continue;
    if (!best || s.date > best.date) best = s;
  }
  return best;
}
