import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { resolveSite, resolveSocials, type BlogConfig } from "../src/config";

/** A config with everything filled in, to vary one field at a time. */
function configWith(overrides: Partial<BlogConfig> = {}): BlogConfig {
  return {
    title: "Test Blog",
    description: "Testing",
    author: { name: "Someone", tagline: "t", bio: ["b"], avatar: "/a.svg", avatarAlt: "alt" },
    socials: {},
    nav: [{ label: "Writing", href: "/" }],
    ...overrides,
  };
}

describe("social links", () => {
  it("builds URLs from bare handles", () => {
    const links = resolveSocials(
      configWith({ socials: { github: "octocat", x: "jack", email: "me@example.com" } }),
    );

    expect(links.find((l) => l.label === "GitHub")?.href).toBe("https://github.com/octocat");
    expect(links.find((l) => l.label === "X")?.href).toBe("https://x.com/jack");
    expect(links.find((l) => l.label === "Email")?.href).toBe("mailto:me@example.com");
  });

  it("takes a full URL as-is instead of treating it as a handle", () => {
    const links = resolveSocials(
      configWith({ socials: { github: "https://github.enterprise.internal/me" } }),
    );

    expect(links.find((l) => l.label === "GitHub")?.href).toBe(
      "https://github.enterprise.internal/me",
    );
  });

  it("tolerates a leading @ on handles", () => {
    const links = resolveSocials(configWith({ socials: { x: "@jack", bluesky: "@me.bsky.social" } }));

    expect(links.find((l) => l.label === "X")?.href).toBe("https://x.com/jack");
    expect(links.find((l) => l.label === "Bluesky")?.href).toBe(
      "https://bsky.app/profile/me.bsky.social",
    );
  });

  it("splits a mastodon handle across its instance", () => {
    const links = resolveSocials(configWith({ socials: { mastodon: "@me@fosstodon.org" } }));

    expect(links.find((l) => l.label === "Mastodon")?.href).toBe("https://fosstodon.org/@me");
  });

  // The whole point of the exercise: a half-filled config renders cleanly.
  it("omits blank, whitespace-only, and missing entries", () => {
    const links = resolveSocials(
      configWith({
        socials: { github: "octocat", x: "", linkedin: "   ", youtube: undefined },
        showRssLink: false,
      }),
    );

    expect(links.map((l) => l.label)).toEqual(["GitHub"]);
  });

  it("renders nothing at all when every social is blank", () => {
    const links = resolveSocials(
      configWith({ socials: { github: "", x: "", email: "" }, showRssLink: false }),
    );

    expect(links).toEqual([]);
  });

  it("orders links by the registry, not by how the config was written", () => {
    const a = resolveSocials(configWith({ socials: { email: "a@b.c", github: "octocat" } }));
    const b = resolveSocials(configWith({ socials: { github: "octocat", email: "a@b.c" } }));

    expect(a.map((l) => l.label)).toEqual(b.map((l) => l.label));
    expect(a.map((l) => l.label)).toEqual(["GitHub", "Email", "RSS"]);
  });

  it("includes RSS by default and drops it on request", () => {
    expect(resolveSocials(configWith()).map((l) => l.label)).toEqual(["RSS"]);
    expect(resolveSocials(configWith({ showRssLink: false }))).toEqual([]);
  });

  it("supports custom links, skipping incomplete ones", () => {
    const links = resolveSocials(
      configWith({
        showRssLink: false,
        extraSocials: [
          { label: "Ko-fi", href: "https://ko-fi.com/me" },
          { label: "Nothing", href: "" },
          { label: "", href: "https://example.com" },
        ],
      }),
    );

    expect(links.map((l) => l.label)).toEqual(["Ko-fi"]);
    // A custom link with no icon still gets one, rather than rendering blank.
    expect(links[0]!.icon.length).toBeGreaterThan(0);
  });
});

describe("site URL resolution", () => {
  it("derives the origin from the request when url is empty", () => {
    expect(resolveSite(configWith({ url: "" }), "https://blog.example.com/posts/x").url).toBe(
      "https://blog.example.com",
    );
    expect(resolveSite(configWith(), "http://localhost:8787/").url).toBe("http://localhost:8787");
  });

  it("prefers a configured canonical origin, without a trailing slash", () => {
    const site = resolveSite(
      configWith({ url: "https://canonical.example/" }),
      "https://preview.workers.dev/",
    );

    expect(site.url).toBe("https://canonical.example");
  });

  it("defaults the language to en", () => {
    expect(resolveSite(configWith(), "https://x.test/").language).toBe("en");
    expect(resolveSite(configWith({ language: "fr" }), "https://x.test/").language).toBe("fr");
  });
});

describe("config reaches the rendered site", () => {
  it("derives absolute URLs from the host actually serving the request", async () => {
    const xml = await (await SELF.fetch("https://blog.test/feed.xml")).text();

    expect(xml).toContain("<link>https://blog.test</link>");
    expect(xml).toContain("https://blog.test/posts/hello-world");
    // The old hardcoded SITE_URL is gone for good.
    expect(xml).not.toContain("localhost");
  });

  it("uses the same host for the sitemap and the OpenAPI server", async () => {
    const sitemap = await (await SELF.fetch("https://blog.test/sitemap.xml")).text();
    const spec = await (
      await SELF.fetch("https://blog.test/openapi.json")
    ).json<{ servers: { url: string }[] }>();

    expect(sitemap).toContain("https://blog.test/posts/hello-world");
    expect(spec.servers[0]!.url).toBe("https://blog.test");
  });

  it("renders only the socials that are filled in", async () => {
    const body = await (await SELF.fetch("https://example.com/")).text();
    const footer = body.slice(body.indexOf('class="socials"'));

    // blog.config.ts ships with github set and the rest blank.
    expect(footer).toContain("github.com");
    expect(footer).not.toContain("linkedin.com");
    expect(footer).not.toContain("x.com");
    expect(footer).not.toContain("mailto:");
  });

  it("puts the configured author on the about page", async () => {
    const body = await (await SELF.fetch("https://example.com/about")).text();

    expect(body).toContain("Ryan");
    expect(body).toContain("placeholder photo");
  });
});
