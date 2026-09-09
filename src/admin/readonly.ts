import { createContext, useContext } from "react";

/**
 * Whether this back office is being *looked at* rather than run.
 *
 * A read-only session (worker/adminsession.ts) is what the public demo hands a
 * visitor, and the server is what enforces it: every non-GET in the admin
 * router is refused by method, in one middleware, whatever this context says.
 *
 * So this is presentation, not security. It exists because a demo whose buttons
 * all answer with an error banner is a worse demo than one whose buttons aren't
 * there — and because the few genuinely destructive controls (a dish delete, an
 * analytics wipe) should not be things a visitor discovers by pressing them.
 * The rest of the interface is left exactly as it is: the point of showing
 * somebody the back office is showing them the back office.
 */
export const ReadOnlyContext = createContext(false);

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
