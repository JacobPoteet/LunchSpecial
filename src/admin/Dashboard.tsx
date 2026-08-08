import { useEffect, useState } from "react";
import type { AdminDashboard, AnalyticsSummary, ExperimentReport } from "../../shared/types";
import * as api from "./api";
import type { AdminView } from "./AdminApp";
import ActivityPanel from "./ActivityPanel";
import DishReportPanel from "./DishReportPanel";
import ExperimentsPanel from "./ExperimentsPanel";
import MenuMixPanel from "./MenuMixPanel";
import OverviewPanel from "./OverviewPanel";
import PlayersPanel from "./PlayersPanel";
import TrendsPanel from "./TrendsPanel";
import { SurfaceToggle, type SurfaceFilter } from "./analyticsUi";

/**
 * The dashboard used to be one ~9-screen scroll. It's now five tabs, each holding
 * one *question* rather than one data source — which is the reorganisation the
 * tabs got wrong the first time: Overview and Players both rendered the day
 * slice, while Trends carried the audience charts (retention, country) that had
 * nothing to do with time.
 *
 * Read left to right: what's happening right now, what we're serving and how it
 * lands, who's playing, where it's all going, whether anything we did caused it,
 * and the raw feed underneath.
 *
 * Experiments sits at the end deliberately — it's the only tab that asks a
 * question about *your* actions rather than about the game, and it's the one you
 * arrive at having already seen a number move.
 */
export type DashboardTab = "today" | "menu" | "players" | "trends" | "experiments" | "activity";

const TABS: { key: DashboardTab; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "menu", label: "Menu" },
  { key: "players", label: "Players" },
  { key: "trends", label: "Trends" },
  { key: "experiments", label: "Experiments" },
  { key: "activity", label: "Activity" },
];

const DEFAULT_TAB: DashboardTab = "today";

/**
 * Every tab now reads player beacons somewhere. Menu is the mixed case — its
 * composition half is pure catalogue and ignores the filter, its performance half
 * doesn't — which the panel says out loud rather than letting the toggle imply it
 * applies to both.
 */
const SURFACE_AWARE: DashboardTab[] = ["today", "menu", "players", "trends", "experiments", "activity"];

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

  const [report, setReport] = useState<ExperimentReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportReloads, setReportReloads] = useState(0);

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

  // The change log, shared by two tabs: Experiments reads all of it, Trends
  // needs only the labels and dates for its chart markers. Fetched here so the
  // all-time series behind it is queried once rather than per tab, and only
  // once one of those tabs is actually open.
  useEffect(() => {
    if (tab !== "trends" && tab !== "experiments") return;
    let live = true;
    setReportError(null);
    api.getExperiments(surface === "all" ? undefined : surface).then(
      (r) => live && setReport(r),
      (e: Error) => live && setReportError(e.message),
    );
    return () => {
      live = false;
    };
  }, [tab, surface, reportReloads]);

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

      {tab === "today" && (
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
      {/* Menu and Activity fetch their own endpoints — mounting them only when
          their tab is open keeps the dashboard's first paint to two calls.
          Performance leads the mix: "how did it land" is the read you'd act on,
          and the composition below is the context it came from. */}
      {tab === "menu" && (
        <>
          <DishReportPanel surface={surface} />
          <MenuMixPanel />
        </>
      )}
      {tab === "players" && (
        <PlayersPanel
          data={analytics}
          error={analyticsError}
          surface={surface}
          date={date}
          onPickDate={setDate}
        />
      )}
      {tab === "trends" && (
        <TrendsPanel
          data={analytics}
          error={analyticsError}
          surface={surface}
          experiments={report?.experiments ?? []}
        />
      )}
      {tab === "experiments" && (
        <ExperimentsPanel
          report={report}
          error={reportError}
          onChanged={() => setReportReloads((n) => n + 1)}
        />
      )}
      {tab === "activity" && <ActivityPanel surface={surface} />}
    </>
  );
}
