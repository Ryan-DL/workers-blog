import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";

import {
  getEntry,
  getPublishedPost,
  listEntries,
  listTags,
  publishedEntries,
  publishedPosts,
  relatedEntries,
  statusCounts,
  summarize,
} from "./content";
import { renderRss, renderSitemap } from "./feed";
import { openApiSpec } from "./openapi";
import blogConfig from "../blog.config";
import { resolveSite } from "./config";
import { getViews, getViewsBatch, mostViewed, recordView } from "./views";
import { layout } from "./views/layout";
import { docsPage } from "./views/docs";
import { aboutPage, entryPage, homePage, notFoundPage, tagPage } from "./views/pages";
import type { EntryKind } from "./types";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
// The site itself is same-origin, so this is only for other people's clients
// reading the API. Narrow it if you'd rather nobody else consumed the feed.
app.use("/api/*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));

/**
 * Resolve blog.config.ts against this request.
 *
 * Per-request rather than once at module scope because an empty `url` in the
 * config means "use whatever host this was served on" — which is what keeps
 * localhost, *.workers.dev, and the real domain all correct without editing
 * anything between them.
 */
const siteOf = (c: Context<{ Bindings: Env }>) => resolveSite(blogConfig, c.req.url);

/** Parse a non-negative integer query param, falling back on anything invalid. */
function intParam(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

function truthy(raw: string | undefined): boolean {
  return raw === "1" || raw === "true";
}

/**
 * Unlike pagination, a bad `kind` is rejected rather than ignored: silently
 * returning links when someone asked for `kind=posts` would be a wrong answer,
 * not a degraded one.
 */
function kindParam(raw: string | undefined): EntryKind | undefined {
  if (raw === undefined || raw === "all") return undefined;
  if (raw === "post" || raw === "link") return raw;
  throw new HTTPException(400, {
    message: `Invalid kind "${raw}" — expected "post", "link", or "all"`,
  });
}

// --- Pages ----------------------------------------------------------------
//
// Server-rendered rather than a client-side app: the entries are already
// compiled into this bundle, so rendering a page is a lookup and a template.
// There is nothing to fetch and nothing to hydrate.

app.get("/", (c) => {
  const site = siteOf(c);
  const { entries } = listEntries({ limit: MAX_LIMIT, offset: 0 });
  return c.html(
    layout(
      { title: site.title, description: site.description, path: "/", nav: "Writing" },
      homePage(entries, site),
      site,
    ),
  );
});

app.get("/about", (c) => {
  const site = siteOf(c);
  return c.html(
    layout(
      { title: "About", description: `About ${site.author.name}.`, path: "/about", nav: "About" },
      aboutPage(site),
      site,
    ),
  );
});

app.get("/posts/:slug", (c) => {
  const slug = c.req.param("slug");
  const entry = getEntry(slug);

  if (!entry) {
    return c.html(
      layout(
        { title: "Not found", description: "No such page.", path: `/posts/${slug}`, noindex: true },
        notFoundPage(),
        siteOf(c),
      ),
      404,
    );
  }

  // Same reasoning as the API: a preview is unlisted, so keep crawlers and
  // shared caches away from the page built from it.
  if (entry.status === "preview") {
    c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("Cache-Control", "private, no-store");
  }

  return c.html(
    layout(
      {
        title: entry.title,
        description: entry.excerpt,
        path: `/posts/${entry.slug}`,
        noindex: entry.status === "preview",
      },
      entryPage(entry, relatedEntries(slug, 4)),
      siteOf(c),
    ),
  );
});

app.get("/tags/:tag", (c) => {
  const tag = c.req.param("tag");
  const { entries } = listEntries({ tag, limit: MAX_LIMIT, offset: 0 });

  return c.html(
    layout(
      {
        title: `Tagged “${tag}”`,
        description: `Entries tagged ${tag}.`,
        path: `/tags/${encodeURIComponent(tag)}`,
      },
      tagPage(tag, entries),
      siteOf(c),
    ),
  );
});

// --- API docs -------------------------------------------------------------

app.get("/docs", (c) => c.html(docsPage(siteOf(c))));

app.get("/openapi.json", (c) =>
  c.json(openApiSpec(siteOf(c)), 200, { "Cache-Control": "public, max-age=3600" }),
);

// --- API meta -------------------------------------------------------------

app.get("/api", (c) => {
  const site = siteOf(c);
  return c.json({
    name: site.title,
    description: site.description,
    entryKinds: {
      post: "written and hosted here; has markdown/html and readingMinutes",
      link: "published on another site; has url and site, body is commentary",
    },
    entryStatuses: {
      published: "in every list, feed, and tag count",
      preview: "fetchable by slug, absent from all listings — unlisted, not secret",
      draft: "never served",
    },
    documentation: "/docs",
    spec: "/openapi.json",
    endpoints: [
      "GET  /api/health",
      "GET  /api/entries?kind=&tag=&q=&limit=&offset=&views=",
      "GET  /api/posts   (alias for kind=post)",
      "GET  /api/links   (alias for kind=link)",
      "GET  /api/entries/:slug?views=",
      "GET  /api/entries/:slug/related",
      "GET  /api/entries/:slug/views   (published posts only)",
      "POST /api/entries/:slug/views   (published posts only)",
      "GET  /api/tags",
      "GET  /api/popular?limit=",
      "GET  /feed.xml",
      "GET  /sitemap.xml",
    ],
  });
});

app.get("/api/health", (c) => {
  const entries = publishedEntries();
  return c.json({
    ok: true,
    entries: entries.length,
    posts: entries.filter((e) => e.kind === "post").length,
    links: entries.filter((e) => e.kind === "link").length,
    byStatus: statusCounts(),
    timestamp: new Date().toISOString(),
  });
});

// --- The timeline ---------------------------------------------------------

/** Shared handler for /api/entries and its kind-pinned aliases. */
async function listHandler(c: Context<{ Bindings: Env }>, forcedKind?: EntryKind) {
  const result = listEntries({
    kind: forcedKind ?? kindParam(c.req.query("kind")),
    tag: c.req.query("tag"),
    query: c.req.query("q"),
    limit: intParam(c.req.query("limit"), DEFAULT_LIMIT, MAX_LIMIT),
    offset: intParam(c.req.query("offset"), 0, Number.MAX_SAFE_INTEGER),
  });

  if (!truthy(c.req.query("views"))) return c.json(result);

  // Only hosted posts have view counts; links are read on someone else's site.
  const counts = await getViewsBatch(
    c.env.DB,
    result.entries.filter((e) => e.kind === "post").map((e) => e.slug),
  );
  return c.json({
    ...result,
    entries: result.entries.map((e) =>
      e.kind === "post" ? { ...e, views: counts[e.slug] ?? 0 } : e,
    ),
  });
}

app.get("/api/entries", (c) => listHandler(c));
app.get("/api/posts", (c) => listHandler(c, "post"));
app.get("/api/links", (c) => listHandler(c, "link"));

app.get("/api/entries/:slug", async (c) => {
  const slug = c.req.param("slug");
  const entry = getEntry(slug);
  if (!entry) throw new HTTPException(404, { message: `No entry with slug "${slug}"` });

  // A preview is unlisted, not secret — but ask crawlers to stay out, and give
  // caches no chance to serve it to someone else after it changes.
  if (entry.status === "preview") {
    c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("Cache-Control", "private, no-store");
  }

  // sourceFile is a build detail; it stays server-side.
  const { sourceFile: _sourceFile, ...body } = entry;

  if (!truthy(c.req.query("views")) || entry.status !== "published" || entry.kind !== "post") {
    return c.json(body);
  }
  return c.json({ ...body, views: await getViews(c.env.DB, slug) });
});

app.get("/api/entries/:slug/related", (c) => {
  const slug = c.req.param("slug");
  if (!getEntry(slug)) throw new HTTPException(404, { message: `No entry with slug "${slug}"` });

  const limit = intParam(c.req.query("limit"), 3, 10);
  return c.json({ entries: relatedEntries(slug, limit) });
});

// --- View counts ----------------------------------------------------------

/**
 * View counting applies only to published posts hosted here. When the entry
 * exists but the operation doesn't apply to it, that's a 400 rather than a 404
 * — the caller asked for something real in the wrong way.
 */
function requirePublishedPost(slug: string) {
  const post = getPublishedPost(slug);
  if (post) return post;

  const entry = getEntry(slug);
  if (entry?.kind === "link") {
    throw new HTTPException(400, {
      message: `"${slug}" is an external link, which has no view count`,
    });
  }
  if (entry) {
    throw new HTTPException(400, {
      message: `"${slug}" is a preview and is not counted until it's published`,
    });
  }
  throw new HTTPException(404, { message: `No entry with slug "${slug}"` });
}

app.get("/api/entries/:slug/views", async (c) => {
  const slug = c.req.param("slug");
  requirePublishedPost(slug);

  return c.json({ slug, views: await getViews(c.env.DB, slug) });
});

app.post("/api/entries/:slug/views", async (c) => {
  const slug = c.req.param("slug");
  // Only count reads of posts we actually publish, so the table can't be
  // seeded with arbitrary slugs by anyone who can POST.
  requirePublishedPost(slug);

  return c.json({ slug, views: await recordView(c.env.DB, slug) });
});

app.get("/api/popular", async (c) => {
  const limit = intParam(c.req.query("limit"), 5, MAX_LIMIT);
  const ranked = await mostViewed(c.env.DB, limit);

  // A slug in D1 whose Markdown file was since deleted or drafted is dropped.
  const entries = ranked.flatMap((row) => {
    const post = getPublishedPost(row.slug);
    return post ? [{ ...summarize(post), views: row.views }] : [];
  });

  return c.json({ entries });
});

// --- Tags -----------------------------------------------------------------

app.get("/api/tags", (c) => c.json({ tags: listTags() }));

// --- Feeds ----------------------------------------------------------------

app.get("/feed.xml", (c) =>
  c.body(renderRss(publishedEntries(), siteOf(c)), 200, {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  }),
);

app.get("/sitemap.xml", (c) =>
  // Links are deliberately absent: a sitemap may only claim URLs on this site.
  c.body(renderSitemap(publishedPosts(), siteOf(c)), 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  }),
);

// --- Errors ---------------------------------------------------------------

/** API callers get JSON; humans get a page. */
function wantsJson(path: string): boolean {
  return path.startsWith("/api") || path.endsWith(".json");
}

app.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  if (wantsJson(path)) return c.json({ error: "Not found", path }, 404);

  return c.html(
    layout(
      { title: "Not found", description: "No such page.", path, noindex: true },
      notFoundPage(),
      siteOf(c),
    ),
    404,
  );
});

app.onError((err, c) => {
  const path = new URL(c.req.url).pathname;
  const status = err instanceof HTTPException ? err.status : 500;

  if (!(err instanceof HTTPException)) console.error("Unhandled error:", err);
  const message = err instanceof HTTPException ? err.message : "Internal server error";

  if (wantsJson(path)) return c.json({ error: message }, status);

  return c.html(
    layout(
      { title: "Something went wrong", description: message, path, noindex: true },
      notFoundPage(),
      siteOf(c),
    ),
    status,
  );
});

export default app;
