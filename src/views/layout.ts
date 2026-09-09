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
 *
 * The attribute it sets is what the `dark:` and `light:` Tailwind variants key
 * off — see the @custom-variant declarations in src/styles.css.
 */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t="dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`;

/**
 * Both icons are always in the DOM; the palette in effect decides which one is
 * visible, so switching themes is a transition rather than a re-render. `light:`
 * is our own variant — [data-theme="light"] — because the visitor's explicit
 * choice has to be able to beat the OS preference.
 */
const ICON_BASE =
  "absolute size-[1.05rem] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.5,1.6,0.4,1)] motion-reduce:transition-none";

const SUN_ICON = `<svg data-icon="sun" class="${ICON_BASE} -rotate-90 scale-40 opacity-0 light:rotate-0 light:scale-100 light:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;

const MOON_ICON = `<svg data-icon="moon" class="${ICON_BASE} rotate-0 scale-100 opacity-100 light:rotate-90 light:scale-40 light:opacity-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`;

/**
 * `data-theme-toggle` rather than a class is what public/theme.js looks for —
 * a behavioural hook that survives restyling, and one fewer reason for a
 * utility rename to break the button.
 */
export function themeToggle(): Html {
  return html`<button
    data-theme-toggle
    class="relative grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-dim transition-colors hover:border-line-strong hover:text-ink motion-reduce:transition-none"
    type="button"
    aria-label="Switch theme"
  >
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

    <!-- Fraunces for display, IBM Plex Mono for body — see src/styles.css. -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap"
      rel="stylesheet"
    />

    <meta property="og:type" content="website" />
    <meta property="og:title" content="${fullTitle}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:url" content="${canonical}" />
    <meta name="twitter:card" content="summary" />

    <!-- Lets a reader find the feed from the domain alone. -->
    <link rel="alternate" type="application/rss+xml" title="${site.title}" href="${site.url}/feed.xml" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <!-- Compiled by Tailwind from src/styles.css via "npm run css:build". -->
    <link rel="stylesheet" href="/styles.css" />
    <script>
      ${raw(THEME_BOOTSTRAP)}
    </script>
  </head>
  <body
    class="bg-canvas font-mono text-body text-ink antialiased transition-colors duration-200 motion-reduce:transition-none"
  >
    <a
      href="#main"
      class="absolute -left-[9999px] focus:top-4 focus:left-4 focus:z-10 focus:rounded-card focus:border focus:border-line-strong focus:bg-surface focus:px-3.5 focus:py-2"
      >Skip to content</a
    >
    <div class="mx-auto max-w-page px-6">
      <!-- Wraps rather than squashes: a site title long enough to crowd the nav
           on a phone gets its own line instead of breaking mid-word. -->
      <header class="flex flex-wrap items-center gap-x-5 gap-y-3 pt-7 pb-10">
        <a
          class="mr-auto font-serif text-[1.05rem] font-bold tracking-tight text-ink no-underline"
          href="/"
          ><span class="mr-1.5 text-ink" aria-hidden="true">▍</span>${site.title}</a
        >
        <nav class="flex gap-4">
          ${site.nav.map(
            (item) => html`<a
              href="${item.href}"
              class="text-sm text-ink-dim no-underline hover:text-ink aria-[current=page]:text-ink"
              ${meta.nav === item.label ? raw('aria-current="page"') : ""}
              >${item.label}</a
            >`,
          )}
        </nav>
        ${themeToggle()}
      </header>

      <main id="main">${body}</main>

      <footer class="mt-20 flex flex-wrap items-center gap-4 border-t border-line pt-8 pb-12">
        <!-- Nothing renders here if every social is left blank. -->
        <div data-socials class="mr-auto flex gap-1.5">
          ${site.socials.map(
            (social) => html`<a
              href="${social.href}"
              title="${social.label}"
              class="grid size-8 place-items-center rounded-card text-ink-dim no-underline transition hover:-translate-y-px hover:bg-surface hover:text-ink motion-reduce:transition-none"
              ${social.href.startsWith("/") ? "" : raw('rel="me noopener"')}
              ><span hidden>${social.label}</span
              ><svg class="size-[1.05rem] fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="${social.icon}" />
              </svg>
            </a>`,
          )}
        </div>
        <p class="text-[0.8rem] text-ink-faint">
          © ${new Date().getFullYear()} ${site.title} ·
          <a class="text-ink-dim" href="/feed.xml">RSS Feed</a> ·
          <a class="text-ink-dim" href="/docs">API</a>
        </p>
      </footer>
    </div>
    <script src="/theme.js" defer></script>
  </body>
</html>`;
}
