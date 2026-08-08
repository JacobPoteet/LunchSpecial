// Admin API client. Session cookie rides along automatically (same origin).

import type {
  AdminAnnouncement,
  AdminDashboard,
  AdminDishDetail,
  AdminDishInput,
  AdminDishRow,
  AnalyticsEvent,
  AnalyticsSummary,
  AnnouncementInput,
  DishReport,
  DishRequest,
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
 * Recent activity feed, newest first. Same optional surface filter as above,
 * plus an optional "mine" filter that keeps or drops one player id (this
 * device's own test rounds) — applied server-side so `limit` counts the rows
 * that actually come back.
 * Path is "/recent-rounds", not "/analytics/events" — see the route comment in
 * worker/routes/admin.ts: ad blockers block the latter shape outright.
 */
export const getAnalyticsEvents = (
  surface: Surface | undefined,
  limit: number,
  mine?: { playerId: string; mode: "only" | "hide" },
) =>
  request<AnalyticsEvent[]>(
    `/recent-rounds?limit=${limit}${surface ? `&surface=${surface}` : ""}` +
      (mine ? `&player=${encodeURIComponent(mine.playerId)}&playerMode=${mine.mode}` : ""),
  );
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
