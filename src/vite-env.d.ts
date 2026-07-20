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
