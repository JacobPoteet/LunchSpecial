// Lunch Special API. Static assets (the React app) are served by Workers
// Assets; `run_worker_first: ["/api/*"]` means only API requests land here.

import { Hono } from "hono";
import adminRoutes from "./routes/admin";
import analyticsRoutes from "./routes/analytics";
import discordRoutes from "./routes/discord";
import publicRoutes from "./routes/public";
import statsRoutes from "./routes/stats";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/admin", adminRoutes);
// Engagement beacons. Mounted at "/api/rounds", NOT "/api/analytics" — ad
// blockers ship filter rules matching that path shape, and a blocked beacon is
// indistinguishable from a delivered one (they're fire-and-forget), so those
// players silently vanished from every count. The data is anonymous and
// device-scoped, never tied to a person. See routes/analytics.ts.
app.route("/api/rounds", analyticsRoutes);
// OAuth token exchange for the Discord Activity's Rich Presence. See routes/discord.ts.
app.route("/api/discord", discordRoutes);
app.route("/api/stats", statsRoutes);
app.route("/api", publicRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(JSON.stringify({ message: "unhandled error", error: String(err), path: c.req.path }));
  return c.json({ error: "Something went wrong in the kitchen" }, 500);
});

export default app;
