import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import type { BuildInfo } from "./shared/build";

/**
 * One git command, or "" if it can't be answered. Nothing here may throw: a
 * build with no git binary, no history, or a checkout that isn't a repository
 * at all still has to produce a bundle.
 */
function git(...args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/**
 * What this bundle knows about itself, baked in as `__BUILD__` below and put on
 * screen by src/game/BuildTag.tsx and the admin nav.
 *
 * CI's environment is read *first*, and that ordering is the load-bearing part:
 * actions/checkout is shallow and carries no tags, so `git describe` there
 * would either fail or name the wrong thing, while GITHUB_REF_NAME is exactly
 * the tag that triggered the deploy. A local build has no such variables and
 * falls through to git. Neither is available in some sandboxes, and that's a
 * supported state too — see shared/build.ts.
 *
 * Read once, when vite loads this config. Under `npm run dev` that means the
 * value is fixed at server start and a commit made mid-session won't show up
 * until the server restarts.
 */
function buildInfo(): BuildInfo {
  const ci = process.env.GITHUB_SHA ?? "";
  return {
    commit: ci || git("rev-parse", "HEAD"),
    ref: process.env.GITHUB_REF_NAME || git("rev-parse", "--abbrev-ref", "HEAD"),
    time: `${new Date().toISOString().slice(0, 16)}Z`,
    // A CI checkout is clean by construction, and asking git would cost a
    // subprocess to be told so. Untracked files don't count: a stray backup or
    // an unlicensed audio file in the working tree isn't a different build.
    dirty: ci ? false : git("status", "--porcelain", "--untracked-files=no") !== "",
  };
}

export default defineConfig({
  plugins: [react(), cloudflare()],
  define: {
    // Replaced textually at build time, so it must be JSON. Declared for the
    // app's typechecker in src/vite-env.d.ts; deliberately not referenced from
    // worker code, which is built by the same pipeline but has no use for it.
    __BUILD__: JSON.stringify(buildInfo()),
  },
  // Vite handles the common audio extensions already, but not .m4a/.opus, and
  // the music bed is one of those. Without this the glob in src/audio/engine.ts
  // wouldn't resolve it to a URL.
  assetsInclude: ["**/*.m4a", "**/*.opus"],
  build: {
    // Audio must stay a file, never a base64 data URI. The default inlines any
    // asset under 4KB, which several of the short one-shots will be — and an
    // inlined sound is bytes in the JS bundle that every visitor parses whether
    // or not they ever unmute, on a page whose whole audio strategy is to cost
    // nothing until a gesture. Everything else keeps the default behaviour.
    assetsInlineLimit: (filePath: string) =>
      /\.(wav|m4a|opus|mp3|ogg|flac)$/i.test(filePath) ? false : undefined,
  },
  server: {
    // Allow the cloudflared quick-tunnel host through Vite's dev-server host
    // check so `npm run tunnel` works for Discord Activity testing (otherwise
    // Vite 403s the *.trycloudflare.com Host header). Dev-only; no prod effect.
    allowedHosts: [".trycloudflare.com"],
  },
});
