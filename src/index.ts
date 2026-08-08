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
import { getViews, getViewsBatch, mostViewed, recordView } from "./views";
import type { EntryKind } from "./types";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
// Wide open for now — the front end isn't built yet and may live on another
// origin during development. Narrow this to your domain before launch.
app.use("/api/*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));

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

// --- Meta -----------------------------------------------------------------

app.get("/", (c) =>
  c.json({
    name: c.env.SITE_TITLE,
    description: c.env.SITE_DESCRIPTION,
    status: "backend only — front end not built yet",
    entryKinds: {
      post: "written and hosted here; has markdown/html and readingMinutes",
      link: "published on another site; has url and site, body is commentary",
    },
    entryStatuses: {
      published: "in every list, feed, and tag count",
      preview: "fetchable by slug, absent from all listings — unlisted, not secret",
      draft: "never served",
    },
    endpoints: [
      "GET  /api/health",
      "GET  /api/entries?kind=&tag=&q=&limit=&offset=&views=",
      "GET  /api/posts   (alias for kind=post)",
      "GET  /api/links   (alias for kind=link)",
      "GET  /api/entries/:slug?views=",
      "GET  /api/entries/:slug/related",
      "GET  /api/entries/:slug/views   (posts only)",
      "POST /api/entries/:slug/views   (posts only)",
      "GET  /api/tags",
      "GET  /api/popular?limit=",
      "GET  /feed.xml",
      "GET  /sitemap.xml",
    ],
  }),
);

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
  c.body(renderRss(publishedEntries(), c.env), 200, {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  }),
);

app.get("/sitemap.xml", (c) =>
  // Links are deliberately absent: a sitemap may only claim URLs on this site.
  c.body(renderSitemap(publishedPosts(), c.env), 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  }),
);

// --- Errors ---------------------------------------------------------------

app.notFound((c) => c.json({ error: "Not found", path: new URL(c.req.url).pathname }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
