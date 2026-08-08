import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applySchema, resetViews } from "./helpers";

beforeAll(applySchema);
beforeEach(resetViews);

interface Summary {
  kind: "post" | "link";
  status: "published" | "preview" | "draft";
  slug: string;
  title: string;
  date: string;
  tags: string[];
  url?: string;
  site?: string;
  views?: number;
  readingMinutes?: number;
}

const list = async (path: string) =>
  (await SELF.fetch(`https://example.com${path}`)).json<{
    entries: Summary[];
    total: number;
    limit: number;
    offset: number;
  }>();

describe("meta", () => {
  it("serves an API index at /api, leaving / to the site", async () => {
    const res = await SELF.fetch("https://example.com/api");
    expect(res.status).toBe(200);

    const body = await res.json<{ endpoints: string[]; documentation: string }>();
    expect(body.endpoints.length).toBeGreaterThan(0);
    expect(body.documentation).toBe("/docs");
  });

  it("reports health with a breakdown by kind and status", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    const body = await res.json<{
      ok: boolean;
      entries: number;
      posts: number;
      links: number;
      byStatus: Record<string, number>;
    }>();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // Counts cover published entries only.
    expect(body.posts).toBe(2);
    expect(body.links).toBe(2);
    expect(body.entries).toBe(body.posts + body.links);
    expect(body.byStatus).toEqual({ published: 4, preview: 1, draft: 1 });
  });

  it("404s unknown API routes as JSON", async () => {
    const res = await SELF.fetch("https://example.com/api/nope");

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ error: "Not found" });
  });
});

describe("GET /api/entries", () => {
  it("merges posts and links into one timeline, newest first", async () => {
    const body = await list("/api/entries");

    expect(body.total).toBe(4);
    const dates = body.entries.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);

    const kinds = new Set(body.entries.map((e) => e.kind));
    expect(kinds).toEqual(new Set(["post", "link"]));
  });

  it("omits bodies from summaries", async () => {
    const body = await list("/api/entries");
    expect(body.entries[0]).not.toHaveProperty("html");
    expect(body.entries[0]).not.toHaveProperty("markdown");
  });

  it("excludes drafts and previews", async () => {
    const body = await list("/api/entries?limit=100");
    const slugs = body.entries.map((e) => e.slug);

    expect(slugs).not.toContain("draft-example");
    expect(slugs).not.toContain("preview-example");
    expect(body.entries.every((e) => e.status === "published")).toBe(true);
  });

  it("filters by kind", async () => {
    const posts = await list("/api/entries?kind=post");
    const links = await list("/api/entries?kind=link");

    expect(posts.entries.every((e) => e.kind === "post")).toBe(true);
    expect(links.entries.every((e) => e.kind === "link")).toBe(true);
    expect(posts.total + links.total).toBe(4);
  });

  it("treats kind=all as unfiltered", async () => {
    expect((await list("/api/entries?kind=all")).total).toBe(4);
  });

  it("rejects an unknown kind rather than silently ignoring it", async () => {
    const res = await SELF.fetch("https://example.com/api/entries?kind=posts");
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toContain("Invalid kind");
  });

  it("filters by tag across both kinds", async () => {
    const body = await list("/api/entries?tag=CLOUDFLARE");

    expect(body.total).toBe(4);
    expect(new Set(body.entries.map((e) => e.kind))).toEqual(new Set(["post", "link"]));
  });

  it("paginates and caps limit", async () => {
    const first = await list("/api/entries?limit=1");
    const second = await list("/api/entries?limit=1&offset=1");

    expect(first.entries).toHaveLength(1);
    expect(first.entries[0]!.slug).not.toBe(second.entries[0]!.slug);
    expect((await list("/api/entries?limit=9999")).limit).toBe(100);
    expect((await list("/api/entries?limit=abc&offset=-5")).offset).toBe(0);
  });
});

describe("kind-pinned aliases", () => {
  it("/api/posts returns only hosted posts", async () => {
    const body = await list("/api/posts");
    expect(body.total).toBe(2);
    expect(body.entries.every((e) => e.kind === "post")).toBe(true);
  });

  it("/api/links returns only external links", async () => {
    const body = await list("/api/links");
    expect(body.total).toBe(2);
    expect(body.entries.every((e) => e.kind === "link")).toBe(true);
  });

  it("ignores a conflicting kind param on an alias", async () => {
    const body = await list("/api/links?kind=post");
    expect(body.entries.every((e) => e.kind === "link")).toBe(true);
  });
});

describe("external links", () => {
  it("exposes url, site, and kind", async () => {
    const body = await list("/api/links");
    const guest = body.entries.find((e) => e.slug === "guest-post-on-edge-caching");

    expect(guest).toMatchObject({
      kind: "link",
      title: "What I got wrong about edge caching",
      date: "2026-02-20T00:00:00.000Z",
      url: "https://example.com/blog/edge-caching-mistakes",
      site: "Example Engineering",
    });
  });

  it("derives site from the URL host when unset, dropping www.", async () => {
    const body = await list("/api/links");
    expect(body.entries.find((e) => e.slug === "sqlite-at-the-edge")?.site).toBe("example.org");
  });

  it("carries no readingMinutes, since the body isn't the content", async () => {
    const body = await list("/api/links");
    expect(body.entries.every((e) => e.readingMinutes === undefined)).toBe(true);
  });

  it("serves commentary as the body on the detail route", async () => {
    const res = await SELF.fetch("https://example.com/api/entries/guest-post-on-edge-caching");
    const entry = await res.json<{ kind: string; url: string; html: string; excerpt: string }>();

    expect(res.status).toBe(200);
    expect(entry.kind).toBe("link");
    expect(entry.url).toBe("https://example.com/blog/edge-caching-mistakes");
    expect(entry.html).toContain("cache invalidation");
    expect(entry.excerpt).toContain("someone else's blog");
  });

  it("handles a link with no commentary at all", async () => {
    const res = await SELF.fetch("https://example.com/api/entries/sqlite-at-the-edge");
    const entry = await res.json<{ html: string; markdown: string; excerpt: string }>();

    expect(res.status).toBe(200);
    expect(entry.html).toBe("");
    expect(entry.markdown).toBe("");
    expect(entry.excerpt).toBe("");
  });
});

describe("GET /api/entries/:slug", () => {
  it("returns a full post with rendered HTML", async () => {
    const res = await SELF.fetch("https://example.com/api/entries/hello-world");
    const post = await res.json<{ kind: string; title: string; html: string; markdown: string }>();

    expect(res.status).toBe(200);
    expect(post.kind).toBe("post");
    expect(post.title).toBe("Hello, world");
    expect(post.html).toContain("<h2");
    expect(post.markdown).toContain("content pipeline");
  });

  it("does not leak the source file path", async () => {
    const res = await SELF.fetch("https://example.com/api/entries/hello-world");
    expect(await res.json()).not.toHaveProperty("sourceFile");
  });

  it("404s unknown slugs and drafts", async () => {
    for (const slug of ["does-not-exist", "draft-example"]) {
      const res = await SELF.fetch(`https://example.com/api/entries/${slug}`);
      expect(res.status).toBe(404);
    }
  });
});

describe("preview entries", () => {
  const PREVIEW = "https://example.com/api/entries/preview-example";

  it("is fetchable by slug and reports its status", async () => {
    const res = await SELF.fetch(PREVIEW);
    const entry = await res.json<{ status: string; title: string; html: string }>();

    expect(res.status).toBe(200);
    expect(entry.status).toBe("preview");
    expect(entry.title).toBe("A post you can preview but not find");
    // The front end gets the real rendered body, so the preview looks real.
    expect(entry.html).toContain("<p>");
  });

  it("tells crawlers and caches to leave it alone", async () => {
    const res = await SELF.fetch(PREVIEW);

    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("sets no such headers on a published post", async () => {
    const res = await SELF.fetch("https://example.com/api/entries/hello-world");

    expect(res.headers.get("x-robots-tag")).toBeNull();
    expect(res.headers.get("cache-control")).not.toBe("private, no-store");
  });

  it("appears in no listing, whatever the filter", async () => {
    for (const path of [
      "/api/entries?limit=100",
      "/api/entries?kind=post&limit=100",
      "/api/entries?kind=all&limit=100",
      "/api/posts?limit=100",
      "/api/entries?tag=meta&limit=100",
      "/api/entries?q=preview&limit=100",
    ]) {
      const body = await list(path);
      expect(body.entries.map((e) => e.slug), path).not.toContain("preview-example");
    }
  });

  it("is not counted in tags", async () => {
    const res = await SELF.fetch("https://example.com/api/tags");
    const { tags } = await res.json<{ tags: { tag: string; count: number }[] }>();

    // hello-world is the only published entry tagged "meta".
    expect(tags.find((t) => t.tag === "meta")?.count).toBe(1);
  });

  it("never surfaces as a related entry on a published post", async () => {
    const res = await SELF.fetch("https://example.com/api/entries/hello-world/related?limit=10");
    const { entries } = await res.json<{ entries: Summary[] }>();

    expect(entries.map((e) => e.slug)).not.toContain("preview-example");
  });

  it("gets related entries of its own, drawn from published ones", async () => {
    const res = await SELF.fetch(`${PREVIEW}/related?limit=10`);
    const { entries } = await res.json<{ entries: Summary[] }>();

    expect(res.status).toBe(200);
    expect(entries.map((e) => e.slug)).toContain("hello-world");
    expect(entries.every((e) => e.status === "published")).toBe(true);
  });

  it("stays out of the feed and the sitemap", async () => {
    const feed = await (await SELF.fetch("https://example.com/feed.xml")).text();
    const sitemap = await (await SELF.fetch("https://example.com/sitemap.xml")).text();

    expect(feed).not.toContain("preview-example");
    expect(feed).not.toContain("A post you can preview but not find");
    expect(sitemap).not.toContain("preview-example");
  });

  it("refuses view counting until it's published", async () => {
    const res = await SELF.fetch(`${PREVIEW}/views`, { method: "POST" });

    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toContain("preview");

    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM post_views",
    ).all<{ n: number }>();
    expect(results[0]!.n).toBe(0);
  });

  it("omits views from its detail response even when asked", async () => {
    const res = await SELF.fetch(`${PREVIEW}?views=1`);
    expect(await res.json()).not.toHaveProperty("views");
  });
});

describe("view counts", () => {
  it("starts at zero and increments on POST", async () => {
    const zero = await SELF.fetch("https://example.com/api/entries/hello-world/views");
    expect(await zero.json()).toEqual({ slug: "hello-world", views: 0 });

    for (const expected of [1, 2, 3]) {
      const res = await SELF.fetch("https://example.com/api/entries/hello-world/views", {
        method: "POST",
      });
      expect(await res.json<{ views: number }>()).toEqual({ slug: "hello-world", views: expected });
    }
  });

  it("rejects view counting on an external link with 400, not 404", async () => {
    const res = await SELF.fetch("https://example.com/api/entries/sqlite-at-the-edge/views", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toContain("external link");

    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM post_views",
    ).all<{ n: number }>();
    expect(results[0]!.n).toBe(0);
  });

  it("404s view counting on slugs that aren't published", async () => {
    const res = await SELF.fetch("https://example.com/api/entries/draft-example/views", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("attaches counts to posts in the timeline, leaving links untouched", async () => {
    await SELF.fetch("https://example.com/api/entries/hello-world/views", { method: "POST" });

    const body = await list("/api/entries?views=1");
    const posts = body.entries.filter((e) => e.kind === "post");
    const links = body.entries.filter((e) => e.kind === "link");

    expect(body.entries.find((e) => e.slug === "hello-world")?.views).toBe(1);
    expect(posts.every((e) => typeof e.views === "number")).toBe(true);
    expect(links.every((e) => e.views === undefined)).toBe(true);
  });

  it("ranks popular posts and drops unknown slugs", async () => {
    await SELF.fetch("https://example.com/api/entries/why-workers/views", { method: "POST" });
    await SELF.fetch("https://example.com/api/entries/hello-world/views", { method: "POST" });
    await SELF.fetch("https://example.com/api/entries/hello-world/views", { method: "POST" });

    // A stale row whose Markdown file no longer exists.
    await env.DB.prepare("INSERT INTO post_views (slug, views) VALUES ('deleted-post', 999)").run();

    const res = await SELF.fetch("https://example.com/api/popular");
    const body = await res.json<{ entries: Summary[] }>();

    expect(body.entries.map((e) => e.slug)).not.toContain("deleted-post");
    expect(body.entries[0]).toMatchObject({ slug: "hello-world", views: 2 });
  });
});

describe("tags and related entries", () => {
  it("counts tags across both kinds, most-used first", async () => {
    const res = await SELF.fetch("https://example.com/api/tags");
    const { tags } = await res.json<{ tags: { tag: string; count: number }[] }>();

    const counts = tags.map((t) => t.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(tags.find((t) => t.tag === "cloudflare")?.count).toBe(4);
    // The draft's tags must not be counted.
    expect(tags.find((t) => t.tag === "meta")?.count).toBe(1);
  });

  it("relates posts to links through shared tags", async () => {
    const res = await SELF.fetch("https://example.com/api/entries/why-workers/related?limit=10");
    const { entries } = await res.json<{ entries: Summary[] }>();

    expect(entries.map((e) => e.slug)).toContain("guest-post-on-edge-caching");
    expect(entries.map((e) => e.slug)).not.toContain("why-workers");
  });

  it("404s related for unknown slugs", async () => {
    const res = await SELF.fetch("https://example.com/api/entries/nope/related");
    expect(res.status).toBe(404);
  });
});

describe("feeds", () => {
  it("points link items at the external URL but keeps a local guid", async () => {
    const xml = await (await SELF.fetch("https://example.com/feed.xml")).text();

    expect(xml).toContain("<link>https://example.com/blog/edge-caching-mistakes</link>");
    expect(xml).toContain("What I got wrong about edge caching (Example Engineering)");
    // guid stays on this domain so readers keep a stable identity for the item.
    expect(xml).toContain(
      '<guid isPermaLink="false">https://example.com/posts/guest-post-on-edge-caching</guid>',
    );
  });

  it("points post items at this site and excludes drafts", async () => {
    const xml = await (await SELF.fetch("https://example.com/feed.xml")).text();

    expect(xml).toContain("<link>https://example.com/posts/hello-world</link>");
    expect(xml).not.toContain("Something I haven't finished");
  });

  it("keeps external links out of the sitemap", async () => {
    const res = await SELF.fetch("https://example.com/sitemap.xml");
    const xml = await res.text();

    expect(res.status).toBe(200);
    expect(xml).toContain("/posts/hello-world");
    expect(xml).not.toContain("example.org");
    expect(xml).not.toContain("guest-post-on-edge-caching");
  });
});
