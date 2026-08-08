import type { Entry, Post } from "./types";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * RSS 2.0 feed covering the whole timeline.
 *
 * A link entry points readers straight at the external post — that's the
 * linkblog convention, and sending them here first would be a detour to a page
 * that only says "go there". Its `guid` stays on this domain so the item keeps
 * a stable identity in readers even if the target URL changes.
 */
export function renderRss(entries: readonly Entry[], env: Env): string {
  const site = env.SITE_URL.replace(/\/$/, "");
  const latest = entries[0]?.date ?? new Date(0).toISOString();

  const items = entries
    .map((entry) => {
      const permalink = `${site}/posts/${entry.slug}`;
      const target = entry.kind === "link" ? entry.url : permalink;
      const title = entry.kind === "link" ? `${entry.title} (${entry.site})` : entry.title;

      // For a link, the body is commentary, so fall back to the excerpt when
      // there is none rather than emitting an empty item.
      const body = entry.html || `<p>${escapeXml(entry.excerpt)}</p>`;

      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(target)}</link>
      <guid isPermaLink="false">${escapeXml(permalink)}</guid>
      <pubDate>${new Date(entry.date).toUTCString()}</pubDate>
      <description>${escapeXml(entry.excerpt)}</description>
${entry.tags.map((t) => `      <category>${escapeXml(t)}</category>`).join("\n")}
      <content:encoded><![CDATA[${body.replace(/]]>/g, "]]&gt;")}]]></content:encoded>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(env.SITE_TITLE)}</title>
    <link>${escapeXml(site)}</link>
    <description>${escapeXml(env.SITE_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${site}/feed.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

/**
 * Sitemap for posts hosted here. Takes `Post[]` rather than `Entry[]` because a
 * sitemap may only list URLs on this domain — the type makes that a compile
 * error rather than an SEO bug.
 */
export function renderSitemap(posts: readonly Post[], env: Env): string {
  const site = env.SITE_URL.replace(/\/$/, "");
  const urls = posts
    .map(
      (post) => `  <url>
    <loc>${escapeXml(`${site}/posts/${post.slug}`)}</loc>
    <lastmod>${(post.updated ?? post.date).slice(0, 10)}</lastmod>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeXml(site)}</loc>
  </url>
${urls}
</urlset>
`;
}
