// /api/admin/*: the back office's API, one file per concern.
//
// Mount order is load-bearing. Hono applies a middleware to every route
// registered after it, so the session guard sits between the three routes
// that don't need one (login, logout, session) and everything that does. A
// new file goes below the guard.

import { Hono } from "hono";
import { isLoggedIn } from "./auth";
import auth from "./auth";
import activity from "./activity";
import analytics from "./analytics";
import announcements from "./announcements";
import bar from "./bar";
import dishes from "./dishes";
import experiments from "./experiments";
import issues from "./issues";
import requests from "./requests";
import schedule from "./schedule";

const app = new Hono<{ Bindings: Env }>();

app.route("/", auth);

// Everything below requires a valid session.
app.use("*", async (c, next) => {
  if (!(await isLoggedIn(c, c.env.SESSION_SECRET))) {
    return c.json({ error: "Not logged in" }, 401);
  }
  await next();
});

app.route("/", dishes);
app.route("/", schedule);
app.route("/", requests);
app.route("/", announcements);
app.route("/", analytics);
app.route("/", experiments);
app.route("/", activity);
app.route("/", issues);
app.route("/", bar);

export default app;
