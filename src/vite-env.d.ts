/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Discord application Client ID, injected at build time. Public (it ships in
   * the client bundle) — set it as a plain env var, never a secret. Used only
   * on the Discord Activity code path; see src/discord/bootstrap.ts.
   */
  readonly VITE_DISCORD_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * The commit this bundle was built from, injected by `define` in vite.config.ts
 * and put on screen by src/game/BuildTag.tsx (`?build`) and the admin nav.
 *
 * A global rather than an `import.meta.env` entry because it isn't
 * configuration: nobody sets it, the build reads it off git. Never referenced
 * from worker/ or from anything under test — `define` doesn't run under
 * vitest's separate config, so the folds in shared/build.ts take a BuildInfo as
 * an argument instead of reaching for this.
 */
declare const __BUILD__: import("../shared/build").BuildInfo;
