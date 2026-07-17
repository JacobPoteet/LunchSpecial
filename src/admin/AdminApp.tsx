import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import Dashboard from "./Dashboard";
import DishEditor from "./DishEditor";
import DishList from "./DishList";
import ScheduleView from "./ScheduleView";

export type AdminView = "dashboard" | "dishes" | "schedule";

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

  useEffect(() => {
    api.getSession().then(
      ({ loggedIn }) => setSession(loggedIn ? "in" : "out"),
      () => setSession("out"),
    );
  }, []);

  const openDish = useCallback((id: number | null) => {
    setView("dishes");
    setEditing(id);
  }, []);

  const changeView = (v: AdminView) => {
    setView(v);
    setEditing(undefined);
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
                <DishEditor dishId={editing} onDone={() => setEditing(undefined)} />
              ))}
            {view === "schedule" && <ScheduleView onOpenDish={openDish} />}
          </>
        )}
      </div>
    </div>
  );
}
