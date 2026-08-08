import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";

import { allPublished, getPost, listPosts, listTags, relatedPosts, summarize } from "./content";
import { renderRss, renderSitemap } from "./feed";
import { getViews, getViewsBatch, mostViewed, recordView } from "./views";

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

// --- Meta -----------------------------------------------------------------

app.get("/", (c) =>
  c.json({
    name: c.env.SITE_TITLE,
    description: c.env.SITE_DESCRIPTION,
    status: "backend only — front end not built yet",
    endpoints: [
      "GET  /api/health",
      "GET  /api/posts?tag=&q=&limit=&offset=&views=",
      "GET  /api/posts/:slug?views=",
      "GET  /api/posts/:slug/related",
      "GET  /api/posts/:slug/views",
      "POST /api/posts/:slug/views",
      "GET  /api/tags",
      "GET  /api/popular?limit=",
      "GET  /feed.xml",
      "GET  /sitemap.xml",
    ],
  }),
);

app.get("/api/health", (c) =>
  c.json({ ok: true, posts: allPublished().length, timestamp: new Date().toISOString() }),
);

// --- Posts ----------------------------------------------------------------

app.get("/api/posts", async (c) => {
  const result = listPosts({
    tag: c.req.query("tag"),
    query: c.req.query("q"),
    limit: intParam(c.req.query("limit"), DEFAULT_LIMIT, MAX_LIMIT),
    offset: intParam(c.req.query("offset"), 0, Number.MAX_SAFE_INTEGER),
  });

  if (!truthy(c.req.query("views"))) return c.json(result);

  const counts = await getViewsBatch(
    c.env.DB,
    result.posts.map((p) => p.slug),
  );
  return c.json({
    ...result,
    posts: result.posts.map((p) => ({ ...p, views: counts[p.slug] ?? 0 })),
  });
});

app.get("/api/posts/:slug", async (c) => {
  const slug = c.req.param("slug");
  const post = getPost(slug);
  if (!post) throw new HTTPException(404, { message: `No post with slug "${slug}"` });

  // sourceFile is a build detail; it stays server-side.
  const { sourceFile: _sourceFile, ...body } = post;

  if (!truthy(c.req.query("views"))) return c.json(body);
  return c.json({ ...body, views: await getViews(c.env.DB, slug) });
});

app.get("/api/posts/:slug/related", (c) => {
  const slug = c.req.param("slug");
  if (!getPost(slug)) throw new HTTPException(404, { message: `No post with slug "${slug}"` });

  const limit = intParam(c.req.query("limit"), 3, 10);
  return c.json({ posts: relatedPosts(slug, limit) });
});

// --- View counts ----------------------------------------------------------

app.get("/api/posts/:slug/views", async (c) => {
  const slug = c.req.param("slug");
  if (!getPost(slug)) throw new HTTPException(404, { message: `No post with slug "${slug}"` });

  return c.json({ slug, views: await getViews(c.env.DB, slug) });
});

app.post("/api/posts/:slug/views", async (c) => {
  const slug = c.req.param("slug");
  // Only count reads of posts we actually publish, so the table can't be
  // seeded with arbitrary slugs by anyone who can POST.
  if (!getPost(slug)) throw new HTTPException(404, { message: `No post with slug "${slug}"` });

  return c.json({ slug, views: await recordView(c.env.DB, slug) });
});

app.get("/api/popular", async (c) => {
  const limit = intParam(c.req.query("limit"), 5, MAX_LIMIT);
  const ranked = await mostViewed(c.env.DB, limit);

  // A slug in D1 whose Markdown file was since deleted or drafted is dropped.
  const posts = ranked.flatMap((row) => {
    const post = getPost(row.slug);
    return post ? [{ ...summarize(post), views: row.views }] : [];
  });

  return c.json({ posts });
});

// --- Tags -----------------------------------------------------------------

app.get("/api/tags", (c) => c.json({ tags: listTags() }));

// --- Feeds ----------------------------------------------------------------

app.get("/feed.xml", (c) =>
  c.body(renderRss(allPublished(), c.env), 200, {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  }),
);

app.get("/sitemap.xml", (c) =>
  c.body(renderSitemap(allPublished(), c.env), 200, {
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
