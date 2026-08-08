import { html, raw } from "hono/html";
import type { Site } from "../config";
import type { Html } from "./html";

export interface PageMeta {
  title: string;
  description: string;
  /** Canonical path, e.g. "/posts/hello-world". */
  path: string;
  /** Preview entries ask crawlers to stay away. */
  noindex?: boolean;
  /** Highlights the matching nav item. */
  nav?: string;
}

/**
 * Resolve the theme before first paint.
 *
 * This is inlined, minified, and render-blocking on purpose: anything deferred
 * would paint the default theme first and then flip, which is exactly the
 * flash we're avoiding. Order of precedence is the visitor's stored choice,
 * then the browser's preference, then dark.
 */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`;

const SUN_ICON = `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;

const MOON_ICON = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`;

export function themeToggle(): Html {
  return html`<button class="theme-toggle" type="button" aria-label="Switch theme">
    ${raw(SUN_ICON)}${raw(MOON_ICON)}
  </button>`;
}

export function layout(meta: PageMeta, body: Html, site: Site): Html {
  const canonical = `${site.url}${meta.path}`;
  const fullTitle = meta.path === "/" ? site.title : `${meta.title} — ${site.title}`;

  return html`<!doctype html>
<html lang="${site.language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${fullTitle}</title>
    <meta name="description" content="${meta.description}" />
    <link rel="canonical" href="${canonical}" />
    ${meta.noindex ? raw('<meta name="robots" content="noindex, nofollow" />') : ""}

    <meta property="og:type" content="website" />
    <meta property="og:title" content="${fullTitle}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:url" content="${canonical}" />
    <meta name="twitter:card" content="summary" />

    <!-- Lets a reader find the feed from the domain alone. -->
    <link rel="alternate" type="application/rss+xml" title="${site.title}" href="${site.url}/feed.xml" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <script>
      ${raw(THEME_BOOTSTRAP)}
    </script>
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="shell">
      <header class="site-header">
        <a class="wordmark" href="/">${site.title}</a>
        <nav class="site-nav">
          ${site.nav.map(
            (item) => html`<a
              href="${item.href}"
              ${meta.nav === item.label ? raw('aria-current="page"') : ""}
              >${item.label}</a
            >`,
          )}
        </nav>
        ${themeToggle()}
      </header>

      <main id="main">${body}</main>

      <footer class="site-footer">
        <!-- Nothing renders here if every social is left blank. -->
        <div class="socials">
          ${site.socials.map(
            (social) => html`<a
              href="${social.href}"
              title="${social.label}"
              ${social.href.startsWith("/") ? "" : raw('rel="me noopener"')}
              ><span hidden>${social.label}</span
              ><svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="${social.icon}" />
              </svg>
            </a>`,
          )}
        </div>
        <p class="colophon">
          © ${new Date().getFullYear()} ${site.title} ·
          <a href="/feed.xml">RSS</a> ·
          <a href="/docs">API</a>
        </p>
      </footer>
    </div>
    <script src="/theme.js" defer></script>
  </body>
</html>`;
}
