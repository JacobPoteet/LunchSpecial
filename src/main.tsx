import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initDiscord } from "./discord/bootstrap";
import { applyHandoffHarness } from "./game/devHarness";
import "./styles/base.css";
import "./styles/game.css";
import "./styles/admin.css";

function mount() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Complete the Discord Activity handshake before mounting when embedded. On the
// open web this resolves to null synchronously and mounts immediately — the
// Embedded App SDK is never downloaded. See src/discord/bootstrap.ts.
//
// The harness alongside it is a no-op in production and on every URL without
// `?handoff=1`; it has to run BEFORE the mount because GamePage reads the
// stored round in a useState initialiser. See src/game/devHarness.ts.
void Promise.all([initDiscord(), applyHandoffHarness()]).then(mount);
