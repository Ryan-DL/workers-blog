import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import blogConfig from "../blog.config";
import { resolveSocials } from "../src/config";

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
    expect(body).toContain('document.documentElement.dataset.theme=t');
    expect(body.indexOf("localStorage.getItem")).toBeLessThan(body.indexOf("</head>"));
  });

  it("defaults to dark, only flipping if the visitor chose light", async () => {
    const { body } = await page("/");

    // The design is dark. We only leave it when the visitor explicitly picks
    // light with the toggle — preferences and errors all land on dark.
    expect(body).toContain('if(t!=="light"&&t!=="dark"){t="dark"}');
    expect(body).toContain('catch(e){document.documentElement.dataset.theme="dark"}');
  });

  // These assert on data-* hooks rather than classes: the classes are Tailwind
  // utilities, and a test that fails when a button is restyled is testing the
  // wrong thing. public/theme.js queries the same attributes.
  it("renders a toggle with both icons present", async () => {
    const { body } = await page("/");

    expect(body).toContain("data-theme-toggle");
    expect(body).toContain('data-icon="sun"');
    expect(body).toContain('data-icon="moon"');
  });

  it("flips the icons from the [data-theme] attribute, not the OS", async () => {
    const { body } = await page("/");

    // The `light:` variant compiles against [data-theme="light"], so an
    // explicit choice beats prefers-color-scheme — which the media query in
    // src/styles.css alone could not do.
    expect(body).toContain("light:opacity-100");
    expect(body).toContain("light:opacity-0");
  });
});

describe("layout", () => {
  it("links the RSS feed for autodiscovery", async () => {
    const { body } = await page("/");

    expect(body).toContain('rel="alternate"');
    expect(body).toContain('type="application/rss+xml"');
    expect(body).toContain("/feed.xml");
  });

  it("links the compiled stylesheet", async () => {
    const { body } = await page("/");
    expect(body).toContain('<link rel="stylesheet" href="/styles.css" />');
  });

  it("renders only the socials that are configured", async () => {
    const { body } = await page("/");
    const start = body.indexOf("data-socials");
    const footer = body.slice(start, body.indexOf("</div>", start));

    expect(start).toBeGreaterThan(-1);
    // Read out of blog.config.ts rather than hardcoded, so filling the config
    // in with your own handles doesn't fail the suite.
    const expected = resolveSocials(blogConfig);
    for (const link of expected) expect(footer).toContain(`href="${link.href}"`);
    // One icon per configured link and no others — blank entries produce none.
    expect(footer.match(/<a\b/g) ?? []).toHaveLength(expected.length);
  });

  it("sets a canonical URL and skip link", async () => {
    const { body } = await page("/about");

    expect(body).toContain('rel="canonical"');
    expect(body).toContain('href="#main"');
    expect(body).toContain("Skip to content");
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
    // Rendered Markdown is wrapped for @tailwindcss/typography.
    expect(body).toContain('class="prose ');
  });


  it("shows recent entries and tag links", async () => {
    const { body } = await page("/posts/why-workers");

    expect(body).toContain("data-recent");
    expect(body).toContain("Recent");
    expect(body).toContain('href="/tags/cloudflare"');
  });

  it("leaves the entry being read out of its own Recent list", async () => {
    const { body } = await page("/posts/why-workers");
    const recent = body.slice(body.indexOf("data-recent"));

    expect(recent).not.toContain('href="/posts/why-workers"');
    expect(recent).toContain('href="/posts/hello-world"');
  });

  it("keeps previews and drafts out of Recent", async () => {
    // Candidates come from published entries only, so an unpublished post
    // can't reach the public via the foot of someone else's page.
    const { body } = await page("/posts/hello-world");
    const recent = body.slice(body.indexOf("data-recent"));

    expect(recent).not.toContain("preview-example");
    expect(recent).not.toContain("draft-example");
  });

  it("gives a link entry a callout to the external site", async () => {
    const { res, body } = await page("/posts/guest-post-on-edge-caching");

    expect(res.status).toBe(200);
    expect(body).toContain("data-callout");
    expect(body).toContain("https://example.com/blog/edge-caching-mistakes");
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
    expect(body).toContain("data-preview-banner");
    expect(body).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
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
