// The showcase link — PURE.
//
// A signed link that opens the game on a finished, won Special with the bar's
// door already lit, so someone who has never played can see the hand-off into
// After Dark without waiting for eight in the evening or playing six guesses to
// get there. It is the demo link, and it exists because every gate in this game
// was built for a player who comes back daily: the clock, finishing lunch, and
// one round a day. A stranger with five minutes trips all three.
//
// It is a *preview* token in every sense that matters — signed, expiring,
// untracked, ephemeral — and deliberately shares the vocabulary rather than
// forking it. What it does not share is the drink: a drink preview names one
// pour by id, and a showcase names none, so it resolves whatever is actually on
// tap that night. That is the difference between "does the tab look right" and
// "here is the game".
//
// This module is the vocabulary and the two folds. The routes do the talking.

/**
 * The showcase token's whole payload. No id follows it, which is what makes it
 * resolve the night's real pour instead of a drink someone picked in advance.
 */
export const SHOWCASE_PAYLOAD = "preview:bar";

/** The drink-preview prefix, which a showcase must never be mistaken for. */
export const DRINK_PREVIEW_PREFIX = "preview:drink:";

/**
 * The lifetimes the mint route will sign.
 *
 * A closed set rather than an arbitrary number of days, because the token is a
 * bearer credential with no revocation list behind it (see below) and "how long
 * is this link alive" should be a decision with two answers rather than a text
 * field. A week covers a conversation; a month covers a hiring process.
 */
export const SHOWCASE_TTL_DAYS = [7, 30] as const;
export type ShowcaseTtlDays = (typeof SHOWCASE_TTL_DAYS)[number];

const DAY_MS = 86_400_000;

/**
 * Validate a requested lifetime, in milliseconds, or null if it isn't one we
 * sign.
 *
 * Takes `unknown` because it is reading a JSON body. A rejected value is a 400
 * rather than a clamp: quietly issuing a 7-day link to someone who asked for 30
 * is the kind of helpfulness you discover a month later when the link is dead.
 */
export function showcaseTtlMs(days: unknown): number | null {
  const n = Number(days);
  if (!Number.isInteger(n)) return null;
  return (SHOWCASE_TTL_DAYS as readonly number[]).includes(n) ? n * DAY_MS : null;
}

/**
 * What a verified preview payload is asking for.
 *
 * One fold rather than a chain of `startsWith` in the resolver, because the
 * failure this prevents is a token minted for one catalogue being honoured by
 * the other. A showcase is matched *exactly*: `preview:bar` and nothing else,
 * so no future prefix sharing those characters can fall through to it.
 */
export type PreviewKind =
  | { kind: "showcase" }
  | { kind: "drink"; id: number }
  | { kind: "invalid" };

export function classifyDrinkPreview(payload: string | null): PreviewKind {
  if (payload === null) return { kind: "invalid" };
  if (payload === SHOWCASE_PAYLOAD) return { kind: "showcase" };
  if (!payload.startsWith(DRINK_PREVIEW_PREFIX)) return { kind: "invalid" };
  const rest = payload.slice(DRINK_PREVIEW_PREFIX.length);
  // Digits only, and at least one. `Number("")` is 0 — an integer, and a row id
  // no drink has — so an `Number.isInteger` check alone reads a truncated
  // payload as a lookup for drink zero rather than as the malformed token it is.
  if (!/^\d+$/.test(rest)) return { kind: "invalid" };
  return { kind: "drink", id: Number(rest) };
}
