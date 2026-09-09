import { useCallback, useEffect, useState } from "react";
import { buildLabel, buildTitle } from "../../shared/build";
import { DEMO_PATH, demoSessionNeeded } from "../../shared/demo";
import type { DishFilter } from "../../shared/dishfilter";
import type { IssueContext } from "../../shared/types";
import * as api from "./api";
import AnnouncementsPanel from "./AnnouncementsPanel";
import BarView from "./BarView";
import Dashboard from "./Dashboard";
import DishEditor from "./DishEditor";
import DishList from "./DishList";
import IssueComposer, { currentIssueContext } from "./IssueComposer";
import { ReadOnlyContext, Withheld, WITHHELD_COPY } from "./readonly";
import RequestsView from "./RequestsView";
import ScheduleView from "./ScheduleView";

export type AdminView = "dashboard" | "dishes" | "schedule" | "bar" | "announcements" | "requests";

/**
 * The nav destinations the read-only demo withholds.
 *
 * Schedule and Bar because they name Specials nobody has played; Requests and
 * Announcements because they are words people wrote. Dishes survives: the
 * catalogue is the game's content, and the Worker strips the two spoilers it
 * carries (a dish's next booking, and the clue text of anything not yet
 * served). See worker/adminsession.ts.
 */
const DEMO_WITHHOLDS: AdminView[] = ["schedule", "bar", "announcements", "requests"];

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
  // A read-only session, the public demo's door into the back office. Nothing
  // below trusts it for safety — the Worker refuses every write by method — but
  // it decides which controls are worth drawing. See src/admin/readonly.ts.
  const [readOnly, setReadOnly] = useState(false);
  // Set when previewing the demo cost you a full session, so the banner can say
  // so rather than leaving you to discover it at the first disabled control.
  const [demoSwap, setDemoSwap] = useState(false);
  const [view, setView] = useState<AdminView>("dashboard");
  // undefined = not editing; null = new dish; number = existing dish
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  // Prefill for a new dish opened from a request (only meaningful when editing === null).
  const [draft, setDraft] = useState<DishDraft | null>(null);
  // Count of pending player requests, shown as a nav badge.
  const [requestCount, setRequestCount] = useState<number | null>(null);
  // A filter handed to the dish list by a link (the dashboard's Menu tab). Null
  // when you arrive by the nav, which leaves whatever filter you parked there.
  const [dishFilter, setDishFilter] = useState<Partial<DishFilter> | null>(null);
  // The issue composer, opened from the nav. Holds the context captured at the
  // moment the button was pressed rather than reading it as it renders — what
  // matters is the screen you were looking at when something looked wrong.
  const [filing, setFiling] = useState<IssueContext | null>(null);

  const refreshRequestCount = useCallback(() => {
    api.getRequests().then(
      (rows) => setRequestCount(rows.length),
      () => {},
    );
  }, []);

  useEffect(() => {
    // `/admin?demo=1` is the link on the demo's banner, and it ALWAYS lands you
    // in the demo — replacing a full session if you had one. See
    // demoSessionNeeded: the owner is the only person who ever checks this URL
    // and was the only person it never showed the demo to.
    const wantsDemo = new URLSearchParams(window.location.search).has("demo");
    api.getSession().then(
      async ({ loggedIn, readOnly: ro }) => {
        const role = loggedIn ? (ro ? "readonly" : "full") : null;
        if (demoSessionNeeded(wantsDemo, role)) {
          try {
            await api.demoSession();
            setReadOnly(true);
            setSession("in");
            // Only worth saying to somebody who just lost a full session.
            setDemoSwap(role === "full");
            return;
          } catch {
            // Falls through to whatever session actually exists.
          }
        }
        setReadOnly(role === "readonly");
        setSession(role === null ? "out" : "in");
      },
      () => setSession("out"),
    );
  }, []);

  useEffect(() => {
    // Not in read-only: the badge counts an inbox the demo cannot open, and
    // asking for it would spend a guaranteed 403 on every load.
    if (session === "in" && !readOnly) refreshRequestCount();
  }, [session, readOnly, refreshRequestCount]);

  const openDish = useCallback((id: number | null) => {
    setView("dishes");
    setEditing(id);
    setDraft(null);
  }, []);

  // "Show me the East Asian desserts nobody has had" — the Menu tab's charts
  // link in here with the filter already applied.
  const openDishes = useCallback((filter: Partial<DishFilter>) => {
    setView("dishes");
    setEditing(undefined);
    setDraft(null);
    setDishFilter(filter);
  }, []);

  // "Add as dish" from a request: open a prefilled new-dish editor.
  const openDishFromRequest = useCallback((d: DishDraft) => {
    setView("dishes");
    setEditing(null);
    setDraft(d);
  }, []);

  // A withheld destination stays clickable and answers with a card that names
  // what is behind it. A disabled tab would be a dead end, and each of these has
  // somewhere to send you instead. See src/admin/readonly.tsx.
  const withheldView = (v: AdminView) => readOnly && DEMO_WITHHOLDS.includes(v);
  const navCls = (v: AdminView) =>
    `${view === v ? "active" : ""}${withheldView(v) ? " nav-withheld-btn" : ""}`.trim();

  const changeView = (v: AdminView) => {
    setView(v);
    setEditing(undefined);
    setDraft(null);
    setDishFilter(null);
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
              <button className={navCls("schedule")} onClick={() => changeView("schedule")}>
                Schedule
                {withheldView("schedule") && <span className="nav-withheld" aria-label="not in the demo">·</span>}
              </button>
              {/* Its own destination beside Schedule rather than a tab
                  inside it: the bar has its own catalogue, its own clue count
                  and its own board, and the one thing that must never happen
                  is a drink being booked onto a lunch day. */}
              <button className={navCls("bar")} onClick={() => changeView("bar")}>
                Bar
                {withheldView("bar") && <span className="nav-withheld" aria-label="not in the demo">·</span>}
              </button>
              <button className={navCls("announcements")} onClick={() => changeView("announcements")}>
                Announcements
                {withheldView("announcements") && (
                  <span className="nav-withheld" aria-label="not in the demo">·</span>
                )}
              </button>
              <button className={navCls("requests")} onClick={() => changeView("requests")}>
                Requests
                {requestCount ? <span className="nav-badge">{requestCount}</span> : null}
                {withheldView("requests") && <span className="nav-withheld" aria-label="not in the demo">·</span>}
              </button>
              {/* An action, not a destination, which is why it takes the
                  mustard tint the nav's other pills don't — but it lives in
                  the nav because "Clock out" set that precedent and because it
                  has to be reachable from every panel, not just one tab.
                  Filing an issue writes to GitHub, so a read-only visitor is
                  not offered it. */}
              {!readOnly && (
                <button
                  className="admin-nav__action"
                  onClick={() => setFiling(currentIssueContext(view, editing))}
                >
                  File an issue
                </button>
              )}
              {readOnly ? (
                <>
                  <button onClick={() => window.location.assign(DEMO_PATH)}>Back to the demo</button>
                  {/* The way out of the preview. Drops the read-only cookie and
                      shows the password form, so an admin is never stranded in
                      a back office that cannot write. */}
                  <button
                    className="admin-nav__action"
                    onClick={() => {
                      api.logout().finally(() => {
                        setReadOnly(false);
                        setDemoSwap(false);
                        setSession("out");
                      });
                    }}
                  >
                    Clock in
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    api.logout().finally(() => setSession("out"));
                  }}
                >
                  Clock out
                </button>
              )}
              {/* Always on, unlike the player-facing marker: this is the back
                  office, it has no screenshot to keep clean, and "did that
                  deploy actually land" is a question you ask here. The title
                  carries the full sha and the build time. */}
              <span className="admin-nav__build" title={buildTitle(__BUILD__)}>
                {buildLabel(__BUILD__)}
              </span>
            </nav>
          )}
        </header>

        {session === "checking" && <p style={{ color: "var(--cream)" }}>Checking your apron…</p>}
        {session === "out" && <Login onLoggedIn={() => setSession("in")} />}
        {/* Said once, at the top, rather than repeated beside every control it
            governs. A visitor needs to know two things about this screen and
            they are both in one sentence: the numbers are real, and nothing
            they do here can change them. */}
        {session === "in" && readOnly && (
          <p className="readonly-banner">
            Read-only demo — live production data. Nothing here can be changed.
            {demoSwap && (
              <>
                {" "}
                <span className="readonly-banner__swap">
                  This is exactly what a visitor sees, so your full session was swapped for it —
                  clock in again to get it back.
                </span>
              </>
            )}
          </p>
        )}
        {session === "in" && (
          <ReadOnlyContext.Provider value={readOnly}>
            {view === "dashboard" && (
              <Dashboard onNavigate={changeView} onOpenDish={openDish} onOpenDishes={openDishes} />
            )}
            {view === "dishes" &&
              (editing === undefined ? (
                <DishList onOpenDish={openDish} incomingFilter={dishFilter} />
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
            {withheldView(view) && <Withheld {...WITHHELD_COPY[view as keyof typeof WITHHELD_COPY]} />}
            {view === "schedule" && !withheldView("schedule") && <ScheduleView onOpenDish={openDish} />}
            {view === "bar" && !withheldView("bar") && <BarView />}
            {view === "announcements" && !withheldView("announcements") && <AnnouncementsPanel />}
            {view === "requests" && !withheldView("requests") && (
              <RequestsView onAddAsDish={openDishFromRequest} onCountChange={setRequestCount} />
            )}
            {filing && <IssueComposer context={filing} onClose={() => setFiling(null)} />}
          </ReadOnlyContext.Provider>
        )}
      </div>
    </div>
  );
}
