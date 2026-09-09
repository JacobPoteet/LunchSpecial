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
