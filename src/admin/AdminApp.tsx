import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import AnnouncementsPanel from "./AnnouncementsPanel";
import Dashboard from "./Dashboard";
import DishEditor from "./DishEditor";
import DishList from "./DishList";
import RequestsView from "./RequestsView";
import ScheduleView from "./ScheduleView";

export type AdminView = "dashboard" | "dishes" | "schedule" | "announcements" | "requests";

/** Prefill for a brand-new dish opened from a player request. */
export interface DishDraft {
  prefill: { name: string; country: string };
  /** The request this draft came from; removed from the inbox once the dish saves. */
  requestId: number;
}

function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login panel">
      <h2>Staff only</h2>
      {error && <p className="form-error">{error}</p>}
      <form onSubmit={submit}>
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button className="btn btn--red" disabled={busy || !password} type="submit">
          {busy ? "Checking…" : "Clock in"}
        </button>
      </form>
    </div>
  );
}

export default function AdminApp() {
  const [session, setSession] = useState<"checking" | "out" | "in">("checking");
  const [view, setView] = useState<AdminView>("dashboard");
  // undefined = not editing; null = new dish; number = existing dish
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  // Prefill for a new dish opened from a request (only meaningful when editing === null).
  const [draft, setDraft] = useState<DishDraft | null>(null);
  // Count of pending player requests, shown as a nav badge.
  const [requestCount, setRequestCount] = useState<number | null>(null);

  const refreshRequestCount = useCallback(() => {
    api.getRequests().then(
      (rows) => setRequestCount(rows.length),
      () => {},
    );
  }, []);

  useEffect(() => {
    api.getSession().then(
      ({ loggedIn }) => setSession(loggedIn ? "in" : "out"),
      () => setSession("out"),
    );
  }, []);

  useEffect(() => {
    if (session === "in") refreshRequestCount();
  }, [session, refreshRequestCount]);

  const openDish = useCallback((id: number | null) => {
    setView("dishes");
    setEditing(id);
    setDraft(null);
  }, []);

  // "Add as dish" from a request: open a prefilled new-dish editor.
  const openDishFromRequest = useCallback((d: DishDraft) => {
    setView("dishes");
    setEditing(null);
    setDraft(d);
  }, []);

  const changeView = (v: AdminView) => {
    setView(v);
    setEditing(undefined);
    setDraft(null);
  };

  return (
    <div className="admin">
      <div className="admin__shell">
        <header className="admin__masthead">
          <h1 className="admin__title">
            Lunch Special
            <small>BACK OFFICE</small>
          </h1>
          {session === "in" && (
            <nav className="admin-nav">
              <button className={view === "dashboard" ? "active" : ""} onClick={() => changeView("dashboard")}>
                Dashboard
              </button>
              <button className={view === "dishes" ? "active" : ""} onClick={() => changeView("dishes")}>
                Dishes
              </button>
              <button className={view === "schedule" ? "active" : ""} onClick={() => changeView("schedule")}>
                Schedule
              </button>
              <button
                className={view === "announcements" ? "active" : ""}
                onClick={() => changeView("announcements")}
              >
                Announcements
              </button>
              <button className={view === "requests" ? "active" : ""} onClick={() => changeView("requests")}>
                Requests
                {requestCount ? <span className="nav-badge">{requestCount}</span> : null}
              </button>
              <button
                onClick={() => {
                  api.logout().finally(() => setSession("out"));
                }}
              >
                Clock out
              </button>
            </nav>
          )}
        </header>

        {session === "checking" && <p style={{ color: "var(--cream)" }}>Checking your apron…</p>}
        {session === "out" && <Login onLoggedIn={() => setSession("in")} />}
        {session === "in" && (
          <>
            {view === "dashboard" && <Dashboard onNavigate={changeView} onOpenDish={openDish} />}
            {view === "dishes" &&
              (editing === undefined ? (
                <DishList onOpenDish={openDish} />
              ) : (
                <DishEditor
                  dishId={editing}
                  prefill={editing === null ? draft?.prefill : undefined}
                  requestId={editing === null ? draft?.requestId : undefined}
                  onRequestConsumed={refreshRequestCount}
                  onDone={() => {
                    setEditing(undefined);
                    setDraft(null);
                  }}
                />
              ))}
            {view === "schedule" && <ScheduleView onOpenDish={openDish} />}
            {view === "announcements" && <AnnouncementsPanel />}
            {view === "requests" && (
              <RequestsView onAddAsDish={openDishFromRequest} onCountChange={setRequestCount} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
