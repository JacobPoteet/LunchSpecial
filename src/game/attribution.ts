// The `utm_source` this tab arrived on, captured once and remembered.
//
// The whole module exists because of one property of this app: it navigates
// between modes by assigning a fresh URL (there is no router), which wipes the
// query string. An ad click lands on `/?utm_source=reddit`, and by the time the
// player has touched anything that param is gone. Discord's iframe params have
// exactly this problem and are solved exactly this way — see `discordParams` in
// src/discord/bootstrap.ts, which this deliberately mirrors rather than invents
// a second shape for.
//
// In practice the arrival beacon fires on the first tracked board, which is the
// same page load the param arrived on, so the stash is usually redundant. It is
// here for the loads where it isn't: a slow or failed `/daily`, an arrival on an
// archive URL, a mode switch taken before the board resolved. Those are the
// visits most worth attributing, because they are the ones that nearly bounced.

import { normalizeSource } from "../../shared/attribution";

/** sessionStorage slot holding this tab's arrival source. */
const SOURCE_KEY = "lunch-special:source";

/**
 * This tab's arrival source, or null if it arrived untagged.
 *
 * Read at module load — before any navigation this app performs — and stashed
 * for the rest of the tab.
 *
 * sessionStorage rather than localStorage, on purpose and importantly: an
 * arrival source describes *this arrival*. Persisting it would re-attribute
 * every future visit from this browser to an ad that was clicked once, weeks
 * ago, which would make a campaign look like it was still working long after it
 * stopped. A new tab is a new arrival, and an untagged one is honestly untagged.
 *
 * A URL that carries no usable `utm_source` never overwrites a stashed one: the
 * player's own in-app navigations are untagged by construction, and letting the
 * first of them clear the stash would defeat the point.
 */
const arrivalSource: string | null = (() => {
  const stashed = (): string | null => {
    try {
      return normalizeSource(window.sessionStorage.getItem(SOURCE_KEY));
    } catch {
      return null;
    }
  };

  const fromUrl = normalizeSource(new URLSearchParams(window.location.search).get("utm_source"));
  if (fromUrl === null) return stashed();

  try {
    window.sessionStorage.setItem(SOURCE_KEY, fromUrl);
  } catch {
    // Private mode / storage disabled. The beacon still fires with the value on
    // this page load, which is the load that matters.
  }
  return fromUrl;
})();

/**
 * Where this tab came from, for the arrival beacon. Null means untagged — the
 * Worker turns that into `direct`, so the client never has to name the absence
 * of a thing.
 */
export function visitSource(): string | null {
  return arrivalSource;
}
