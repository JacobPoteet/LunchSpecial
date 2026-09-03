import { describe, expect, it } from "vitest";
import { buildLabel, buildTitle, shortCommit, UNKNOWN_BUILD, REF_MAX, type BuildInfo } from "./build";

const info = (over: Partial<BuildInfo> = {}): BuildInfo => ({ ...UNKNOWN_BUILD, ...over });

describe("shortCommit", () => {
  it("trims a sha to the length git prints", () => {
    expect(shortCommit("c61d712a9f3b4c8d1e0f2a3b4c5d6e7f80912345")).toBe("c61d712");
  });

  it("takes an already-short sha and normalises its case", () => {
    expect(shortCommit(" C61D712 ")).toBe("c61d712");
  });

  it("refuses anything that isn't a sha, rather than printing it as one", () => {
    // The value can arrive from an environment variable, so this is what stops
    // an error string or a placeholder being shown on the page as a build.
    expect(shortCommit("")).toBe("");
    expect(shortCommit("unknown")).toBe("");
    expect(shortCommit("c61d71")).toBe("");
    expect(shortCommit("$(GITHUB_SHA)")).toBe("");
  });
});

describe("buildLabel", () => {
  it("names the tag a release was cut from", () => {
    expect(buildLabel(info({ ref: "v1.7.0", commit: "c61d712a9f3b" }))).toBe("v1.7.0 · c61d712");
  });

  it("names the branch when the build wasn't cut from a tag", () => {
    expect(buildLabel(info({ ref: "add-soups-and-fan-batch", commit: "c61d712a9f3b" }))).toBe(
      "add-soups-and-fan-batch · c61d712",
    );
  });

  it("marks a dirty tree, which is the whole point of showing this in a video", () => {
    expect(buildLabel(info({ ref: "main", commit: "c61d712a9f3b", dirty: true }))).toBe("main · c61d712*");
  });

  it("falls back through the halves it does have", () => {
    expect(buildLabel(info({ commit: "c61d712a9f3b" }))).toBe("c61d712");
    expect(buildLabel(info({ ref: "main" }))).toBe("main");
  });

  it("says dev rather than nothing when there's no build information at all", () => {
    // A blank badge reads as a rendering bug; an unknown build should say so.
    expect(buildLabel(UNKNOWN_BUILD)).toBe("dev");
    expect(buildLabel(info({ commit: "not-a-sha" }))).toBe("dev");
  });

  it("truncates a long branch so the badge can't grow across the board", () => {
    const label = buildLabel(info({ ref: "j".repeat(60), commit: "c61d712a9f3b" }));
    expect(label).toBe(`${"j".repeat(REF_MAX - 1)}… · c61d712`);
  });
});

describe("buildTitle", () => {
  it("spells out the full sha, the ref and the time", () => {
    expect(buildTitle(info({ ref: "v1.7.0", commit: "C61D712A9F3B4C8D1E0F2A3B4C5D6E7F80912345", time: "2026-09-03T14:22Z" }))).toBe(
      "Commit c61d712a9f3b4c8d1e0f2a3b4c5d6e7f80912345 from v1.7.0 built 2026-09-03T14:22Z",
    );
  });

  it("notes an uncommitted tree", () => {
    expect(buildTitle(info({ commit: "c61d712a9f3b", dirty: true }))).toContain("(uncommitted changes)");
  });

  it("explains an empty build instead of returning an empty tooltip", () => {
    expect(buildTitle(UNKNOWN_BUILD)).toBe("No build information — this bundle was built without git.");
  });
});
