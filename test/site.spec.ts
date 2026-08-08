import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const page = async (path: string) => {
  const res = await SELF.fetch(`https://example.com${path}`);
  return { res, body: await res.text() };
};

describe("home page", () => {
  it("renders HTML, not the API index", async () => {
    const { res, body } = await page("/");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<!doctype html>");
  });

  it("lists published posts and links together", async () => {
    const { body } = await page("/");

    expect(body).toContain("Hello, world");
    expect(body).toContain("Why run a blog on Workers");
    expect(body).toContain("What I got wrong about edge caching");
  });

  it("points posts at this site and links off-site", async () => {
    const { body } = await page("/");

    expect(body).toContain('href="/posts/hello-world"');
    expect(body).toContain('href="https://example.com/blog/edge-caching-mistakes"');
    expect(body).toContain('rel="noopener"');
  });

  it("shows neither drafts nor previews", async () => {
    const { body } = await page("/");

    expect(body).not.toContain("Something I haven't finished");
    expect(body).not.toContain("A post you can preview but not find");
  });
});

describe("theme", () => {
  it("inlines a pre-paint script so there's no flash", async () => {
    const { body } = await page("/");

    // Must be inline in <head> and before the stylesheet's effects matter.
    expect(body).toContain('localStorage.getItem("theme")');
    expect(body).toContain("prefers-color-scheme: light");
    expect(body.indexOf("localStorage.getItem")).toBeLessThan(body.indexOf("</head>"));
  });

  it("falls back to dark, not light", async () => {
    const { body } = await page("/");

    // The bootstrap picks light only when the browser explicitly asks for it;
    // every other path, including a thrown error, lands on dark.
    expect(body).toContain('matches?"light":"dark"');
    expect(body).toContain('catch(e){document.documentElement.dataset.theme="dark"}');
  });

  it("renders a toggle with both icons present", async () => {
    const { body } = await page("/");

    expect(body).toContain('class="theme-toggle"');
    expect(body).toContain("icon-sun");
    expect(body).toContain("icon-moon");
  });
});

describe("layout", () => {
  it("links the RSS feed for autodiscovery", async () => {
    const { body } = await page("/");

    expect(body).toContain('rel="alternate"');
    expect(body).toContain('type="application/rss+xml"');
    expect(body).toContain("/feed.xml");
  });

  it("renders only the socials that are configured", async () => {
    const { body } = await page("/");

    expect(body).toContain('class="socials"');
    expect(body).toContain("github.com");
    // Blank entries in blog.config.ts produce no icon at all.
    expect(body).not.toContain("mailto:");
    expect(body).not.toContain("linkedin.com");
  });

  it("sets a canonical URL and skip link", async () => {
    const { body } = await page("/about");

    expect(body).toContain('rel="canonical"');
    expect(body).toContain('class="skip-link"');
  });
});

describe("about page", () => {
  it("renders the placeholder portrait with dimensions and alt text", async () => {
    const { res, body } = await page("/about");

    expect(res.status).toBe(200);
    expect(body).toContain('src="/avatar.svg"');
    expect(body).toContain('width="96"');
    expect(body).toContain('height="96"');
    expect(body).toMatch(/alt="[^"]+"/);
  });

  it("marks the photo as a placeholder", async () => {
    const { body } = await page("/about");
    expect(body).toContain("placeholder photo");
  });
});

describe("post page", () => {
  it("renders the post body", async () => {
    const { res, body } = await page("/posts/hello-world");

    expect(res.status).toBe(200);
    expect(body).toContain("Hello, world");
    expect(body).toContain("How a post becomes an endpoint");
    expect(body).toContain('class="prose"');
  });

  it("marks the post for a view ping", async () => {
    const { body } = await page("/posts/hello-world");
    expect(body).toContain('data-view-slug="hello-world"');
  });

  it("shows related entries and tag links", async () => {
    const { body } = await page("/posts/why-workers");

    expect(body).toContain('class="related"');
    expect(body).toContain('href="/tags/cloudflare"');
  });

  it("gives a link entry a callout to the external site", async () => {
    const { res, body } = await page("/posts/guest-post-on-edge-caching");

    expect(res.status).toBe(200);
    expect(body).toContain('class="callout-link"');
    expect(body).toContain("https://example.com/blog/edge-caching-mistakes");
    // A link is read elsewhere, so it is never view-counted.
    expect(body).not.toContain("data-view-slug");
  });

  it("404s a draft with an HTML page", async () => {
    const { res, body } = await page("/posts/draft-example");

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("404");
  });

  it("404s unknown pages with HTML rather than JSON", async () => {
    const { res, body } = await page("/nope");

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("Back to writing");
  });
});

describe("preview page", () => {
  it("renders, banners itself, and blocks indexing", async () => {
    const { res, body } = await page("/posts/preview-example");

    expect(res.status).toBe(200);
    expect(body).toContain("A post you can preview but not find");
    expect(body).toContain("preview-banner");
    expect(body).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("is not view-counted", async () => {
    const { body } = await page("/posts/preview-example");
    expect(body).not.toContain("data-view-slug");
  });
});

describe("tag page", () => {
  it("lists entries for a tag", async () => {
    const { res, body } = await page("/tags/cloudflare");

    expect(res.status).toBe(200);
    expect(body).toContain("Hello, world");
    expect(body).toContain("What I got wrong about edge caching");
  });

  it("handles a tag with nothing in it", async () => {
    const { res, body } = await page("/tags/nonexistent");

    expect(res.status).toBe(200);
    expect(body).toContain("Nothing here");
  });
});

describe("escaping", () => {
  it("escapes interpolated content rather than injecting it raw", async () => {
    const { body } = await page("/tags/%3Cscript%3Ealert(1)%3C%2Fscript%3E");

    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("&lt;script&gt;");
  });
});
