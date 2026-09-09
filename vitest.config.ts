import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Two suites, because they need two different runtimes.
 *
 * "worker" runs the real Worker in workerd. "build" runs the content compiler,
 * which is a Node script shelling out to the filesystem — it can't run inside
 * workerd, and the Worker can't run outside it, so they're separate projects
 * rather than one config bent to cover both.
 */

/**
 * The worker suite runs against a fixed cast of entries.
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
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            // Bindings and vars come from the real wrangler config, so tests
            // run against the same shape as `wrangler dev`.
            wrangler: { configPath: "./wrangler.jsonc" },
          }),
        ],
        resolve: {
          // src/content.ts is the only importer of this specifier — the
          // exact-match pattern keeps the swap from reaching anything else.
          alias: [{ find: /^\.\/generated\/entries$/, replacement: FIXTURE_ENTRIES }],
        },
        test: {
          name: "worker",
          // One level only, so the Node suite below is not swept up.
          include: ["test/*.spec.ts"],
        },
      },
      {
        test: {
          name: "build",
          include: ["test/build/*.spec.ts"],
          environment: "node",
        },
      },
    ],
  },
});
