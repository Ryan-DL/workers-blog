import type { Site } from "../config";
import { html, raw } from "hono/html";

/**
 * Swagger UI over /openapi.json.
 *
 * Swagger UI is loaded from a CDN rather than bundled: the dist is well over a
 * megabyte, and paying that in the Worker bundle to render a docs page nobody
 * hits on the hot path is a bad trade. The consequence is that /docs needs
 * network access to unpkg — the spec itself at /openapi.json does not, so any
 * client tooling still works offline.
 *
 * **This page is pinned to the light palette**, and is the one place on the
 * site that ignores the visitor's theme. Swagger UI ships light-only and
 * renders its own DOM at runtime, so a dark version means hand-maintaining a
 * shadow palette against someone else's markup — one that silently rots every
 * time they change a class name. `data-theme="light"` is set statically on
 * <html> rather than resolved by a script, so there is no bootstrap to run and
 * nothing to flash.
 *
 * Everything this page *does* own — the header strip — is utilities like the
 * rest of the site, and reads the same light tokens from src/styles.css.
 */

const SWAGGER_VERSION = "5.18.2";

/**
 * The little that Swagger UI's own stylesheet doesn't cover: its promo topbar,
 * and a wrapper wider than the 46rem the rest of the site reads at, because an
 * endpoint table needs the room.
 */
const SWAGGER_THEME = `
  body { background: var(--color-canvas); }
  .topbar, .swagger-ui .info hgroup.main a { display: none; }
  .swagger-ui { color: var(--color-ink); }
  .swagger-ui .wrapper { max-width: 1460px; }
`;

export function docsPage(site: Site) {
  return html`<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API — ${site.title}</title>
    <meta name="description" content="OpenAPI reference for the ${site.title} API." />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css"
    />
    <style>
      ${raw(SWAGGER_THEME)}
    </style>
  </head>
  <body class="bg-canvas font-sans text-ink antialiased">
    <div class="mx-auto flex max-w-[1460px] items-center gap-4 px-6 pt-7">
      <a class="mr-auto font-mono text-sm text-ink-dim no-underline hover:text-ink" href="/"
        >&larr; ${site.title}</a
      >
      <a class="font-mono text-[0.8rem]" href="/openapi.json">openapi.json</a>
    </div>
    <div id="swagger"></div>
    <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.addEventListener("load", function () {
        SwaggerUIBundle({
          url: "/openapi.json",
          dom_id: "#swagger",
          deepLinking: true,
          defaultModelsExpandDepth: 1,
          docExpansion: "list",
          tryItOutEnabled: true,
        });
      });
    </script>
    <!-- No /theme.js here on purpose. It follows the OS while no choice is
         stored, which would drag this page into dark behind our backs. -->
  </body>
</html>`;
}
