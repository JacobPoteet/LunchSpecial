// /api/admin/issues: the back office's File an issue button. GitHub is the
// record; there is no D1 table.

import { Hono } from "hono";
import type { IssueBoard } from "../../../shared/types";

import {
  buildIssueBody,
  GITHUB_API,
  githubError,
  githubHeaders,
  parseIssueInput,
  parseRepo,
  toIssue,
  toIssues,
  toLabels,
  type GithubRepo,
} from "../../github";

const app = new Hono<{ Bindings: Env }>();

// ---- Issues (filed straight to GitHub) ----
//
// The back office's own bug tracker. Nothing lands in D1: GitHub is the record,
// unlike dish_requests, which is an inbox with no other home. That also means
// there is no migration here and nothing to back up.
//
// GITHUB_TOKEN is a Worker secret (a fine-grained PAT with Issues: Read and
// write on this one repo, and nothing else). It never reaches the browser —
// same rule as DISCORD_CLIENT_SECRET, and for the same reason: it can write to
// the repository. GITHUB_REPO is a plain var in wrangler.jsonc, because
// "JacobPoteet/LunchSpecial" is not a secret and is worth being greppable.

interface GithubConfig {
  repo: GithubRepo;
  /** `owner/name`, for the URLs and for anything shown to a human. */
  slug: string;
  token: string;
}

function githubConfig(env: Env): GithubConfig | null {
  const token = env.GITHUB_TOKEN;
  const repo = parseRepo(env.GITHUB_REPO);
  if (!token || !repo) return null;
  return { repo, slug: `${repo.owner}/${repo.name}`, token };
}

/**
 * Everything the composer needs on open, in one round trip: the repo's labels
 * and its open issues, fetched in parallel.
 *
 * An unconfigured deployment answers **200 with `configured: false`**, where the
 * Discord routes answer 503 for the same state. The difference is what the
 * client does with it: the composer's whole job then is to name the missing
 * secret, and a 503 would put that sentence behind an error banner instead of
 * in the panel. The write below still 503s — there you genuinely cannot file.
 */
app.get("/issues", async (c) => {
  const cfg = githubConfig(c.env);
  const slug = cfg?.slug ?? (c.env.GITHUB_REPO ?? "");
  if (!cfg) return c.json<IssueBoard>({ configured: false, repo: slug, labels: [], open: [] });

  const base = `${GITHUB_API}/repos/${cfg.repo.owner}/${cfg.repo.name}`;
  const headers = githubHeaders(cfg.token);
  let issuesRes: Response;
  let labelsRes: Response;
  try {
    [issuesRes, labelsRes] = await Promise.all([
      fetch(`${base}/issues?state=open&per_page=50&sort=created&direction=desc`, { headers }),
      fetch(`${base}/labels?per_page=100`, { headers }),
    ]);
  } catch {
    return c.json({ error: "Couldn't reach GitHub" }, 502);
  }
  if (!issuesRes.ok) return c.json({ error: githubError(issuesRes.status, cfg.slug) }, 502);

  const board: IssueBoard = {
    configured: true,
    repo: cfg.slug,
    // A failed label fetch costs you the chips, not the composer. Labels are a
    // convenience; being unable to file at all because one of two calls missed
    // would not be.
    labels: labelsRes.ok ? toLabels(await labelsRes.json()) : [],
    open: toIssues(await issuesRes.json()),
  };
  return c.json(board);
});

app.post("/issues", async (c) => {
  const cfg = githubConfig(c.env);
  if (!cfg) return c.json({ error: "Filing issues is not configured on this deployment" }, 503);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = parseIssueInput(raw);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);

  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}/repos/${cfg.repo.owner}/${cfg.repo.name}/issues`, {
      method: "POST",
      headers: { ...githubHeaders(cfg.token), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: parsed.input.title,
        body: buildIssueBody(parsed.input, new Date().toISOString()),
        labels: parsed.input.labels,
      }),
    });
  } catch {
    return c.json({ error: "Couldn't reach GitHub" }, 502);
  }
  if (!res.ok) return c.json({ error: githubError(res.status, cfg.slug) }, 502);

  const issue = toIssue(await res.json());
  // A 201 whose body we can't read means the issue exists and we've lost the
  // handle to it. Say so rather than reporting a failure that would invite a
  // second, duplicate filing.
  if (!issue) return c.json({ error: "GitHub accepted the issue but sent back something unreadable" }, 502);
  return c.json(issue);
});

export default app;
