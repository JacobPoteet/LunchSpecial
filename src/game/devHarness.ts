// Dev-only entrances into states that are otherwise slow or clock-gated to
// reach. Dropped from production builds: every export here is behind
// `import.meta.env.DEV`, so the bundler removes the bodies and the module costs
// a couple of bytes.
//
// The one that matters is `?handoff=1`, which is the reason this file exists:
// the walk from a finished Special into After Dark is the most interesting
// ninety seconds in the game and, without this, seeing it required playing a
// full six-guess round after eight in the evening.

import type { GuessFeedback, RevealInfo } from "../../shared/types";
import { gameToday } from "../../shared/time";
import { loadRound, saveRound } from "./storage";

function params(): URLSearchParams {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
}

/**
 * Should the bar ignore its opening hours?
 *
 * `?barhours=off` says so outright; `?handoff=1` implies it, because a harness
 * for the hand-off that only worked between 8pm and 3am would be a harness you
 * could not use during the working day.
 *
 * DEV only, and deliberately so. In production the only way past the clock is a
 * signed preview token, which is also the only way that is untracked.
 */
export function devIgnoresBarHours(): boolean {
  if (!import.meta.env.DEV) return false;
  const p = params();
  return p.get("barhours") === "off" || p.get("handoff") === "1";
}

/**
 * The dev-only flags, carried across an in-app navigation.
 *
 * The game has no router, so every mode switch assigns a fresh URL and the
 * query string goes with it. That is precisely the problem `surfaceUrl` exists
 * to solve for Discord's iframe params, and the dev flags have it for the same
 * reason and with the same shape of symptom: leaving the bar dropped
 * `?barhours=off`, so the diner recomputed the clock, decided the bar was shut,
 * and offered no way back in. Untestable during the day, which is the only time
 * anyone is testing.
 *
 * Params already on `url` win, so a caller can still override one. Production
 * returns the url untouched — every flag here is behind `import.meta.env.DEV`,
 * so the whole body folds away.
 */
const CARRIED = ["barhours", "handoff", "nightcap"] as const;

export function devUrl(url: string): string {
  if (!import.meta.env.DEV) return url;
  const here = params();
  const carried = new URLSearchParams();
  for (const key of CARRIED) {
    const value = here.get(key);
    if (value !== null) carried.set(key, value);
  }
  if ([...carried].length === 0) return url;
  const [path, query] = url.split("?");
  if (query) for (const [key, value] of new URLSearchParams(query)) carried.set(key, value);
  return `${path}?${carried.toString()}`;
}

/**
 * Put a finished, won Special in localStorage so the page opens on the check.
 *
 * The winning guess is the *real* Special, fetched from the same reveal
 * endpoint the game uses, so the check, the share grid and the board underneath
 * all show a coherent round rather than a fabricated one. Everything after this
 * point is the genuine flow: the check auto-opens on the restored path, the
 * bar's band fades in a beat later, and pressing it runs the real transition.
 *
 * Refuses to overwrite a round in progress — losing your actual game to a dev
 * flag would be a poor trade for a shortcut.
 */
export async function applyHandoffHarness(): Promise<void> {
  if (!import.meta.env.DEV) return;
  if (params().get("handoff") !== "1") return;

  const today = gameToday();
  if (loadRound(today).status !== "playing") return; // already finished; leave it
  try {
    const res = await fetch(`/api/reveal?date=${today}`);
    if (!res.ok) return;
    const reveal = (await res.json()) as RevealInfo;
    const winning: GuessFeedback = {
      correct: true,
      dish: { id: reveal.id, name: reveal.name },
      matchedIngredients: reveal.ingredients,
      unmatchedIngredients: [],
      attributes: {
        country: { value: reveal.country, match: "hit" },
        course: { value: reveal.course, match: "hit" },
        temperature: { value: reveal.temperature, match: "hit" },
        protein: { value: reveal.protein, match: "hit" },
      },
    };
    saveRound({
      date: today,
      status: "won",
      guesses: [winning],
      clues: [],
      ingredientCount: reveal.ingredients.length,
    });
  } catch {
    // The harness is a convenience. If the kitchen isn't answering, the page
    // still loads — as an ordinary unplayed board, which is a legible failure.
  }
}
