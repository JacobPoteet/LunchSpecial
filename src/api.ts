// Thin fetch wrappers around the public game API.

import type { DailyInfo, DishSummary, GuessFeedback, RevealInfo } from "../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
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

export function fetchDaily(date: string, preview?: string): Promise<DailyInfo> {
  return request(withParams("/api/daily", { date, preview }));
}

export function postGuess(body: {
  date: string;
  dishId: number;
  guessNumber: number;
  preview?: string;
}): Promise<GuessFeedback> {
  return request("/api/guess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchReveal(date: string, preview?: string): Promise<RevealInfo> {
  return request(withParams("/api/reveal", { date, preview }));
}

/** Player's local calendar date as YYYY-MM-DD (Wordle-style daily rollover). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
