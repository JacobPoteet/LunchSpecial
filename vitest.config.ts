// Separate from vite.config.ts so tests don't load the Cloudflare plugin —
// the game engine is pure TypeScript and runs fine in Node.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // shared/ is pure too (types, time, markdown, sample) and both projects
    // import it, so its tests live beside it rather than under worker/.
    include: ["worker/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
