import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
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
