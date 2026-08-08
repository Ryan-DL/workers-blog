import { SELF, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applySchema, resetViews } from "./helpers";

beforeAll(applySchema);
beforeEach(resetViews);

describe("meta", () => {
  it("serves an API index at the root", async () => {
    const res = await SELF.fetch("https://example.com/");
    expect(res.status).toBe(200);

    const body = await res.json<{ endpoints: string[] }>();
    expect(body.endpoints.length).toBeGreaterThan(0);
  });

  it("reports health with a post count", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    const body = await res.json<{ ok: boolean; posts: number }>();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.posts).toBeGreaterThan(0);
  });

  it("404s unknown routes as JSON", async () => {
    const res = await SELF.fetch("https://example.com/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Not found" });
  });
});

describe("GET /api/posts", () => {
  it("returns published posts newest-first and omits bodies", async () => {
    const res = await SELF.fetch("https://example.com/api/posts");
    const body = await res.json<{ posts: any[]; total: number }>();

    expect(res.status).toBe(200);
    expect(body.posts.length).toBe(body.total);

    const dates = body.posts.map((p) => p.date);
    expect([...dates].sort().reverse()).toEqual(dates);

    // List endpoints are summaries.
    expect(body.posts[0]).not.toHaveProperty("html");
    expect(body.posts[0]).not.toHaveProperty("markdown");
  });

  it("excludes drafts", async () => {
    const res = await SELF.fetch("https://example.com/api/posts?limit=100");
    const body = await res.json<{ posts: { slug: string }[] }>();

    expect(body.posts.map((p) => p.slug)).not.toContain("draft-example");
  });

  it("filters by tag, case-insensitively", async () => {
    const res = await SELF.fetch("https://example.com/api/posts?tag=CLOUDFLARE");
    const body = await res.json<{ posts: { tags: string[] }[]; total: number }>();

    expect(body.total).toBeGreaterThan(0);
    for (const post of body.posts) {
      expect(post.tags.map((t) => t.toLowerCase())).toContain("cloudflare");
    }
  });

  it("searches post bodies", async () => {
    const res = await SELF.fetch("https://example.com/api/posts?q=frontmatter");
    const body = await res.json<{ total: number }>();

    expect(body.total).toBeGreaterThan(0);
  });

  it("paginates", async () => {
    const first = await (
      await SELF.fetch("https://example.com/api/posts?limit=1")
    ).json<{ posts: { slug: string }[]; total: number }>();
    const second = await (
      await SELF.fetch("https://example.com/api/posts?limit=1&offset=1")
    ).json<{ posts: { slug: string }[] }>();

    expect(first.posts).toHaveLength(1);
    expect(second.posts).toHaveLength(1);
    expect(first.posts[0]!.slug).not.toBe(second.posts[0]!.slug);
  });

  it("ignores nonsense pagination params instead of erroring", async () => {
    const res = await SELF.fetch("https://example.com/api/posts?limit=abc&offset=-5");
    expect(res.status).toBe(200);
    expect((await res.json<{ limit: number; offset: number }>()).offset).toBe(0);
  });

  it("caps limit at 100", async () => {
    const res = await SELF.fetch("https://example.com/api/posts?limit=9999");
    expect((await res.json<{ limit: number }>()).limit).toBe(100);
  });
});

describe("GET /api/posts/:slug", () => {
  it("returns the full post with rendered HTML", async () => {
    const res = await SELF.fetch("https://example.com/api/posts/hello-world");
    const post = await res.json<{ title: string; html: string; markdown: string }>();

    expect(res.status).toBe(200);
    expect(post.title).toBe("Hello, world");
    expect(post.html).toContain("<h2");
    expect(post.markdown).toContain("content pipeline");
  });

  it("does not leak the source file path", async () => {
    const res = await SELF.fetch("https://example.com/api/posts/hello-world");
    expect(await res.json()).not.toHaveProperty("sourceFile");
  });

  it("404s unknown slugs", async () => {
    const res = await SELF.fetch("https://example.com/api/posts/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("404s drafts", async () => {
    const res = await SELF.fetch("https://example.com/api/posts/draft-example");
    expect(res.status).toBe(404);
  });
});

describe("view counts", () => {
  it("starts at zero", async () => {
    const res = await SELF.fetch("https://example.com/api/posts/hello-world/views");
    expect(await res.json()).toEqual({ slug: "hello-world", views: 0 });
  });

  it("increments on POST", async () => {
    for (const expected of [1, 2, 3]) {
      const res = await SELF.fetch("https://example.com/api/posts/hello-world/views", {
        method: "POST",
      });
      expect(await res.json<{ views: number }>()).toEqual({
        slug: "hello-world",
        views: expected,
      });
    }

    const read = await SELF.fetch("https://example.com/api/posts/hello-world/views");
    expect((await read.json<{ views: number }>()).views).toBe(3);
  });

  it("refuses to record views for slugs that aren't published", async () => {
    const res = await SELF.fetch("https://example.com/api/posts/draft-example/views", {
      method: "POST",
    });
    expect(res.status).toBe(404);

    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM post_views",
    ).all<{ n: number }>();
    expect(results[0]!.n).toBe(0);
  });

  it("attaches counts to the list endpoint on request", async () => {
    await SELF.fetch("https://example.com/api/posts/hello-world/views", { method: "POST" });

    const res = await SELF.fetch("https://example.com/api/posts?views=1");
    const body = await res.json<{ posts: { slug: string; views: number }[] }>();

    const hello = body.posts.find((p) => p.slug === "hello-world");
    expect(hello?.views).toBe(1);
    // Unread posts report zero rather than going missing.
    expect(body.posts.every((p) => typeof p.views === "number")).toBe(true);
  });

  it("ranks popular posts and drops unknown slugs", async () => {
    await SELF.fetch("https://example.com/api/posts/why-workers/views", {
      method: "POST",
    });
    await SELF.fetch("https://example.com/api/posts/hello-world/views", { method: "POST" });
    await SELF.fetch("https://example.com/api/posts/hello-world/views", { method: "POST" });

    // A stale row whose Markdown file no longer exists.
    await env.DB.prepare("INSERT INTO post_views (slug, views) VALUES ('deleted-post', 999)").run();

    const res = await SELF.fetch("https://example.com/api/popular");
    const body = await res.json<{ posts: { slug: string; views: number }[] }>();

    expect(body.posts.map((p) => p.slug)).not.toContain("deleted-post");
    expect(body.posts[0]!.slug).toBe("hello-world");
    expect(body.posts[0]!.views).toBe(2);
  });
});

describe("tags and related posts", () => {
  it("counts tags, most-used first", async () => {
    const res = await SELF.fetch("https://example.com/api/tags");
    const { tags } = await res.json<{ tags: { tag: string; count: number }[] }>();

    expect(tags.length).toBeGreaterThan(0);
    const counts = tags.map((t) => t.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    // The draft's tags must not be counted.
    expect(tags.find((t) => t.tag === "meta")?.count).toBe(1);
  });

  it("finds posts sharing tags", async () => {
    const res = await SELF.fetch("https://example.com/api/posts/hello-world/related");
    const { posts } = await res.json<{ posts: { slug: string }[] }>();

    expect(posts.map((p) => p.slug)).toContain("why-workers");
    expect(posts.map((p) => p.slug)).not.toContain("hello-world");
  });

  it("404s related for unknown slugs", async () => {
    const res = await SELF.fetch("https://example.com/api/posts/nope/related");
    expect(res.status).toBe(404);
  });
});

describe("feeds", () => {
  it("serves valid-looking RSS without drafts", async () => {
    const res = await SELF.fetch("https://example.com/feed.xml");
    const xml = await res.text();

    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    expect(xml).toContain("<rss version=\"2.0\"");
    expect(xml).toContain("<title>Hello, world</title>");
    expect(xml).not.toContain("Something I haven't finished");
  });

  it("serves a sitemap", async () => {
    const res = await SELF.fetch("https://example.com/sitemap.xml");
    const xml = await res.text();

    expect(res.status).toBe(200);
    expect(xml).toContain("/posts/hello-world");
  });
});
