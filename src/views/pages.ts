import { html, raw } from "hono/html";
import type { Site } from "../config";
import type { Entry, EntrySummary } from "../types";
import type { Html } from "./html";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/**
 * Rendered Markdown.
 *
 * A post body is HTML produced by `marked` at build time, so there is nowhere
 * to put a class — @tailwindcss/typography styles it by descendant selector
 * instead. Colours come from the `--tw-prose-*` variables set in
 * src/styles.css, so prose follows the palette on its own; what's left is the
 * per-element shaping, which rides along as `prose-*:` modifiers here.
 */
const PROSE = [
  "prose max-w-measure",
  // Inline code as a boxed token, minus typography's decorative backticks.
  "prose-code:rounded-[5px] prose-code:border prose-code:border-line prose-code:bg-surface",
  "prose-code:px-1.5 prose-code:py-0.5 prose-code:font-normal",
  "prose-code:before:content-none prose-code:after:content-none",
  // (The matching `pre code` reset is in src/styles.css — see the note there.)
  "prose-pre:rounded-card prose-pre:border prose-pre:border-line",
].join(" ");

/** Shared by the two flavours of badge, which differ only in colour. */
const BADGE_SHAPE = "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.7rem]";
const BADGE = `${BADGE_SHAPE} border-line-strong text-ink-dim`;
const BADGE_LINK = `${BADGE_SHAPE} border-accent-soft bg-accent-soft text-accent`;

const META_ROW = "mb-1.5 flex flex-wrap items-center gap-2.5 font-mono text-xs text-ink-faint";
const TAG_ROW = "mt-10 flex flex-wrap gap-1.5";
const TAG =
  "rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-xs text-ink-dim no-underline hover:border-line-strong hover:text-ink";

/** Where an entry points: a link leaves the site, a post doesn't. */
function hrefFor(entry: EntrySummary): string {
  return entry.kind === "link" ? entry.url : `/posts/${entry.slug}`;
}

/**
 * One row in the timeline.
 *
 * A post links to its own page; a link goes straight off-site, with an arrow
 * and its source named, so nobody clicks expecting to stay. The arrow leans
 * away on hover via `group-hover:`, which is why the anchor carries `group`.
 */
function entryRow(entry: EntrySummary): Html {
  const isLink = entry.kind === "link";

  return html`<li class="border-b border-line py-6 last:border-b-0">
    <div class="${META_ROW}">
      <time datetime="${entry.date}">${formatDate(entry.date)}</time>
      ${entry.kind === "link"
        ? html`<span class="${BADGE_LINK}">${entry.site}</span>`
        : html`<span class="${BADGE}">${entry.readingMinutes} min</span>`}
    </div>
    <h2 class="mb-1.5 font-serif text-[1.4rem] leading-snug font-bold tracking-[-0.015em]">
      <a
        href="${hrefFor(entry)}"
        class="group text-ink no-underline hover:text-accent"
        ${isLink ? raw('target="_blank" rel="noopener"') : ""}
        >${entry.title}${isLink
          ? html`<span
              class="ml-0.5 inline-block -translate-y-px text-[0.85em] text-ink-faint transition group-hover:translate-x-0.5 group-hover:-translate-y-[3px] group-hover:text-accent motion-reduce:transition-none"
              aria-hidden="true"
              >↗</span
            >`
          : ""}</a
      >
    </h2>
    ${entry.excerpt
      ? html`<p class="max-w-measure text-[0.95rem] text-ink-dim">${entry.excerpt}</p>`
      : ""}
  </li>`;
}

function timeline(entries: EntrySummary[], emptyMessage: Html): Html {
  return entries.length === 0
    ? html`<p class="py-12 text-center text-ink-dim">${emptyMessage}</p>`
    : html`<ul>
        ${entries.map(entryRow)}
      </ul>`;
}

/**
 * The homepage lead: who the blog belongs to, up front.
 *
 * The avatar, name, tagline, and a couple of paragraphs of bio sit at the top
 * of the landing page rather than being exiled to a named About route. The
 * visitor meets the author before the first post.
 */
function homeHero(site: Site): Html {
  const { author } = site;
  const isPlaceholder = author.avatar === "/avatar.svg";

  return html`<section class="mb-12 border-b border-line pb-10">
      <div class="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-7">
        <img
          class="size-24 shrink-0 rounded-2xl border border-line-strong bg-surface object-cover"
          src="${author.avatar}"
          alt="${author.avatarAlt}"
          width="96"
          height="96"
        />
        <div class="min-w-0 flex-1">
          <p class="font-mono text-xs font-semibold tracking-[0.14em] text-accent uppercase">
            · Hey — I’m a human, not a brand
          </p>
          <h1 class="mt-2 mb-2 font-serif text-[2.4rem] leading-[1.05] font-bold tracking-[-0.02em]">
            ${author.name}
          </h1>
          <p class="mb-4 font-serif text-[1.1rem] text-ink-dim italic">${author.tagline}</p>
          ${author.bio.slice(0, 2).map(
            (paragraph) => html`<p class="mb-3 max-w-[62ch] text-[0.95rem] text-ink">${paragraph}</p>`,
          )}
          ${site.socials.length > 0
            ? html`<div class="mt-5 flex flex-wrap gap-2">
                ${site.socials.map(
                  (social) =>
                    html`<a
                      class="rounded-full border border-ink px-3.5 py-1 font-mono text-[0.82rem] text-ink no-underline transition-colors hover:bg-ink hover:text-canvas"
                      href="${social.href}"
                      ${social.href.startsWith("/") ? "" : raw('rel="me noopener"')}
                      >${social.label === "RSS" ? "feed" : social.label}</a
                    >`,
                )}
              </div>`
            : ""}
          ${isPlaceholder
            ? html`<p class="mt-4 font-mono text-xs text-ink-faint">
                <span class="text-accent" aria-hidden="true">←</span> that’s a placeholder portrait —
                drop a real photo in <code class="text-ink-dim">public/</code> and point the config at it.
              </p>`
            : ""}
        </div>
      </div>
    </section>`;
}

export function homePage(entries: EntrySummary[], site: Site): Html {
  return html`${homeHero(site)}
    ${entries.length > 0
      ? html`<section>
          <div class="mb-2 flex items-center gap-3">
            <h2 class="font-serif text-[1.3rem] font-bold tracking-[-0.01em]">Recent writing</h2>
            <span class="flex-1 border-b border-dashed border-line" aria-hidden="true"></span>
          </div>
          ${timeline(entries, html`Nothing published yet.`)}
        </section>`
      : html`<p class="py-12 text-center text-ink-dim">Nothing published yet.</p>`}`;
}

export function tagPage(tag: string, entries: EntrySummary[]): Html {
  return html`<section class="mb-4 border-b border-line pb-10">
      <h1 class="mb-2.5 font-serif text-[2rem] font-bold leading-[1.2] tracking-[-0.025em]">
        Tagged “${tag}”
      </h1>
      <p class="max-w-measure text-ink-dim">
        ${entries.length} ${entries.length === 1 ? "entry" : "entries"}.
      </p>
    </section>

    ${timeline(entries, html`Nothing here. <a href="/">Back to writing</a>.`)}`;
}

export function entryPage(entry: Entry, recent: EntrySummary[]): Html {
  const isLink = entry.kind === "link";

  return html`<article>
      ${entry.status === "preview"
        ? html`<div
            data-preview-banner
            class="mb-8 flex gap-2.5 rounded-card border border-dashed border-line-strong bg-surface px-4 py-3 text-[0.85rem] text-ink-dim"
          >
            <strong class="text-ink">Preview.</strong>
            <span>
              This entry isn’t published — it appears in no list, feed, or search
              engine. Anyone with the link can read it.
            </span>
          </div>`
        : ""}

      <header class="mb-8 border-b border-line pb-6">
        <div class="${META_ROW}">
          <time datetime="${entry.date}">${formatDate(entry.date)}</time>
          ${entry.kind === "link"
            ? html`<span class="${BADGE_LINK}">${entry.site}</span>`
            : html`<span class="${BADGE}">${entry.readingMinutes} min read</span>`}
          ${entry.author ? html`<span>${entry.author}</span>` : ""}
        </div>
        <h1 class="mt-2 mb-3 font-serif text-[2.2rem] font-bold leading-[1.18] tracking-[-0.03em]">
          ${entry.title}
        </h1>
        ${entry.updated
          ? html`<p class="text-[0.95rem] text-ink-dim">Updated ${formatDate(entry.updated)}.</p>`
          : ""}
      </header>

      ${entry.kind === "link"
        ? html`<a
            data-callout
            class="mb-8 block rounded-card border border-l-[3px] border-line border-l-accent bg-surface px-[1.15rem] py-4 no-underline"
            href="${entry.url}"
            target="_blank"
            rel="noopener"
          >
            <strong class="mb-0.5 block text-ink">Read it on ${entry.site} ↗</strong>
            <span class="block font-mono text-[0.78rem] break-all text-ink-dim">${entry.url}</span>
          </a>`
        : ""}

      <!-- Already rendered and sanitised at build time from your own Markdown. -->
      ${entry.html ? html`<div class="${PROSE}">${raw(entry.html)}</div>` : ""}

      ${entry.tags.length > 0
        ? html`<div class="${TAG_ROW}">
            ${entry.tags.map(
              (tag) => html`<a class="${TAG}" href="/tags/${encodeURIComponent(tag)}">#${tag}</a>`,
            )}
          </div>`
        : ""}
    </article>

    ${recent.length > 0
      ? html`<aside data-recent class="mt-14 border-t border-line pt-7">
          <h2
            class="mb-4 font-mono text-[0.78rem] font-semibold tracking-[0.06em] text-ink-faint uppercase"
          >
            Recent
          </h2>
          <ul class="grid gap-3">
            ${recent.map(
              (item) => html`<li class="flex flex-wrap items-baseline gap-x-3">
                <time class="font-mono text-xs text-ink-faint" datetime="${item.date}"
                  >${formatDate(item.date)}</time
                >
                <a
                  href="${hrefFor(item)}"
                  class="text-[0.95rem] text-ink no-underline hover:text-accent"
                  ${item.kind === "link" ? raw('target="_blank" rel="noopener"') : ""}
                  >${item.title}${item.kind === "link" ? " ↗" : ""}</a
                >
              </li>`,
            )}
          </ul>
        </aside>`
      : ""}`;
}

export function aboutPage(site: Site): Html {
  const { author } = site;
  // The stock avatar ships with the template; say so rather than passing it off.
  const isPlaceholder = author.avatar === "/avatar.svg";

  return html`<div class="mb-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
      <img
        class="size-24 shrink-0 rounded-full border border-line-strong bg-surface object-cover"
        src="${author.avatar}"
        alt="${author.avatarAlt}"
        width="96"
        height="96"
      />
      <div>
        <h1 class="mb-1.5 font-serif text-[1.9rem] font-bold tracking-[-0.025em]">${author.name}</h1>
        <p class="text-[0.95rem] text-ink-dim">${author.tagline}</p>
        ${isPlaceholder
          ? html`<span
              class="mt-2.5 inline-block rounded-full border border-dashed border-line-strong px-2 py-0.5 font-mono text-[0.68rem] text-ink-faint"
              >placeholder photo</span
            >`
          : ""}
      </div>
    </div>

    <div class="${PROSE}">${author.bio.map((paragraph) => html`<p>${paragraph}</p>`)}</div>

    ${site.socials.length > 0
      ? html`<div class="${TAG_ROW}">
          ${site.socials
            .filter((social) => !social.href.startsWith("/"))
            .map(
              (social) =>
                html`<a class="${TAG}" href="${social.href}" rel="me noopener">${social.label}</a>`,
            )}
        </div>`
      : ""}`;
}

export function notFoundPage(): Html {
  return html`<div class="py-16 text-center">
    <h1 class="mb-2 font-mono text-5xl font-bold text-ink-faint">404</h1>
    <p class="text-ink-dim">That page doesn’t exist.</p>
    <p class="mt-4"><a href="/">Back to writing</a></p>
  </div>`;
}
