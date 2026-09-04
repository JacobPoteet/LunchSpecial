import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import GamePage from "./game/GamePage";
import NightPage from "./game/NightPage";
import LightsOut, { LIGHTS_OUT_MS, prefersReducedMotion } from "./game/LightsOut";
import { surfaceUrl } from "./discord/bootstrap";
import sceneUrl from "./assets/art/diner-backdrop.png";

const AdminApp = lazy(() => import("./admin/AdminApp"));

/**
 * Which room the page is in.
 *
 * `dimming` is a real state rather than a flag on one of the other two, because
 * during it both are true and neither is: the diner is still mounted (so the
 * check the player was reading has not vanished under them) and the bar has not
 * started loading yet.
 */
type Room = "diner" | "dimming" | "bar";

/** `?bar=1` deep-links straight into After Dark — a reload, or an admin's test pour. */
function urlWantsBar(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("bar");
  } catch {
    return false;
  }
}

export default function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  // Read once. Everything after this is state, and the hooks below must not sit
  // behind the admin branch's early return.
  const [room, setRoom] = useState<Room>(() => (urlWantsBar() ? "bar" : "diner"));

  // Mirror the room into the URL without a history entry, so a reload lands
  // where the player was. Deliberately replaceState rather than a navigation:
  // navigating would unmount the whole app and lose the sweep, which is the one
  // thing the transition exists to show.
  useEffect(() => {
    if (isAdmin) return;
    try {
      const url = new URL(window.location.href);
      if (room === "bar") url.searchParams.set("bar", "1");
      else if (room === "diner") url.searchParams.delete("bar");
      else return; // mid-sweep: the URL follows the destination, not the journey
      window.history.replaceState(null, "", url);
    } catch {
      // Non-fatal — a reload just lands in the diner.
    }
  }, [room, isAdmin]);

  const enterBar = useCallback(() => {
    // A player who has asked for less motion gets the same destination with no
    // journey, rather than a shorter journey.
    if (prefersReducedMotion()) {
      setRoom("bar");
      return;
    }
    setRoom("dimming");
    window.setTimeout(() => setRoom("bar"), LIGHTS_OUT_MS);
  }, []);

  // Leaving is a plain navigation rather than a state flip. The diner has a
  // how-to, an archive, notices and a rollover watcher, all of which read their
  // world at mount — reusing a GamePage that has been sitting behind a modal
  // since 8pm would be the subtler of the two bugs.
  const leaveBar = useCallback(() => {
    window.location.assign(surfaceUrl("/"));
  }, []);

  if (isAdmin) {
    return (
      <Suspense fallback={<p style={{ color: "var(--cream)", textAlign: "center", marginTop: 40 }}>Loading…</p>}>
        <AdminApp />
      </Suspense>
    );
  }

  if (room === "bar") return <NightPage onLeave={leaveBar} />;

  return (
    <div style={{ ["--scene-art" as string]: `url(${sceneUrl})` }}>
      <GamePage onEnterBar={enterBar} />
      {room === "dimming" && <LightsOut />}
    </div>
  );
}
