/**
 * OpenAPI 3.1 description of the public API, served at /openapi.json and
 * rendered by Swagger UI at /docs.
 *
 * Hand-written rather than generated: the surface is small enough that a
 * generator would add more machinery than it saves. Keep it in step with
 * src/index.ts — the contract tests in test/openapi.spec.ts check that every
 * documented path is one the Worker actually serves.
 */

import type { Site } from "./config";

const ENTRY_BASE_PROPS = {
  slug: { type: "string", examples: ["hello-world"] },
  title: { type: "string", examples: ["Hello, world"] },
  date: { type: "string", format: "date-time" },
  updated: { type: ["string", "null"], format: "date-time" },
  status: {
    type: "string",
    enum: ["published", "preview"],
    description:
      "`draft` entries are never served, so it never appears here. A `preview` entry is only ever returned from the single-entry route.",
  },
  tags: { type: "array", items: { type: "string" } },
  author: { type: ["string", "null"] },
  excerpt: { type: "string" },
} as const;

export function openApiSpec(site: Site): Record<string, unknown> {


  return {
    openapi: "3.1.0",
    info: {
      title: `${site.title} API`,
      version: "1.0.0",
      description: [
        "Read-only JSON API for the blog.",
        "",
        "The blog is one chronological timeline of **entries**, of two kinds:",
        "",
        "- `post` — written and hosted here; carries `markdown`, `html`, and `readingMinutes`.",
        "- `link` — published on another site; carries `url` and `site`, and its body is commentary.",
        "",
        "Entries also carry a `status`. `published` entries appear everywhere;",
        "`preview` entries are fetchable by slug but appear in no list, feed, tag",
        "count, or sitemap; `draft` entries are never served at all.",
        "",
        "No authentication. The only write operation is incrementing a view count.",
      ].join("\n"),
      license: { name: "MIT" },
    },
    servers: [{ url: site.url, description: "This deployment" }],
    tags: [
      { name: "Entries", description: "The timeline of posts and links" },
      { name: "Views", description: "View counts, backed by D1" },
      { name: "Discovery", description: "Tags, feeds, and service metadata" },
    ],
    paths: {
      "/api": {
        get: {
          tags: ["Discovery"],
          summary: "API index",
          description: "Lists the available endpoints and explains the entry kinds and statuses.",
          responses: {
            "200": {
              description: "Index",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/health": {
        get: {
          tags: ["Discovery"],
          summary: "Health check",
          responses: {
            "200": {
              description: "Service is up",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } },
            },
          },
        },
      },
      "/api/entries": {
        get: {
          tags: ["Entries"],
          summary: "List the timeline",
          description:
            "Published posts and links together, newest first. Drafts and previews are excluded.",
          parameters: [
            { $ref: "#/components/parameters/Kind" },
            { $ref: "#/components/parameters/Tag" },
            { $ref: "#/components/parameters/Query" },
            { $ref: "#/components/parameters/Limit" },
            { $ref: "#/components/parameters/Offset" },
            { $ref: "#/components/parameters/WithViews" },
          ],
          responses: {
            "200": { $ref: "#/components/responses/EntryList" },
            "400": { $ref: "#/components/responses/BadRequest" },
          },
        },
      },
      "/api/posts": {
        get: {
          tags: ["Entries"],
          summary: "List posts hosted here",
          description: "Identical to `/api/entries` pinned to `kind=post`. Any `kind` param is ignored.",
          parameters: [
            { $ref: "#/components/parameters/Tag" },
            { $ref: "#/components/parameters/Query" },
            { $ref: "#/components/parameters/Limit" },
            { $ref: "#/components/parameters/Offset" },
            { $ref: "#/components/parameters/WithViews" },
          ],
          responses: { "200": { $ref: "#/components/responses/EntryList" } },
        },
      },
      "/api/links": {
        get: {
          tags: ["Entries"],
          summary: "List links to posts published elsewhere",
          description: "Identical to `/api/entries` pinned to `kind=link`. Any `kind` param is ignored.",
          parameters: [
            { $ref: "#/components/parameters/Tag" },
            { $ref: "#/components/parameters/Query" },
            { $ref: "#/components/parameters/Limit" },
            { $ref: "#/components/parameters/Offset" },
          ],
          responses: { "200": { $ref: "#/components/responses/EntryList" } },
        },
      },
      "/api/entries/{slug}": {
        get: {
          tags: ["Entries"],
          summary: "Fetch one entry in full",
          description:
            "Returns the body as both `markdown` and rendered `html`. This is the only route that will return a `preview` entry; such responses carry `X-Robots-Tag: noindex, nofollow`.",
          parameters: [
            { $ref: "#/components/parameters/Slug" },
            { $ref: "#/components/parameters/WithViews" },
          ],
          responses: {
            "200": {
              description: "The entry",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Entry" } } },
            },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/api/entries/{slug}/views": {
        get: {
          tags: ["Views"],
          summary: "Read a view count",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": { $ref: "#/components/responses/Views" },
            "400": { $ref: "#/components/responses/NotCountable" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
        post: {
          tags: ["Views"],
          summary: "Record a view",
          description:
            "Atomically increments and returns the new count. Published posts only — an external link or a preview returns 400, since the entry exists but the operation doesn't apply to it.",
          parameters: [{ $ref: "#/components/parameters/Slug" }],
          responses: {
            "200": { $ref: "#/components/responses/Views" },
            "400": { $ref: "#/components/responses/NotCountable" },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/api/popular": {
        get: {
          tags: ["Views"],
          summary: "Most-viewed posts",
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 0, maximum: 100, default: 5 },
            },
          ],
          responses: {
            "200": {
              description: "Ranked posts, each with its view count",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["entries"],
                    properties: {
                      entries: {
                        type: "array",
                        items: {
                          allOf: [
                            { $ref: "#/components/schemas/EntrySummary" },
                            {
                              type: "object",
                              required: ["views"],
                              properties: { views: { type: "integer" } },
                            },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/tags": {
        get: {
          tags: ["Discovery"],
          summary: "Tags in use, with counts",
          description: "Most-used first, ties broken alphabetically. Counts published entries only.",
          responses: {
            "200": {
              description: "Tags",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["tags"],
                    properties: {
                      tags: { type: "array", items: { $ref: "#/components/schemas/TagCount" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/feed.xml": {
        get: {
          tags: ["Discovery"],
          summary: "RSS 2.0 feed",
          description:
            "Covers the whole published timeline with full post HTML. A link item's `<link>` points at the external URL while its `<guid>` stays on this domain.",
          responses: {
            "200": {
              description: "RSS document",
              content: { "application/rss+xml": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/sitemap.xml": {
        get: {
          tags: ["Discovery"],
          summary: "Sitemap",
          description: "Posts hosted here only — external links are deliberately absent.",
          responses: {
            "200": {
              description: "Sitemap document",
              content: { "application/xml": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/openapi.json": {
        get: {
          tags: ["Discovery"],
          summary: "This document",
          responses: {
            "200": {
              description: "OpenAPI document",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
    },
    components: {
      parameters: {
        Slug: {
          name: "slug",
          in: "path",
          required: true,
          schema: { type: "string" },
          examples: { post: { value: "hello-world" } },
        },
        Kind: {
          name: "kind",
          in: "query",
          description:
            "Narrow to one kind. Anything other than these three values is a 400 rather than being ignored.",
          schema: { type: "string", enum: ["post", "link", "all"], default: "all" },
        },
        Tag: {
          name: "tag",
          in: "query",
          description: "Exact tag match, case-insensitive.",
          schema: { type: "string" },
        },
        Query: {
          name: "q",
          in: "query",
          description: "Case-insensitive substring match over title, excerpt, and body.",
          schema: { type: "string" },
        },
        Limit: {
          name: "limit",
          in: "query",
          description: "Capped at 100. A malformed value falls back to the default.",
          schema: { type: "integer", minimum: 0, maximum: 100, default: 20 },
        },
        Offset: {
          name: "offset",
          in: "query",
          description: "A malformed value falls back to 0.",
          schema: { type: "integer", minimum: 0, default: 0 },
        },
        WithViews: {
          name: "views",
          in: "query",
          description:
            "Set to `1` or `true` to attach view counts. Only posts gain a `views` field; links are left without it.",
          schema: { type: "string", enum: ["1", "true"] },
        },
      },
      responses: {
        EntryList: {
          description: "A page of entries",
          content: { "application/json": { schema: { $ref: "#/components/schemas/EntryList" } } },
        },
        Views: {
          description: "The view count",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Views" } } },
        },
        BadRequest: {
          description: "A parameter was understood but invalid",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        NotCountable: {
          description: "The entry exists but has no view count (an external link, or a preview)",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        NotFound: {
          description: "No published or preview entry with that slug",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: { error: { type: "string" } },
        },
        Health: {
          type: "object",
          required: ["ok", "entries", "posts", "links", "byStatus", "timestamp"],
          properties: {
            ok: { type: "boolean" },
            entries: { type: "integer", description: "Published entries" },
            posts: { type: "integer" },
            links: { type: "integer" },
            byStatus: {
              type: "object",
              description: "Counts across every entry, including those never served.",
              properties: {
                published: { type: "integer" },
                preview: { type: "integer" },
                draft: { type: "integer" },
              },
            },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        TagCount: {
          type: "object",
          required: ["tag", "count"],
          properties: { tag: { type: "string" }, count: { type: "integer" } },
        },
        Views: {
          type: "object",
          required: ["slug", "views"],
          properties: { slug: { type: "string" }, views: { type: "integer", minimum: 0 } },
        },
        PostSummary: {
          type: "object",
          title: "PostSummary",
          required: [...Object.keys(ENTRY_BASE_PROPS), "kind", "readingMinutes"],
          properties: {
            kind: { type: "string", const: "post" },
            ...ENTRY_BASE_PROPS,
            readingMinutes: { type: "integer", minimum: 1 },
            views: {
              type: "integer",
              description: "Only present when the request asked for view counts.",
            },
          },
        },
        LinkSummary: {
          type: "object",
          title: "LinkSummary",
          required: [...Object.keys(ENTRY_BASE_PROPS), "kind", "url", "site"],
          properties: {
            kind: { type: "string", const: "link" },
            ...ENTRY_BASE_PROPS,
            url: { type: "string", format: "uri", description: "Absolute URL of the external post." },
            site: {
              type: "string",
              description: "Human-readable source. Defaults to the URL host with `www.` stripped.",
            },
          },
        },
        EntrySummary: {
          oneOf: [
            { $ref: "#/components/schemas/PostSummary" },
            { $ref: "#/components/schemas/LinkSummary" },
          ],
          discriminator: {
            propertyName: "kind",
            mapping: {
              post: "#/components/schemas/PostSummary",
              link: "#/components/schemas/LinkSummary",
            },
          },
        },
        Entry: {
          description: "A full entry: a summary plus its body.",
          allOf: [
            { $ref: "#/components/schemas/EntrySummary" },
            {
              type: "object",
              required: ["markdown", "html"],
              properties: {
                markdown: { type: "string", description: "Body with frontmatter stripped." },
                html: {
                  type: "string",
                  description: "Rendered at build time. Empty for a link with no commentary.",
                },
              },
            },
          ],
        },
        EntryList: {
          type: "object",
          required: ["entries", "total", "limit", "offset"],
          properties: {
            entries: { type: "array", items: { $ref: "#/components/schemas/EntrySummary" } },
            total: { type: "integer", description: "Matches before pagination." },
            limit: { type: "integer" },
            offset: { type: "integer" },
          },
        },
      },
    },
  };
}
