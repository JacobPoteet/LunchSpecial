// Separate from vite.config.ts so tests don't load the Cloudflare plugin —
// the game engine is pure TypeScript and runs fine in Node.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["worker/**/*.test.ts"],
  },
});
