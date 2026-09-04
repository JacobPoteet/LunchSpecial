import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import GamePage from "./game/GamePage";
import NightPage from "./game/NightPage";
import LightsOut, { LIGHTS_OUT_MS, prefersReducedMotion } from "./game/LightsOut";
import { surfaceUrl } from "./discord/bootstrap";
import { devUrl } from "./game/devHarness";
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

  // Back and forward. The bar is one history entry past the diner (see
  // openBar), so the browser's own back gesture is a real way out of it — which
  // matters most on a phone, where it is the primary one and the game's main
  // surface.
  useEffect(() => {
    if (isAdmin) return;
    const onPop = () => setRoom(urlWantsBar() ? "bar" : "diner");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isAdmin]);

  /**
   * Arrive in the bar, and leave a way back.
   *
   * pushState, NOT replaceState. Replacing overwrote the diner's history entry,
   * so pressing back from the bar skipped straight past the check to whatever
   * preceded the game — on a fresh visit, off the site entirely. The URL still
   * carries `bar=1` either way, so a reload lands where the player was.
   */
  const openBar = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("bar", "1");
      window.history.pushState(null, "", url);
    } catch {
      // Non-fatal — the room still changes, a reload just lands in the diner.
    }
    setRoom("bar");
  }, []);

  const enterBar = useCallback(() => {
    // A player who has asked for less motion gets the same destination with no
    // journey, rather than a shorter journey.
    if (prefersReducedMotion()) {
      openBar();
      return;
    }
    setRoom("dimming");
    window.setTimeout(openBar, LIGHTS_OUT_MS);
  }, [openBar]);

  // Leaving is a plain navigation rather than a state flip. The diner has a
  // how-to, an archive, notices and a rollover watcher, all of which read their
  // world at mount — reusing a GamePage that has been sitting behind a modal
  // since 8pm would be the subtler of the two bugs.
  const leaveBar = useCallback(() => {
    window.location.assign(surfaceUrl(devUrl("/")));
  }, []);

  if (isAdmin) {
    return (
      <Suspense fallback={<p style={{ color: "var(--cream)", textAlign: "center", marginTop: 40 }}>Loading…</p>}>
        <AdminApp />
      </Suspense>
    );
  }

  // The backdrop's URL is a hashed asset path, so it can only reach CSS from
  // here. It wraps BOTH rooms deliberately: the bar is the same room with the
  // lights off, and `.scene--bar::before` dims and desaturates this exact image
  // rather than replacing it. Returning NightPage outside this div is what made
  // the bar a flat black field — `var(--scene-art)` resolved to nothing, so
  // there was no picture left for the filter to act on.
  return (
    <div style={{ ["--scene-art" as string]: `url(${sceneUrl})` }}>
      {room === "bar" ? (
        <NightPage onLeave={leaveBar} />
      ) : (
        <>
          <GamePage onEnterBar={enterBar} />
          {room === "dimming" && <LightsOut />}
        </>
      )}
    </div>
  );
}
