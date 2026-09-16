// Issues filed to GitHub from the back office.

// ---- Issues (filed to GitHub from the back office) ----
//
// The back office's own bug tracker. Nothing here is stored in D1 — GitHub is
// the record, unlike `dish_requests`, which is an inbox with no other home.

/** Field caps, shared by the composer and the route that posts to GitHub. */
export const ISSUE_LIMITS = { title: 200, body: 8000, labels: 10 } as const;

/**
 * Where in the back office you were standing when you hit "File an issue".
 * Appended to the body server-side, because the thing an issue filed from a
 * dashboard usually omits is which dashboard.
 */
export interface IssueContext {
  /** The admin view that was open — "dashboard", "dishes", "schedule"… */
  view: string;
  /** Path + query. The dashboard mirrors its tab in `?tab=`, so this carries it. */
  url: string;
  /** The dish being edited, when one was. */
  dishId?: number;
  /** Browser viewport as `1280x800`. */
  viewport: string;
  /** The bundle that was running, as `buildLabel` writes it. Absent pre-2026-09. */
  build?: string;
  /** `navigator.userAgent`, untouched. */
  userAgent: string;
}

/** What the composer submits. `labels` are names, spelled the way GitHub spells them. */
export interface IssueInput {
  title: string;
  body: string;
  labels: string[];
  /** Omitted when the composer's context checkbox is off. */
  context?: IssueContext;
}

/** One of the repo's labels, offered as a chip in the composer. */
export interface IssueLabel {
  name: string;
  /** Six hex digits, no leading `#`, exactly as GitHub returns it. */
  color: string;
}

/** One open issue, as listed under the composer so you can spot a duplicate. */
export interface Issue {
  number: number;
  title: string;
  /** The `html_url` — where a click should go, not the API address. */
  url: string;
  labels: IssueLabel[];
  createdAt: string;
}

/**
 * Everything the composer needs on open: whether this deployment can file at
 * all, where issues go, the labels to offer, and what's already open.
 *
 * `configured` is false when `GITHUB_TOKEN` isn't set. The read answers 200 with
 * it false rather than the 503 the Discord routes use for the same state,
 * because the composer's job then is to say which secret is missing — a 503
 * would only put that sentence behind an error banner. The *write* still 503s,
 * matching the convention: you genuinely cannot file.
 */
export interface IssueBoard {
  configured: boolean;
  /** `owner/name`, so the composer can say out loud where an issue is going. */
  repo: string;
  labels: IssueLabel[];
  open: Issue[];
}
