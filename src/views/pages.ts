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

/** Where an entry points: a link leaves the site, a post doesn't. */
function hrefFor(entry: EntrySummary): string {
  return entry.kind === "link" ? entry.url : `/posts/${entry.slug}`;
}

/**
 * One row in the timeline.
 *
 * A post links to its own page; a link goes straight off-site, with an arrow
 * and its source named, so nobody clicks expecting to stay.
 */
function entryRow(entry: EntrySummary): Html {
  const isLink = entry.kind === "link";

  return html`<li class="entry">
    <div class="entry-meta">
      <time datetime="${entry.date}">${formatDate(entry.date)}</time>
      ${entry.kind === "link"
        ? html`<span class="badge badge-link">${entry.site}</span>`
        : html`<span class="badge">${entry.readingMinutes} min</span>`}
    </div>
    <h2 class="entry-title">
      <a href="${hrefFor(entry)}" ${isLink ? raw('target="_blank" rel="noopener"') : ""}
        >${entry.title}${isLink
          ? html`<span class="external-arrow" aria-hidden="true">↗</span>`
          : ""}</a
      >
    </h2>
    ${entry.excerpt ? html`<p class="entry-excerpt">${entry.excerpt}</p>` : ""}
  </li>`;
}

function timeline(entries: EntrySummary[], emptyMessage: Html): Html {
  return entries.length === 0
    ? html`<p class="empty">${emptyMessage}</p>`
    : html`<ul class="timeline">
        ${entries.map(entryRow)}
      </ul>`;
}

export function homePage(entries: EntrySummary[], site: Site): Html {
  return html`<section class="intro">
      <h1>${site.title}</h1>
      <p>${site.description}</p>
    </section>

    ${timeline(entries, html`Nothing published yet.`)}`;
}

export function tagPage(tag: string, entries: EntrySummary[]): Html {
  return html`<section class="intro">
      <h1>Tagged “${tag}”</h1>
      <p>${entries.length} ${entries.length === 1 ? "entry" : "entries"}.</p>
    </section>

    ${timeline(entries, html`Nothing here. <a href="/">Back to writing</a>.`)}`;
}

export function entryPage(entry: Entry, related: EntrySummary[]): Html {
  const isLink = entry.kind === "link";
  // Only a published post gets a view ping; the server rejects anything else.
  const countable = entry.status === "published" && !isLink;

  return html`<article ${countable ? raw(`data-view-slug="${entry.slug}"`) : ""}>
      ${entry.status === "preview"
        ? html`<div class="preview-banner">
            <strong>Preview.</strong>
            <span>
              This entry isn’t published — it appears in no list, feed, or search
              engine. Anyone with the link can read it.
            </span>
          </div>`
        : ""}

      <header class="entry-header">
        <div class="entry-meta">
          <time datetime="${entry.date}">${formatDate(entry.date)}</time>
          ${entry.kind === "link"
            ? html`<span class="badge badge-link">${entry.site}</span>`
            : html`<span class="badge">${entry.readingMinutes} min read</span>`}
          ${entry.author ? html`<span>${entry.author}</span>` : ""}
          ${countable ? html`<span class="view-count" data-view-count></span>` : ""}
        </div>
        <h1>${entry.title}</h1>
        ${entry.updated
          ? html`<p class="entry-excerpt">Updated ${formatDate(entry.updated)}.</p>`
          : ""}
      </header>

      ${entry.kind === "link"
        ? html`<a class="callout-link" href="${entry.url}" target="_blank" rel="noopener">
            <strong>Read it on ${entry.site} ↗</strong>
            <span>${entry.url}</span>
          </a>`
        : ""}

      <!-- Already rendered and sanitised at build time from your own Markdown. -->
      ${entry.html ? html`<div class="prose">${raw(entry.html)}</div>` : ""}

      ${entry.tags.length > 0
        ? html`<div class="tag-row">
            ${entry.tags.map(
              (tag) => html`<a class="tag" href="/tags/${encodeURIComponent(tag)}">#${tag}</a>`,
            )}
          </div>`
        : ""}
    </article>

    ${related.length > 0
      ? html`<aside class="related">
          <h2>Related</h2>
          <ul>
            ${related.map(
              (item) => html`<li>
                <a
                  href="${hrefFor(item)}"
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

  return html`<div class="about-head">
      <img class="avatar" src="${author.avatar}" alt="${author.avatarAlt}" width="96" height="96" />
      <div>
        <h1>${author.name}</h1>
        <p>${author.tagline}</p>
        ${isPlaceholder ? html`<span class="placeholder-note">placeholder photo</span>` : ""}
      </div>
    </div>

    <div class="prose">${author.bio.map((paragraph) => html`<p>${paragraph}</p>`)}</div>

    ${site.socials.length > 0
      ? html`<div class="tag-row">
          ${site.socials
            .filter((social) => !social.href.startsWith("/"))
            .map(
              (social) =>
                html`<a class="tag" href="${social.href}" rel="me noopener">${social.label}</a>`,
            )}
        </div>`
      : ""}`;
}

export function notFoundPage(): Html {
  return html`<div class="error-page">
    <h1>404</h1>
    <p>That page doesn’t exist.</p>
    <p><a href="/">Back to writing</a></p>
  </div>`;
}
