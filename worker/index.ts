// Lunch Special API. Static assets (the React app) are served by Workers
// Assets; `run_worker_first: ["/api/*"]` means only API requests land here.

import { Hono } from "hono";
import adminRoutes from "./routes/admin";
import analyticsRoutes from "./routes/analytics";
import publicRoutes from "./routes/public";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/admin", adminRoutes);
app.route("/api/analytics", analyticsRoutes);
app.route("/api", publicRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(JSON.stringify({ message: "unhandled error", error: String(err), path: c.req.path }));
  return c.json({ error: "Something went wrong in the kitchen" }, 500);
});

export default app;
