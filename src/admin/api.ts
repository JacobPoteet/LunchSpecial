// Admin API client. Session cookie rides along automatically (same origin).

import type {
  AdminAnnouncement,
  AdminDashboard,
  AdminDishDetail,
  AdminDishInput,
  AdminDishRow,
  ActivityFeed,
  AnalyticsSummary,
  AnnouncementInput,
  DeviceDataDeleted,
  DeviceDataSummary,
  DishReport,
  DishRequest,
  ExperimentInput,
  ExperimentReport,
  MenuMix,
  ScheduleEntry,
  Surface,
} from "../../shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, init);
  } catch {
    // fetch() itself rejected, so nothing reached the Worker: offline, or a
    // content blocker cancelled the request in the browser. The native message
    // ("NetworkError when attempting to fetch resource") explains neither.
    throw new ApiError("Couldn't reach the kitchen — check your connection or an ad/content blocker", 0);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body === null) {
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
  }
  return body;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const login = (password: string) => request<{ ok: true }>("/login", json({ password }));
export const logout = () => request<{ ok: true }>("/logout", { method: "POST" });
export const getSession = () => request<{ loggedIn: boolean }>("/session");
export const getDashboard = () => request<AdminDashboard>("/dashboard");
/**
 * Optionally filter engagement to one surface (web / discord); omit for all.
 * `date` (YYYY-MM-DD) moves the day slice to an earlier ET day; omit for today.
 */
export const getAnalytics = (surface?: Surface, date?: string) => {
  const q = new URLSearchParams();
  if (surface) q.set("surface", surface);
  if (date) q.set("date", date);
  const qs = q.toString();
  return request<AnalyticsSummary>(`/analytics${qs ? `?${qs}` : ""}`);
};
/**
 * One page of the activity feed: rounds (not beacons — see the route comment in
 * worker/routes/admin.ts), the arrivals they sit under, and the per-device-day
 * totals that keep a group header honest about what it can't see.
 *
 * `limit` counts **rounds**, which is the point of the rename: the old
 * events endpoint returned somewhere between a third and all of `limit` games
 * depending on how many got finished and shared.
 *
 * `date` pins the feed to one ET day; omit it for "most recent". `mine` keeps or
 * drops one player id (this device's own test rounds), server-side.
 *
 * Path is "/recent-rounds", not "/analytics/events" — ad blockers block the
 * latter shape outright.
 */
export const getActivity = (opts: {
  surface?: Surface;
  limit: number;
  date?: string | null;
  mine?: { playerId: string; mode: "only" | "hide" };
}) => {
  const q = new URLSearchParams({ limit: String(opts.limit) });
  if (opts.surface) q.set("surface", opts.surface);
  if (opts.date) q.set("date", opts.date);
  if (opts.mine) {
    q.set("player", opts.mine.playerId);
    q.set("playerMode", opts.mine.mode);
  }
  return request<ActivityFeed>(`/recent-rounds?${q}`);
};
/**
 * What this browser's own anonymous device id has written into the analytics
 * tables — the review step before {@link deleteDeviceData}. Same "who is me" as
 * the feed's mine filter above: the localStorage player id.
 * No surface filter: the point is *everything* this device recorded, and a
 * filtered summary would under-report what the delete removes.
 */
export const getDeviceData = (playerId: string) =>
  request<DeviceDataSummary>(`/device-data?player=${encodeURIComponent(playerId)}`);
/** Irreversible. Returns what each table actually lost, not what was asked for. */
export const deleteDeviceData = (playerId: string) =>
  request<DeviceDataDeleted>(`/device-data?player=${encodeURIComponent(playerId)}`, { method: "DELETE" });
/** Menu composition (region/course/protein/temperature ratios). No filters — catalogue data. */
export const getMenuMix = () => request<MenuMix>("/menu-mix");
/**
 * How each dish actually played — the other half of the Menu tab. Player data,
 * so unlike the mix it takes the surface filter.
 * Path is "/dish-report", not "/dish-stats" or anything with "analytics" in it —
 * see the route comment in worker/routes/admin.ts: ad blockers match those shapes.
 */
export const getDishReport = (surface?: Surface) =>
  request<DishReport>(`/dish-report${surface ? `?surface=${surface}` : ""}`);
/**
 * The change log plus the all-time daily series it's measured against. One call:
 * the tab re-windows and re-metrics every experiment client-side, so switching
 * "last 7 days" to "last 28" costs nothing.
 */
export const getExperiments = (surface?: Surface) =>
  request<ExperimentReport>(`/experiments${surface ? `?surface=${surface}` : ""}`);
export const createExperiment = (input: ExperimentInput) => request<{ id: number }>("/experiments", json(input));
export const updateExperiment = (id: number, input: ExperimentInput) =>
  request<{ id: number }>(`/experiments/${id}`, { ...json(input), method: "PUT" });
export const deleteExperiment = (id: number) =>
  request<{ ok: true }>(`/experiments/${id}`, { method: "DELETE" });
export const getDishes = () => request<AdminDishRow[]>("/dishes");
export const getDish = (id: number) => request<AdminDishDetail>(`/dishes/${id}`);
export const createDish = (input: AdminDishInput) => request<{ id: number }>("/dishes", json(input));
export const updateDish = (id: number, input: AdminDishInput) =>
  request<{ id: number }>(`/dishes/${id}`, { ...json(input), method: "PUT" });
export const deleteDish = (id: number) => request<{ ok: true }>(`/dishes/${id}`, { method: "DELETE" });
export const getIngredients = () => request<string[]>("/ingredients");
export const getSchedule = () => request<ScheduleEntry[]>("/schedule");
export const setSchedule = (date: string, dishId: number | null) =>
  request<{ ok: true }>("/schedule", { ...json({ date, dishId }), method: "PUT" });
export const autofillSchedule = () => request<{ filled: number }>("/schedule/autofill", { method: "POST" });
/**
 * Book one day with a random dish that has never been the Special. Returns the
 * dish it landed on plus how many were in the pool it rolled from, so the card
 * can redraw without a second fetch. 409 when nothing is left unserved.
 */
export const shuffleSchedule = (date: string) =>
  request<{ date: string; dishId: number; dishName: string; remaining: number }>(
    "/schedule/shuffle",
    json({ date }),
  );
export const createPreview = (dishId: number) => request<{ token: string; url: string }>("/preview", json({ dishId }));
export const getRequests = () => request<DishRequest[]>("/requests");
export const deleteRequest = (id: number) => request<{ ok: true }>(`/requests/${id}`, { method: "DELETE" });
/** Every notice ever posted, newest window first, each with its reach numbers. */
export const getAnnouncements = () => request<AdminAnnouncement[]>("/announcements");
export const createAnnouncement = (input: AnnouncementInput) => request<{ id: number }>("/announcements", json(input));
export const updateAnnouncement = (id: number, input: AnnouncementInput) =>
  request<{ id: number }>(`/announcements/${id}`, { ...json(input), method: "PUT" });
/** Deletes the notice *and* its view rows — reach numbers go with it. */
export const deleteAnnouncement = (id: number) =>
  request<{ ok: true }>(`/announcements/${id}`, { method: "DELETE" });
