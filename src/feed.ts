import type { Post } from "./types";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RSS 2.0 feed. Item bodies carry the full rendered HTML in a CDATA block. */
export function renderRss(posts: readonly Post[], env: Env): string {
  const site = env.SITE_URL.replace(/\/$/, "");
  const latest = posts[0]?.date ?? new Date(0).toISOString();

  const items = posts
    .map((post) => {
      const url = `${site}/posts/${post.slug}`;
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <description>${escapeXml(post.excerpt)}</description>
${post.tags.map((t) => `      <category>${escapeXml(t)}</category>`).join("\n")}
      <content:encoded><![CDATA[${post.html.replace(/]]>/g, "]]&gt;")}]]></content:encoded>
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

/** Sitemap covering the post URLs the front end will eventually serve. */
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
