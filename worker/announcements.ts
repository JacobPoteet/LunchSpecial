// PURE announcement logic: where a notice sits in time, who it's for, and
// whether an admin's submission is well-formed. No DB, no Hono — unit tested in
// announcements.test.ts.

import type { AnnouncementAudience, AnnouncementInput, AnnouncementStatus } from "../shared/types";
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_LIMITS } from "../shared/types";
import { isValidDateString } from "./game";
import { isAnalyticsId } from "./guesslog";

/** The scheduling fields status depends on. */
export interface AnnouncementWindow {
  /** ET calendar day the window opens (inclusive). */
  startDate: string;
  /** ET calendar day the window closes (inclusive). */
  endDate: string;
  /** Manual kill switch. */
  isActive: boolean;
}

/**
 * Where a notice sits relative to `today` (an ET day — the same day boundary the
 * Special rolls over on). Both ends of the window are inclusive: a notice dated
 * 07-20 → 07-22 runs for three whole days.
 *
 * The kill switch outranks the dates, so pulling a notice mid-run reads as
 * `retired` rather than `active`. Date comparison is plain string ordering,
 * which is exactly right for zero-padded YYYY-MM-DD.
 */
export function announcementStatus(a: AnnouncementWindow, today: string): AnnouncementStatus {
  if (!a.isActive) return "retired";
  if (today < a.startDate) return "upcoming";
  if (today > a.endDate) return "past";
  return "active";
}

/**
 * Whether a given player should be shown this notice right now. A note aimed at
 * one device (`playerId` set) goes to that device and nobody else, whatever the
 * audience says. `returning` is
 * the client's own claim (it has finished at least one game on this device) —
 * there are no accounts to check it against, and the cost of an untruthful
 * client is that someone sees a notice slightly early. That's the same trust
 * model the rest of the game runs on.
 */
export function isEligible(
  a: AnnouncementWindow & { audience: AnnouncementAudience; playerId?: string | null },
  ctx: { today: string; returning: boolean; playerId?: string | null },
): boolean {
  if (announcementStatus(a, ctx.today) !== "active") return false;
  if (a.playerId) return a.playerId === ctx.playerId;
  return a.audience === "all" || ctx.returning;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Validate + normalise what the admin form submitted. Returns the clean input or
 * a message the panel can show as-is. Everything is capped rather than rejected
 * on length, so a paste that runs long is trimmed instead of losing the draft.
 */
export function parseAnnouncementInput(raw: unknown): { input: AnnouncementInput } | { error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;

  const header = cleanText(b.header, ANNOUNCEMENT_LIMITS.header);
  if (!header) return { error: "A header is required" };
  const body = cleanText(b.body, ANNOUNCEMENT_LIMITS.body);
  if (!body) return { error: "A message is required" };

  const audience = (b.audience ?? "all") as AnnouncementAudience;
  if (!ANNOUNCEMENT_AUDIENCES.includes(audience)) return { error: "Unknown audience" };

  const startDate = cleanText(b.startDate, 10);
  const endDate = cleanText(b.endDate, 10);
  if (!isValidDateString(startDate)) return { error: "Start date must be YYYY-MM-DD" };
  if (!isValidDateString(endDate)) return { error: "End date must be YYYY-MM-DD" };
  if (endDate < startDate) return { error: "The end date can't be before the start date" };

  // Absent means on — a notice you just wrote is one you meant to run.
  const isActive = b.isActive === undefined ? true : b.isActive === true;

  // Blank or absent is a broadcast. Anything else must look like a device id;
  // a typo'd one would be a note nobody can ever receive.
  let playerId: string | null = null;
  if (b.playerId !== undefined && b.playerId !== null && b.playerId !== "") {
    const raw = typeof b.playerId === "string" ? b.playerId.trim() : b.playerId;
    if (!isAnalyticsId(raw)) return { error: "That isn't a device id" };
    playerId = raw;
  }

  return { input: { header, body, audience, startDate, endDate, isActive, playerId } };
}
