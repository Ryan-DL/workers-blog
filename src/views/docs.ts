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
 * Swagger UI ships light-only, so the dark palette below is ours, driven by
 * the same tokens as the rest of the site.
 */

const SWAGGER_VERSION = "5.18.2";

const DARK_OVERRIDES = `
  body { background: var(--bg); }
  .topbar, .swagger-ui .info hgroup.main a { display: none; }
  .docs-head {
    max-width: 1460px; margin: 0 auto; padding: 1.75rem 1.5rem 0;
    display: flex; align-items: center; gap: 1rem;
  }
  .docs-head a.back { margin-right: auto; font-family: var(--font-mono); font-size: .9rem;
    color: var(--text-dim); text-decoration: none; }
  .docs-head a.back:hover { color: var(--text); }
  .docs-head .spec-link { font-family: var(--font-mono); font-size: .8rem; }
  .swagger-ui { color: var(--text); }
  .swagger-ui .wrapper { max-width: 1460px; }

  :root[data-theme="dark"] .swagger-ui,
  :root[data-theme="dark"] .swagger-ui .info .title,
  :root[data-theme="dark"] .swagger-ui .opblock-tag,
  :root[data-theme="dark"] .swagger-ui .opblock .opblock-summary-operation-id,
  :root[data-theme="dark"] .swagger-ui .opblock .opblock-summary-path,
  :root[data-theme="dark"] .swagger-ui .opblock .opblock-section-header h4,
  :root[data-theme="dark"] .swagger-ui .opblock-description-wrapper p,
  :root[data-theme="dark"] .swagger-ui table thead tr th,
  :root[data-theme="dark"] .swagger-ui .parameter__name,
  :root[data-theme="dark"] .swagger-ui .response-col_status,
  :root[data-theme="dark"] .swagger-ui .model-title,
  :root[data-theme="dark"] .swagger-ui .model,
  :root[data-theme="dark"] .swagger-ui label,
  :root[data-theme="dark"] .swagger-ui .tab li button.tablinks { color: var(--text); }

  :root[data-theme="dark"] .swagger-ui .info .base-url,
  :root[data-theme="dark"] .swagger-ui .info li,
  :root[data-theme="dark"] .swagger-ui .info p,
  :root[data-theme="dark"] .swagger-ui .parameter__type,
  :root[data-theme="dark"] .swagger-ui .parameter__in,
  :root[data-theme="dark"] .swagger-ui .response-col_description__inner p,
  :root[data-theme="dark"] .swagger-ui .markdown p { color: var(--text-dim); }

  :root[data-theme="dark"] .swagger-ui .opblock-tag { border-bottom-color: var(--border); }
  :root[data-theme="dark"] .swagger-ui .opblock { background: var(--bg-elev); border-color: var(--border); box-shadow: none; }
  :root[data-theme="dark"] .swagger-ui .opblock .opblock-section-header { background: var(--bg-sunken); box-shadow: none; }
  :root[data-theme="dark"] .swagger-ui section.models { border-color: var(--border); background: var(--bg-elev); }
  :root[data-theme="dark"] .swagger-ui section.models .model-container { background: var(--bg-sunken); }
  :root[data-theme="dark"] .swagger-ui .model-box { background: transparent; }
  :root[data-theme="dark"] .swagger-ui input[type=text],
  :root[data-theme="dark"] .swagger-ui textarea,
  :root[data-theme="dark"] .swagger-ui select {
    background: var(--bg-sunken); color: var(--text); border-color: var(--border-strong);
  }
  :root[data-theme="dark"] .swagger-ui .microlight { background: var(--bg-sunken) !important; }
  :root[data-theme="dark"] .swagger-ui .responses-inner { background: transparent; }
  :root[data-theme="dark"] .swagger-ui .prop-format { color: var(--text-faint); }
  :root[data-theme="dark"] .swagger-ui svg.arrow { fill: var(--text-dim); }
`;

export function docsPage(site: Site) {


  return html`<!doctype html>
<html lang="en">
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
      ${raw(DARK_OVERRIDES)}
    </style>
    <script>
      ${raw(
        `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`,
      )}
    </script>
  </head>
  <body>
    <div class="docs-head">
      <a class="back" href="/">&larr; ${site.title}</a>
      <a class="spec-link" href="/openapi.json">openapi.json</a>
      <button class="theme-toggle" type="button" aria-label="Switch theme">
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
      </button>
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
    <script src="/theme.js" defer></script>
  </body>
</html>`;
}
