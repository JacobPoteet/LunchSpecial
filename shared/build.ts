// Which build is this? — the strings that answer that on screen.
//
// PURE. The values themselves are baked in at build time by vite.config.ts and
// reach the app as the `__BUILD__` global; everything here takes a BuildInfo as
// an argument and hands back text. That split is not decoration: vitest.config.ts
// is a separate config from vite.config.ts on purpose, so `define` never runs
// under test and a fold that reached for the global would have nothing to read.
// Nothing in this file may look at `__BUILD__`.
//
// Every field is allowed to be empty. A clone with no git history, a tarball, a
// sandbox with no `git` on PATH — all of those build fine and all of them land
// here, so "unknown" is a supported state and reads as `dev`.

/** What a build knows about itself. Any field may be "" — see the note above. */
export interface BuildInfo {
  /** Full commit sha. */
  commit: string;
  /**
   * The release this build belongs to: the nearest `v*` tag at or behind the
   * commit (`v1.10.0`), whatever branch it was built from. "" when the checkout
   * has no tags to read.
   */
  version: string;
  /** The tag or branch it was built from. */
  ref: string;
  /** ISO-8601 to the minute, e.g. `2026-09-03T14:22Z`. */
  time: string;
  /** The working tree had uncommitted tracked changes when this was built. */
  dirty: boolean;
}

/** What a build with no git and no CI environment to read looks like. */
export const UNKNOWN_BUILD: BuildInfo = { commit: "", version: "", ref: "", time: "", dirty: false };

/** Characters of sha to show. Seven is what `git log --oneline` prints. */
export const SHORT_SHA = 7;

/**
 * How much of a ref fits. A release tag is short; a branch name is whatever
 * somebody typed, and the marker sits in a corner of a screenshot, so a long
 * one is truncated rather than allowed to grow the badge across the board.
 */
export const REF_MAX = 24;

/**
 * The short sha, or "" if `commit` isn't one.
 *
 * Validated rather than trusted: the value arrives from an environment variable
 * in CI, and a sha that came back as an error message would otherwise be
 * printed on the page as though it were a build.
 */
export function shortCommit(commit: string): string {
  const clean = commit.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(clean)) return "";
  return clean.slice(0, SHORT_SHA);
}

function shortRef(ref: string): string {
  const clean = ref.trim().replace(/\s+/g, " ");
  if (!clean) return "";
  return clean.length > REF_MAX ? `${clean.slice(0, REF_MAX - 1)}…` : clean;
}

/**
 * The release name, or "" when the build has none. Validated rather than
 * trusted, for the same reason a sha is: it can arrive from an environment
 * variable, and a branch name or an error string must never be printed as a
 * version. `v1.10.0` and `v2.0.0-rc.1` pass; `main` doesn't.
 */
export function buildVersionName(version: string): string {
  const clean = version.trim();
  return /^v\d+(\.\d+)*(-[0-9A-Za-z.]+)?$/.test(clean) ? clean : "";
}

/**
 * The admin's line: `v1.7.0 · c61d712`, with the branch standing in for the
 * version only when the checkout has no tag to name. A trailing `*` means the
 * working tree was dirty, which is the difference between "this is the build I
 * shipped" and "this is whatever was on my disk at the time" — the distinction
 * the marker exists for.
 *
 * `dev` when there's nothing to say, never an empty string: a blank badge in a
 * screenshot looks like a rendering bug rather than an unknown build.
 */
export function buildLabel(b: BuildInfo): string {
  const commit = shortCommit(b.commit);
  const name = buildVersionName(b.version) || shortRef(b.ref);
  const stem = [name, commit].filter(Boolean).join(" · ");
  if (!stem) return "dev";
  return b.dirty ? `${stem}*` : stem;
}

/**
 * The version alone: `v1.7.0`, with the dirty `*` kept. This is what the
 * player-facing footer prints, beside the byline. The sha is left off on
 * purpose: on a phone the full label ran to a third of the footer's width and
 * the fixed badge it used to sit in covered the bottom of the check. A
 * screenshot still says which release it was; the exact commit is what the
 * release tag resolves to, and the admin's line carries the sha for the cases
 * where "which deploy" is the question.
 *
 * Never the branch. This printed `main` on production, because a deploy fired
 * from the Actions tab is built from a branch and not a tag, and every local
 * build is too. A build with no tag behind it says `dev`; the tooltip still
 * names the branch and the commit.
 */
export function buildVersion(b: BuildInfo): string {
  const version = buildVersionName(b.version);
  if (!version) return "dev";
  return b.dirty ? `${version}*` : version;
}

/**
 * The longer form, for somewhere with room for it: the full sha and the build
 * time. Used as the admin line's `title`, where a hover is available and the
 * exact commit is what you'd paste into `git show`.
 */
export function buildTitle(b: BuildInfo): string {
  const parts: string[] = [];
  if (buildVersionName(b.version)) parts.push(buildVersionName(b.version));
  if (shortCommit(b.commit)) parts.push(`Commit ${b.commit.trim().toLowerCase()}`);
  if (b.ref.trim()) parts.push(`from ${shortRef(b.ref)}`);
  if (b.time.trim()) parts.push(`built ${b.time.trim()}`);
  if (b.dirty) parts.push("(uncommitted changes)");
  return parts.length ? parts.join(" ") : "No build information — this bundle was built without git.";
}
