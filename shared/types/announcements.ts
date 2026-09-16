// Notices posted to players, and the admin's view of them.

import type { Surface } from "./game";

// ---- Announcements (notices posted to players) ----

/**
 * Who a notice is eligible for. `returning` means a player who has finished at
 * least one game on this device — the client decides that from its own lifetime
 * stats, so a first-timer mid-first-round still counts as new.
 */
export const ANNOUNCEMENT_AUDIENCES = ["all", "returning"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

/** Field length caps for an announcement, shared by the admin form + server. */
export const ANNOUNCEMENT_LIMITS = { header: 60, body: 600 } as const;

/**
 * What a player receives: the content, nothing else. The window and the audience
 * rule are the kitchen's business — the server has already applied them, so the
 * client never learns a notice exists that it isn't meant to see.
 */
export interface Announcement {
  id: number;
  header: string;
  /** Limited markdown — see shared/markdown.ts (bold, italic, links only). */
  body: string;
}

/**
 * Where a notice sits relative to the current ET day. `retired` is the manual
 * kill switch (is_active off) and outranks the dates — a notice pulled early
 * reads as retired even while its window is still open.
 */
export const ANNOUNCEMENT_STATUSES = ["active", "upcoming", "past", "retired"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

/**
 * How many people a notice actually reached. Anonymous devices, not accounts:
 * one row per (announcement, player_id), so re-showing on a cleared browser
 * counts once.
 */
export interface AnnouncementReach {
  /** Distinct devices that have seen it. */
  players: number;
  /** Those devices split by where they saw it. */
  bySurface: Record<Surface, number>;
  /** Devices reached per ET day, oldest first — days with no views are omitted. */
  daily: { date: string; players: number }[];
}

/** A notice as the admin panel sees it: everything, plus status and reach. */
export interface AdminAnnouncement {
  id: number;
  header: string;
  body: string;
  audience: AnnouncementAudience;
  /** ET calendar day the window opens (inclusive). */
  startDate: string;
  /** ET calendar day the window closes (inclusive). */
  endDate: string;
  /** Manual kill switch; false = retired regardless of the dates. */
  isActive: boolean;
  status: AnnouncementStatus;
  createdAt: string;
  reach: AnnouncementReach;
}

/** What the admin form submits to create or update a notice. */
export interface AnnouncementInput {
  header: string;
  body: string;
  audience: AnnouncementAudience;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

/** What the client posts once a notice has actually been shown to a player. */
export interface AnnouncementSeenInput {
  id: number;
  /** Anonymous per-device id — the same one the round beacons carry. */
  playerId: string;
  surface: Surface;
}
