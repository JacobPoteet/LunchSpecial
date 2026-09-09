// The demo — PURE.
//
// Every gate in this game was built for a player who comes back daily: the
// midnight-ET rollover, one round a day, finishing lunch before the bar will
// open, and the bar's own 20:00-03:00 clock. A stranger with five minutes trips
// all four, which is a problem when the stranger is someone you want to show
// the game to.
//
// There are two doors past all of it, and they differ in exactly one thing —
// how you get through, and therefore what is on the other side:
//
//   - **The showcase link** (`?s=<token>`), signed and expiring, minted in the
//     back office. It runs on TODAY'S REAL SPECIAL, which is what makes it the
//     link you send someone mid-conversation: you both saw the same board. It
//     is also, for exactly that reason, a thing you would not leave lying
//     around — a permanent public URL that names today's answer is a spoiler
//     with a bow on it.
//
//   - **The demo route** (`/demo`), public and permanent, pinned to one fixed
//     dish. Nothing about it is a credential, because it gives away nothing: a
//     dish chosen in advance spoils no Special, so there is no signature to
//     check, no expiry to outlive and no revocation to regret. That is the one
//     that goes on a resume, and the reason it can.
//
// Both are untracked, both write nothing, and both hold the bar's door open
// whatever the hour. The clock override costs nothing to give away, because the
// bar's hours were never enforced server-side in the first place — see
// isPlayableNight, which checks that a night is plausible and not that it is
// evening.
//
// This module is the vocabulary and the two folds. The browser's half is in
// src/game/demo.ts.

/** The public demo's path. Deliberately short: somebody types this one. */
export const DEMO_PATH = "/demo";

/**
 * The dish the public demo is pinned to.
 *
 * The same dish the case study's interactive board runs on (docs/index.html),
 * so the write-up and the live game show the same puzzle rather than two. It is
 * a good demo board on its own merits — a breakfast dish, so the `course` tile
 * is not the entree every other guess returns, and a Tunisian one, so the
 * region near-match has something to do.
 *
 * A pinned slug is a dependency on a row that /admin can rename out from under
 * it (a rename regenerates the slug), which is why worker/data-integrity.test.ts
 * asserts this one still resolves and is still schedulable.
 */
export const DEMO_SPECIAL_SLUG = "shakshuka";

/**
 * Which door this page load came through.
 *
 * `route` outranks `link` on the degenerate `/demo?s=…`: the path is the
 * stronger signal, needs no token behind it, and is the half that has to
 * survive an in-app navigation.
 */
export type DemoEntrance = "none" | "route" | "link";

export function demoEntrance(pathname: string, search: URLSearchParams): DemoEntrance {
  if (pathname === DEMO_PATH || pathname === `${DEMO_PATH}/`) return "route";
  return search.has("s") ? "link" : "none";
}

/**
 * Carry the demo across an in-app hop.
 *
 * The game has no router, so every mode switch assigns a fresh URL and anything
 * not rewritten onto it is gone. `devUrl` exists for the dev flags and
 * `surfaceUrl` for Discord's iframe params, both for this reason and both after
 * the same bug; this is the third, and it was the worst of the three. A
 * showcase visitor who opened the Menu archive dropped the `s` param on the way
 * out, which put them on an ordinary Leftover — tracked, beaconed, and written
 * to localStorage — one click after a banner promising that nothing here is
 * saved. Neither half of that promise survived a link the demo itself offered.
 *
 * Params already on `url` win, so a caller can still override one. Compose
 * outside-in with the other two: `surfaceUrl(carryDemo(devUrl(target)))`.
 */
export function carryDemo(url: string, entrance: DemoEntrance, token?: string): string {
  if (entrance === "none") return url;
  const [rawPath, query] = url.split("?");
  const params = new URLSearchParams(query ?? "");

  if (entrance === "route") {
    // Only the diner's own root becomes the demo. A hop that already names a
    // path (there are none today, but `/press` is one keystroke away) is asking
    // for that page and not for a demo-flavoured version of it.
    const path = rawPath === "/" || rawPath === "" ? DEMO_PATH : rawPath;
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }

  if (token && !params.has("s")) params.set("s", token);
  const qs = params.toString();
  return qs ? `${rawPath}?${qs}` : rawPath;
}
