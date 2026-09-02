import { describe, expect, it } from "vitest";
import {
  buildIssueBody,
  githubError,
  githubHeaders,
  parseIssueInput,
  parseRepo,
  toIssue,
  toIssues,
  toLabels,
} from "./github";
import { ISSUE_LIMITS } from "../shared/types";

const ok = (r: ReturnType<typeof parseIssueInput>) => {
  if ("error" in r) throw new Error(`expected input, got error: ${r.error}`);
  return r.input;
};

describe("parseRepo", () => {
  it("splits owner from name", () => {
    expect(parseRepo("JacobPoteet/LunchSpecial")).toEqual({ owner: "JacobPoteet", name: "LunchSpecial" });
    expect(parseRepo("  JacobPoteet/LunchSpecial  ")).toEqual({ owner: "JacobPoteet", name: "LunchSpecial" });
  });

  it("refuses anything that isn't exactly two segments", () => {
    expect(parseRepo("LunchSpecial")).toBeNull();
    expect(parseRepo("github.com/JacobPoteet/LunchSpecial")).toBeNull();
    expect(parseRepo("JacobPoteet/")).toBeNull();
    expect(parseRepo("/LunchSpecial")).toBeNull();
  });

  it("refuses characters that would change the URL's shape", () => {
    // A path segment smuggled through here would aim the request somewhere else.
    expect(parseRepo("Jacob Poteet/LunchSpecial")).toBeNull();
    expect(parseRepo("JacobPoteet/Lunch?Special")).toBeNull();
    expect(parseRepo("JacobPoteet/Lunch#Special")).toBeNull();
  });

  it("is null for a missing setting", () => {
    expect(parseRepo(undefined)).toBeNull();
    expect(parseRepo(null)).toBeNull();
    expect(parseRepo("")).toBeNull();
  });
});

describe("githubHeaders", () => {
  it("always sends a User-Agent, which GitHub 403s without", () => {
    const h = githubHeaders("ghp_example");
    expect(h["User-Agent"]).toBeTruthy();
    expect(h.Authorization).toBe("Bearer ghp_example");
    expect(h["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });
});

describe("githubError", () => {
  it("reads a 404 as a permission problem, which is what it usually is", () => {
    const msg = githubError(404, "JacobPoteet/LunchSpecial");
    expect(msg).toContain("JacobPoteet/LunchSpecial");
    expect(msg).toContain("Issues: Read and write");
  });

  it("names the secret to re-set when the token is rejected", () => {
    expect(githubError(401, "o/r")).toContain("GITHUB_TOKEN");
  });

  it("falls back to the bare status rather than guessing", () => {
    expect(githubError(500, "o/r")).toBe("GitHub answered 500.");
  });
});

describe("parseIssueInput", () => {
  it("requires a title", () => {
    expect(parseIssueInput({ body: "something is wrong" })).toEqual({ error: "A title is required" });
    expect(parseIssueInput({ title: "   " })).toEqual({ error: "A title is required" });
  });

  it("accepts a title on its own — the context block carries the rest", () => {
    expect(ok(parseIssueInput({ title: "Shuffle rolls the same dish twice" }))).toEqual({
      title: "Shuffle rolls the same dish twice",
      body: "",
      labels: [],
    });
  });

  it("trims rather than rejecting over-long text, so a long paste survives", () => {
    const input = ok(parseIssueInput({ title: "t".repeat(400), body: "b".repeat(9000) }));
    expect(input.title).toHaveLength(ISSUE_LIMITS.title);
    expect(input.body).toHaveLength(ISSUE_LIMITS.body);
  });

  it("dedupes labels and caps how many ride along", () => {
    const input = ok(parseIssueInput({ title: "t", labels: ["bug", "bug", " bug ", "admin"] }));
    expect(input.labels).toEqual(["bug", "admin"]);

    const many = ok(parseIssueInput({ title: "t", labels: Array.from({ length: 40 }, (_, i) => `l${i}`) }));
    expect(many.labels).toHaveLength(ISSUE_LIMITS.labels);
  });

  it("drops blanks and non-strings out of the label list", () => {
    expect(ok(parseIssueInput({ title: "t", labels: ["bug", "", null, 7, "  "] })).labels).toEqual(["bug"]);
  });

  it("refuses labels that aren't a list at all", () => {
    expect(parseIssueInput({ title: "t", labels: "bug" })).toEqual({ error: "Labels must be a list" });
  });

  it("keeps the context block when one is sent, and omits it when not", () => {
    const withCtx = ok(
      parseIssueInput({
        title: "t",
        context: { view: "dashboard", url: "/admin?tab=today", viewport: "1280x800", userAgent: "UA", dishId: 51 },
      }),
    );
    expect(withCtx.context).toEqual({
      view: "dashboard",
      url: "/admin?tab=today",
      viewport: "1280x800",
      userAgent: "UA",
      dishId: 51,
    });
    expect(ok(parseIssueInput({ title: "t" })).context).toBeUndefined();
  });

  it("drops a dish id that isn't a whole number", () => {
    const ctx = ok(parseIssueInput({ title: "t", context: { view: "dishes", dishId: 1.5 } })).context;
    expect(ctx?.dishId).toBeUndefined();
  });
});

describe("buildIssueBody", () => {
  const context = {
    view: "dashboard",
    url: "/admin?tab=today",
    viewport: "1280x800",
    userAgent: "Mozilla/5.0",
  };

  it("posts exactly what you typed when no context is attached", () => {
    expect(buildIssueBody({ title: "t", body: "  just this  ", labels: [] }, "2026-09-02T14:03:00Z")).toBe("just this");
  });

  it("appends the context table under a rule", () => {
    const out = buildIssueBody({ title: "t", body: "The shuffle repeats.", labels: [], context }, "2026-09-02T14:03:00Z");
    expect(out.startsWith("The shuffle repeats.\n\n---\n\n")).toBe(true);
    expect(out).toContain("| View | `dashboard` |");
    expect(out).toContain("| URL | `/admin?tab=today` |");
    expect(out).toContain("| Viewport | 1280x800 |");
    expect(out).toContain("| Filed | 2026-09-02T14:03:00Z |");
  });

  it("skips the rule when there's no typed body to separate from", () => {
    const out = buildIssueBody({ title: "t", body: "", labels: [], context }, "2026-09-02T14:03:00Z");
    expect(out.startsWith("<sub>")).toBe(true);
    // The table's own separator row still contains dashes; what must be absent
    // is the horizontal rule that would sit above an empty stretch of body.
    expect(out).not.toContain("\n\n---\n\n");
  });

  it("prints a dish row only when a dish was open", () => {
    expect(buildIssueBody({ title: "t", body: "", labels: [], context }, "now")).not.toContain("| Dish |");
    expect(
      buildIssueBody({ title: "t", body: "", labels: [], context: { ...context, dishId: 51 } }, "now"),
    ).toContain("| Dish | #51 |");
  });

  it("escapes a pipe so it can't break out of its cell", () => {
    const out = buildIssueBody(
      { title: "t", body: "", labels: [], context: { ...context, userAgent: "Weird|Browser" } },
      "now",
    );
    expect(out).toContain("| Browser | Weird\\|Browser |");
  });

  it("escapes the backslash before the pipe, so an input of \\| still can't", () => {
    // Escaping only the pipe would emit `\\|`: an escaped backslash, then a
    // live pipe. The cell breaks on exactly the input that looks handled.
    const out = buildIssueBody(
      { title: "t", body: "", labels: [], context: { ...context, userAgent: "Weird\\|Browser" } },
      "now",
    );
    expect(out).toContain("| Browser | Weird\\\\\\|Browser |");
  });

  it("flattens a newline, which would break the row rather than the cell", () => {
    const out = buildIssueBody(
      { title: "t", body: "", labels: [], context: { ...context, url: "/admin\r\n| evil | row |" } },
      "now",
    );
    expect(out).toContain("| URL | `/admin \\| evil \\| row \\|` |");
    // Header, separator, and one row each for View / URL / Viewport / Browser
    // / Filed. The injected row folded into the URL cell instead of adding one.
    expect(out.split("\n").filter((l) => l.startsWith("| "))).toHaveLength(7);
  });
});

describe("toIssues", () => {
  const issue = {
    number: 57,
    title: "Shuffle repeats",
    html_url: "https://github.com/JacobPoteet/LunchSpecial/issues/57",
    created_at: "2026-09-01T10:00:00Z",
    labels: [{ name: "bug", color: "d73a4a" }],
  };

  it("reads an issue row", () => {
    expect(toIssue(issue)).toEqual({
      number: 57,
      title: "Shuffle repeats",
      url: "https://github.com/JacobPoteet/LunchSpecial/issues/57",
      createdAt: "2026-09-01T10:00:00Z",
      labels: [{ name: "bug", color: "d73a4a" }],
    });
  });

  it("drops pull requests, which GET /issues returns alongside issues", () => {
    const pr = { ...issue, number: 58, pull_request: { url: "…" } };
    expect(toIssue(pr)).toBeNull();
    expect(toIssues([issue, pr]).map((i) => i.number)).toEqual([57]);
  });

  it("drops rows missing the fields the list is built from", () => {
    expect(toIssue({ title: "no number" })).toBeNull();
    expect(toIssue({ number: 1 })).toBeNull();
    expect(toIssue(null)).toBeNull();
    expect(toIssues("not a list")).toEqual([]);
  });
});

describe("toLabels", () => {
  it("keeps a label that arrived without a colour", () => {
    expect(toLabels([{ name: "chore" }])).toEqual([{ name: "chore", color: "ededed" }]);
  });

  it("drops entries with no name to show", () => {
    expect(toLabels([{ name: "" }, { color: "fff" }, null, "bug"])).toEqual([]);
  });

  it("is empty for anything that isn't a list", () => {
    expect(toLabels(undefined)).toEqual([]);
  });
});
