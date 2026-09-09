// Who is holding an admin session, and what they are allowed to do with it —
// PURE.
//
// There are two kinds, and the second one exists because of the demo. The back
// office is the largest single body of work in this project — fourteen pure
// folds, seven dashboard tabs, the small-sample rules, the censored
// denominators — and until now it was the part of the game nobody could be
// shown, because the only door was a password. A read-only session is that
// door, opened.
//
// The gate is by HTTP METHOD, in one middleware, rather than by a guard on each
// of the twenty-six routes that write. That is deliberate and it is the whole
// safety argument: a guard per route is a list to keep in step with the router,
// and the failure mode of forgetting an entry is a stranger deleting a dish.
// Gating the method fails closed for every route that does not exist yet. It
// holds because this router has no read behind a POST — every non-GET in it is
// a genuine write, which is worth re-checking if that ever stops being true.

/** The full session's payload — password in, everything unlocked. */
export const SESSION_PAYLOAD = "session";

/**
 * The read-only session's payload.
 *
 * Prefixed with the full one's text but never equal to it, and matched
 * *exactly* below for the same reason worker/showcase.ts matches its own
 * payload exactly: a `startsWith` here would hand a read-only token the keys.
 */
export const READONLY_PAYLOAD = "session:ro";

export type SessionRole = "full" | "readonly";

/**
 * What a verified cookie payload grants, or null if it grants nothing.
 *
 * Takes the already-verified payload rather than the token: the signature is
 * the Worker's job and this is the fold, the same split every other pure module
 * here uses.
 */
export function sessionRole(payload: string | null): SessionRole | null {
  if (payload === SESSION_PAYLOAD) return "full";
  if (payload === READONLY_PAYLOAD) return "readonly";
  return null;
}

/**
 * May a session of this role call this method?
 *
 * HEAD rides along with GET because it is a GET that discards the body; nothing
 * in this router serves one today, and refusing it would be refusing a read.
 */
export function mayCall(role: SessionRole, method: string): boolean {
  if (role === "full") return true;
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD";
}

/**
 * How long a read-only session lasts.
 *
 * A day, matching a preview token rather than the full session's week. It is
 * minted with no password by a public route, so it is closer to a preview than
 * to a login: something you get by asking, and get again by asking again.
 */
export const READONLY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * What the client is told when a read-only session tries to write.
 *
 * Named here rather than written into the route so the message and the rule
 * that produces it live together — and so the admin client can key off it if it
 * ever needs to.
 */
export const READONLY_REFUSAL = "Read-only demo — this back office is showing live data and can't be changed";

// ---------------------------------------------------------------------------
// What a read-only session may READ
// ---------------------------------------------------------------------------
//
// The write gate above is about damage. This one is about two different things
// the demo must not hand out, and it exists because the first version handed out
// both.
//
// **Spoilers.** The forward schedule, each dish's next booking, and the clue
// text for all 394 dishes. The public game refuses a future date outright
// (`isAllowedRequestDate`) so nobody can read tomorrow's Special, and the back
// office is where tomorrow's Special is written down. Publishing it undoes that
// rule from the other end. Masking would not help: an unnamed dish on a dated
// row is still a row you cross-reference, and clue text blurs into nothing
// useful. The only fix is to not send it.
//
// **Other people's words.** Player dish suggestions, notices, and the
// experiment notes you wrote for yourself. All anonymous, none of it anyone
// else's business.
//
// Everything still readable is either already public through /api/stats (the
// badge endpoint serves the headline counts, the guess distribution, the funnel,
// the growth series and the country table to anyone, with no auth) or is an
// aggregate of the same rows. That is the line: **the demo shows how the numbers
// are handled, not who made them and not what is coming.**

/**
 * Read paths a read-only session is refused, matched against the admin router's
 * own sub-path.
 *
 * A deny list rather than an allow list, deliberately, and the opposite choice
 * from the write gate above. A write is dangerous by default, so that one fails
 * closed. A read is not: a new panel added six months from now should appear in
 * the demo rather than silently vanish from it, and the two categories here are
 * small, named and unlikely to grow.
 */
export const WITHHELD_READS = [
  "/schedule", // tomorrow's Special, and the next six weeks of them
  "/nights", // the same, for the bar
  "/drinks", // the drink catalogue, with its coaster text
  "/drink-ingredients",
  "/requests", // players' own words
  "/announcements",
  "/experiments", // notes written for an audience of one
  "/recent-rounds", // the raw per-device feed
  "/device-data",
  "/issues",
] as const;

/** The admin router's mount point, so a full request path can be reduced to it. */
const ADMIN_MOUNT = "/api/admin";

/** `/api/admin/dishes/12` -> `/dishes/12`. Trailing slashes normalised away. */
export function adminSubPath(fullPath: string): string {
  const rest = fullPath.startsWith(ADMIN_MOUNT) ? fullPath.slice(ADMIN_MOUNT.length) : fullPath;
  const trimmed = rest.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * May a session of this role read this path?
 *
 * Matches a whole segment, never a bare prefix, so `/dish-report` survives
 * `/dishes` and `/night-report` survives `/nights`. Both of those are real
 * routes and both are aggregates the demo wants.
 */
export function mayRead(role: SessionRole, subPath: string): boolean {
  if (role === "full") return true;
  const path = adminSubPath(subPath);
  return !WITHHELD_READS.some((w) => path === w || path.startsWith(`${w}/`));
}

/** What the client is told when a read-only session asks for one of those. */
export const WITHHELD_REFUSAL = "Not shown in the read-only demo";

/**
 * May a read-only session see this dish's clues?
 *
 * Yes once the dish has been served, because the game itself has already handed
 * those five clues to everyone who played that day — `/api/reveal` prints them
 * in full at the end of every round. Withholding them after that would be
 * guarding something already public, and it would hide the beat sheet, which is
 * the part of the catalogue most worth showing anyone.
 *
 * No before it, because an unserved dish is a future Special.
 */
export function mayShowClues(role: SessionRole, lastServed: string | null): boolean {
  return role === "full" || lastServed !== null;
}
