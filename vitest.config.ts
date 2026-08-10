import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Tests run the real Worker against a fixed cast of entries.
 *
 * src/content.ts imports the compiled entry module at module scope, so which
 * entries exist is decided at build time. Aliasing that one import to
 * test/generated/ — compiled from test/fixtures/ by `npm run fixtures:build` —
 * lets the suite keep the entries it asserts on (a draft, a preview, two
 * external links) while content/ holds whatever has actually been written.
 *
 * Without this the tests would be coupled to the blog's real content, and
 * publishing a post would break assertions like `expect(body.total).toBe(4)`.
 */
const FIXTURE_ENTRIES = fileURLToPath(new URL("./test/generated/entries.ts", import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest({
      // Bindings and vars come from the real wrangler config, so tests run
      // against the same shape as `wrangler dev`.
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        d1Databases: ["DB"],
      },
    }),
  ],
  resolve: {
    // src/content.ts is the only importer of this specifier — the exact-match
    // pattern keeps the swap from reaching anything else.
    alias: [{ find: /^\.\/generated\/entries$/, replacement: FIXTURE_ENTRIES }],
  },
});
