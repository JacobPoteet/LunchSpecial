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
  /** The tag or branch it was built from. */
  ref: string;
  /** ISO-8601 to the minute, e.g. `2026-09-03T14:22Z`. */
  time: string;
  /** The working tree had uncommitted tracked changes when this was built. */
  dirty: boolean;
}

/** What a build with no git and no CI environment to read looks like. */
export const UNKNOWN_BUILD: BuildInfo = { commit: "", ref: "", time: "", dirty: false };

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
 * The one line that goes on screen: `v1.7.0 · c61d712`, or the branch when the
 * build wasn't cut from a tag. A trailing `*` means the working tree was dirty,
 * which is the difference between "this is the build I shipped" and "this is
 * whatever was on my disk at the time" — the distinction the marker exists for.
 *
 * `dev` when there's nothing to say, never an empty string: a blank badge in a
 * screenshot looks like a rendering bug rather than an unknown build.
 */
export function buildLabel(b: BuildInfo): string {
  const commit = shortCommit(b.commit);
  const ref = shortRef(b.ref);
  const stem = [ref, commit].filter(Boolean).join(" · ");
  if (!stem) return "dev";
  return b.dirty ? `${stem}*` : stem;
}

/**
 * The longer form, for somewhere with room for it: the full sha and the build
 * time. Used as the admin line's `title`, where a hover is available and the
 * exact commit is what you'd paste into `git show`.
 */
export function buildTitle(b: BuildInfo): string {
  const parts: string[] = [];
  if (shortCommit(b.commit)) parts.push(`Commit ${b.commit.trim().toLowerCase()}`);
  if (b.ref.trim()) parts.push(`from ${shortRef(b.ref)}`);
  if (b.time.trim()) parts.push(`built ${b.time.trim()}`);
  if (b.dirty) parts.push("(uncommitted changes)");
  return parts.length ? parts.join(" ") : "No build information — this bundle was built without git.";
}
