// Admin API client. Session cookie rides along automatically (same origin).

import type {
  AdminDashboard,
  AdminDishDetail,
  AdminDishInput,
  AdminDishRow,
  AnalyticsSummary,
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
  const res = await fetch(`/api/admin${path}`, init);
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
/** Optionally filter engagement to one surface (web / discord); omit for all. */
export const getAnalytics = (surface?: Surface) =>
  request<AnalyticsSummary>(`/analytics${surface ? `?surface=${surface}` : ""}`);
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
