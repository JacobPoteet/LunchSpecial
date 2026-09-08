import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initDiscord } from "./discord/bootstrap";
import { applyHandoffHarness } from "./game/devHarness";
import { applyShowcase } from "./game/showcase";
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
// The two seeds alongside it are no-ops on every URL carrying neither
// `?handoff=1` nor `?showcase=…` (and the harness is a no-op in production
// besides). Both have to run BEFORE the mount, because GamePage reads its round
// in a useState initialiser and a board that is already finished at first
// render opens its check instantly instead of replaying a win nobody watched.
// See src/game/devHarness.ts and src/game/showcase.ts.
void Promise.all([initDiscord(), applyHandoffHarness(), applyShowcase()]).then(mount);
