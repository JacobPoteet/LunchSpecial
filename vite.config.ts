import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    // Allow the cloudflared quick-tunnel host through Vite's dev-server host
    // check so `npm run tunnel` works for Discord Activity testing (otherwise
    // Vite 403s the *.trycloudflare.com Host header). Dev-only; no prod effect.
    allowedHosts: [".trycloudflare.com"],
  },
});
