import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initDiscord } from "./discord/bootstrap";
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
void initDiscord().then(mount);
