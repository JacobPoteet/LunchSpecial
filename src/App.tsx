import { lazy, Suspense } from "react";
import GamePage from "./game/GamePage";
import sceneUrl from "./assets/art/diner-backdrop.png";

const AdminApp = lazy(() => import("./admin/AdminApp"));

export default function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");
  if (isAdmin) {
    return (
      <Suspense fallback={<p style={{ color: "var(--cream)", textAlign: "center", marginTop: 40 }}>Loading…</p>}>
        <AdminApp />
      </Suspense>
    );
  }
  return (
    <div style={{ ["--scene-art" as string]: `url(${sceneUrl})` }}>
      <GamePage />
    </div>
  );
}
