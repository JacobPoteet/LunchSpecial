import { useEffect, useState } from "react";
import type { AdminDashboard, AnalyticsSummary } from "../../shared/types";
import * as api from "./api";
import type { AdminView } from "./AdminApp";
import ActivityPanel from "./ActivityPanel";
import MenuMixPanel from "./MenuMixPanel";
import OverviewPanel from "./OverviewPanel";
import PlayersPanel from "./PlayersPanel";
import TrendsPanel from "./TrendsPanel";
import { SurfaceToggle, type SurfaceFilter } from "./analyticsUi";

/**
 * The dashboard used to be one ~9-screen scroll. It's now five tabs, in the
 * order you'd actually work through them: what needs a decision, what the
 * kitchen is serving, what players did with it, how that's moving, and the raw
 * feed underneath.
 */
export type DashboardTab = "overview" | "menu" | "players" | "trends" | "activity";

const TABS: { key: DashboardTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "menu", label: "Menu mix" },
  { key: "players", label: "Players" },
  { key: "trends", label: "Trends" },
  { key: "activity", label: "Activity" },
];

const DEFAULT_TAB: DashboardTab = "overview";

/**
 * Menu mix reads the schedule × dishes catalogue, not player beacons, so it has
 * no surface to filter by — the toggle would be a lie there.
 */
const SURFACE_AWARE: DashboardTab[] = ["overview", "players", "trends", "activity"];

const QUERY_KEY = "tab";

/** Which tab the URL asks for, so a reload or a bookmark lands where you were. */
function tabFromUrl(): DashboardTab {
  try {
    const asked = new URLSearchParams(window.location.search).get(QUERY_KEY);
    return TABS.some((t) => t.key === asked) ? (asked as DashboardTab) : DEFAULT_TAB;
  } catch {
    return DEFAULT_TAB;
  }
}

/** Mirror the tab into the query string without adding history entries. */
function writeTabToUrl(tab: DashboardTab | null) {
  try {
    const url = new URL(window.location.href);
    if (tab === null || tab === DEFAULT_TAB) url.searchParams.delete(QUERY_KEY);
    else url.searchParams.set(QUERY_KEY, tab);
    window.history.replaceState(null, "", url);
  } catch {
    // Non-fatal — the tab just won't survive a reload.
  }
}

export default function Dashboard({
  onNavigate,
  onOpenDish,
}: {
  onNavigate: (view: AdminView) => void;
  onOpenDish: (id: number | null) => void;
}) {
  const [tab, setTab] = useState<DashboardTab>(tabFromUrl);

  const [dash, setDash] = useState<AdminDashboard | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);

  // One /analytics fetch feeds Overview, Players and Trends — the endpoint
  // already returns every slice, so the tabs are pure presentation.
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Both filters live up here so they survive switching tabs. `date` stays null
  // for "today" so the day slice keeps following the midnight-ET rollover
  // instead of pinning to a stale date.
  const [surface, setSurface] = useState<SurfaceFilter>("all");
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    writeTabToUrl(tab);
  }, [tab]);

  // Leaving the dashboard (Dishes, Schedule, …) shouldn't leave ?tab= behind.
  useEffect(() => () => writeTabToUrl(null), []);

  useEffect(() => {
    api.getDashboard().then(setDash, (e: Error) => setDashError(e.message));
  }, []);

  useEffect(() => {
    let live = true;
    setAnalyticsError(null);
    api.getAnalytics(surface === "all" ? undefined : surface, date ?? undefined).then(
      (d) => live && setAnalytics(d),
      (e: Error) => live && setAnalyticsError(e.message),
    );
    return () => {
      live = false;
    };
  }, [surface, date]);

  return (
    <>
      <div className="admin-tabs">
        <div className="admin-tabs__list" role="tablist" aria-label="Dashboard sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`admin-tabs__btn${tab === t.key ? " admin-tabs__btn--active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {SURFACE_AWARE.includes(tab) && (
          <div className="admin-tabs__tools">
            <SurfaceToggle value={surface} onChange={setSurface} />
          </div>
        )}
      </div>

      {tab === "overview" && (
        <OverviewPanel
          data={dash}
          error={dashError}
          analytics={analytics}
          analyticsError={analyticsError}
          surface={surface}
          onNavigate={onNavigate}
          onOpenDish={onOpenDish}
          onOpenTab={setTab}
        />
      )}
      {/* Menu mix and Activity fetch their own endpoints — mounting them only
          when their tab is open keeps the dashboard's first paint to two calls. */}
      {tab === "menu" && <MenuMixPanel />}
      {tab === "players" && (
        <PlayersPanel
          data={analytics}
          error={analyticsError}
          surface={surface}
          date={date}
          onPickDate={setDate}
        />
      )}
      {tab === "trends" && <TrendsPanel data={analytics} error={analyticsError} surface={surface} />}
      {tab === "activity" && <ActivityPanel surface={surface} />}
    </>
  );
}
