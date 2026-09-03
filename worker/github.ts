// PURE GitHub-issue logic: validating what the composer sent, building the body
// that gets posted, and reading GitHub's JSON back into our own shapes. No
// fetch, no Hono, no env — the route in routes/admin.ts does the talking.
// Unit tested in github.test.ts.

import type { Issue, IssueContext, IssueInput, IssueLabel } from "../shared/types";
import { ISSUE_LIMITS } from "../shared/types";

/** GitHub's REST root. Pinned by the version header below, not by the URL. */
export const GITHUB_API = "https://api.github.com";

export interface GithubRepo {
  owner: string;
  name: string;
}

/**
 * Split the configured `owner/name` string. Deliberately strict: a typo here
 * would otherwise reach GitHub as a 404 whose message says nothing about which
 * half is wrong. Only the characters GitHub allows in either segment.
 */
export function parseRepo(raw: string | undefined | null): GithubRepo | null {
  if (typeof raw !== "string") return null;
  const parts = raw.trim().split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  const ok = /^[A-Za-z0-9._-]+$/;
  if (!ok.test(owner) || !ok.test(name)) return null;
  return { owner, name };
}

/**
 * The headers every call needs. `User-Agent` is not optional — GitHub answers
 * 403 without one — and workerd won't supply a default the way a browser does.
 */
export function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lunch-special-back-office",
  };
}

/**
 * Turn a failed call into something worth reading. The 404 case is the one that
 * matters: GitHub answers 404, not 403, when a token can see the account but
 * not this repository, so "not found" here almost always means the token's
 * repository access or its Issues permission, not a mistyped name.
 */
export function githubError(status: number, repo: string): string {
  if (status === 401) {
    return "GitHub rejected the token — it may have expired. Mint a new one and re-run wrangler secret put GITHUB_TOKEN.";
  }
  if (status === 403) {
    return "GitHub refused the request (403). Check the token hasn't hit a rate limit and still grants Issues: Read and write.";
  }
  if (status === 404) {
    return `GitHub can't see ${repo}. Check the repo name, and that the token lists it under "Only select repositories" with Issues: Read and write.`;
  }
  if (status === 410) return "Issues are switched off on that repository.";
  if (status === 422) return "GitHub rejected the issue — usually a label that doesn't exist on the repo.";
  return `GitHub answered ${status}.`;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseContext(raw: unknown): IssueContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  const dishId = typeof c.dishId === "number" && Number.isInteger(c.dishId) ? c.dishId : undefined;
  const context: IssueContext = {
    view: cleanText(c.view, 40),
    url: cleanText(c.url, 300),
    viewport: cleanText(c.viewport, 20),
    userAgent: cleanText(c.userAgent, 300),
  };
  if (dishId !== undefined) context.dishId = dishId;
  const build = cleanText(c.build, 60);
  if (build) context.build = build;
  return context;
}

/**
 * Validate and normalise the composer's submission. Text is capped rather than
 * rejected on length, the same bargain parseAnnouncementInput strikes: a paste
 * that runs long is trimmed instead of losing the draft.
 *
 * A body is optional. An issue whose title says it and whose context block
 * carries the rest is a real issue, and refusing it would only teach you to
 * type a full stop.
 */
export function parseIssueInput(raw: unknown): { input: IssueInput } | { error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;

  const title = cleanText(b.title, ISSUE_LIMITS.title);
  if (!title) return { error: "A title is required" };
  const body = cleanText(b.body, ISSUE_LIMITS.body);

  const labels: string[] = [];
  if (b.labels !== undefined) {
    if (!Array.isArray(b.labels)) return { error: "Labels must be a list" };
    for (const item of b.labels) {
      const name = cleanText(item, 60);
      // Deduped: the chips can't produce a repeat, but a replayed request can,
      // and GitHub would keep the duplicate without saying so.
      if (name && !labels.includes(name)) labels.push(name);
      if (labels.length >= ISSUE_LIMITS.labels) break;
    }
  }

  const context = parseContext(b.context);
  return { input: context ? { title, body, labels, context } : { title, body, labels } };
}

/**
 * A pipe would break out of the markdown table cell it lands in, and a newline
 * would break out of the row.
 *
 * Backslashes go first, and the order is the whole point: escaping only the
 * pipe turns an input of `\|` into `\\|`, which GitHub renders as an escaped
 * backslash followed by a live pipe, so the cell breaks anyway.
 */
const cell = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/**
 * The body as GitHub receives it: what you typed, then the context block when
 * one was attached. A table rather than a fenced block, so it stays readable in
 * the issue list's preview and in an email notification.
 *
 * `filedAt` is passed in rather than read off the clock, so the fold has no
 * hidden input and a test can assert on the whole string.
 */
export function buildIssueBody(input: IssueInput, filedAt: string): string {
  const typed = input.body.trim();
  if (!input.context) return typed;

  const rows: [string, string][] = [
    ["View", `\`${cell(input.context.view || "—")}\``],
    ["URL", `\`${cell(input.context.url || "—")}\``],
  ];
  if (input.context.dishId !== undefined) rows.push(["Dish", `#${input.context.dishId}`]);
  // Which bundle the reporter was actually looking at. Absent on an issue filed
  // from a build that predates the marker, so it's a row rather than a column.
  if (input.context.build) rows.push(["Build", `\`${cell(input.context.build)}\``]);
  rows.push(["Viewport", cell(input.context.viewport || "—")]);
  rows.push(["Browser", cell(input.context.userAgent || "—")]);
  rows.push(["Filed", cell(filedAt)]);

  const table = ["| | |", "| --- | --- |", ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join("\n");
  const head = typed ? `${typed}\n\n---\n\n` : "";
  return `${head}<sub>Filed from the Lunch Special back office.</sub>\n\n${table}\n`;
}

/** Read a label list, from either the labels endpoint or an issue's own array. */
export function toLabels(raw: unknown): IssueLabel[] {
  if (!Array.isArray(raw)) return [];
  const out: IssueLabel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    if (typeof l.name !== "string" || !l.name) continue;
    // A label that arrived without a colour keeps its name and takes GitHub's
    // own default grey, rather than being dropped: the name does the work.
    out.push({ name: l.name, color: typeof l.color === "string" && l.color ? l.color : "ededed" });
  }
  return out;
}

/**
 * Read one row of GitHub's issues JSON. Returns null for anything that isn't an
 * issue we can list — including **pull requests**, which `GET /issues` returns
 * alongside real issues (they carry a `pull_request` key, and nothing else
 * distinguishes them). Listing open PRs under a composer whose whole job is to
 * stop you filing a duplicate issue would be noise at best.
 */
export function toIssue(raw: unknown): Issue | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.pull_request !== undefined) return null;
  if (typeof r.number !== "number" || typeof r.title !== "string") return null;
  return {
    number: r.number,
    title: r.title,
    // The html_url, not the API address — this is what a click should open.
    url: typeof r.html_url === "string" ? r.html_url : "",
    labels: toLabels(r.labels),
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
  };
}

export function toIssues(raw: unknown): Issue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toIssue).filter((i): i is Issue => i !== null);
}
