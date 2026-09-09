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
// The harness alongside it is a no-op on every URL without `?handoff=1`, and a
// no-op in production besides. It has to run BEFORE the mount, because GamePage
// reads its round in a useState initialiser and a board that is already
// finished at first render opens its check instantly instead of replaying a win
// nobody watched — which is exactly what that harness is for.
//
// The demo (src/game/demo.ts) used to be seeded here for the same reason and no
// longer is: a demo visitor lands on a *playable* board now, so there is
// nothing to seed, and nothing about the demo gates the mount.
void Promise.all([initDiscord(), applyHandoffHarness()]).then(mount);
