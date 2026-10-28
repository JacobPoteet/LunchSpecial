// The errors a player can see, as codes — PURE.
//
// A route that can fail in front of a player answers `{ error, code }`: the
// English `error` for logs and old clients, and a `code` the client turns into
// copy in the player's language (`t.errors[code]`). Admin and Discord routes
// answer English alone; nobody reads those in another language.
//
// `offline` and `failed` never come from the Worker: the client raises them
// when a request doesn't reach it, or comes back unreadable (src/api.ts).

import type { Messages } from "./i18n/messages";

export const PLAYER_ERROR_CODES = [
  "offline",
  "failed",
  "bad_request",
  "bad_date",
  "bad_link",
  "not_found",
  "no_dish",
  "unknown_dish",
  "unknown_drink",
  "bar_closed",
  "nothing_on_tap",
] as const;

export type PlayerErrorCode = (typeof PLAYER_ERROR_CODES)[number];

/** A route's answer to a player-visible failure. The code is checked against the list. */
export function playerError<C extends PlayerErrorCode>(error: string, code: C): { error: string; code: C } {
  return { error, code };
}

export function isPlayerErrorCode(value: unknown): value is PlayerErrorCode {
  return typeof value === "string" && (PLAYER_ERROR_CODES as readonly string[]).includes(value);
}

/** A failed request as the client keeps it (src/api.ts's ApiError, or any Error). */
export interface Failure {
  /** The Worker's English, or the client's own. */
  message: string;
  code?: PlayerErrorCode | null;
  status?: number;
}

/**
 * What the player reads: the code's copy in their language, or the English
 * when there's no code. An unreadable answer keeps its status, which is the
 * one detail worth quoting in a bug report.
 */
export function errorCopy(failure: Failure, t: Messages): string {
  if (!failure.code) return failure.message;
  const copy = t.errors[failure.code];
  return failure.code === "failed" && failure.status ? `${copy} (${failure.status})` : copy;
}
