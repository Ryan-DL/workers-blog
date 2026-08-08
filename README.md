# blog-part2

A blog on Cloudflare Workers. Content is Markdown files in this repo; D1 holds
the mutable state (view counts). The site is server-rendered by the Worker, and
the same Worker exposes a JSON API with an OpenAPI spec.

## Make it yours

Everything that isn't a post lives in **`blog.config.ts`** at the repo root —
title, description, author, about-page copy, socials, and navigation. It's the
only file you need to edit.

```ts
export default {
  title: "blog-part2",
  description: "A blog on Cloudflare Workers",
  url: "",              // empty = derive from the request. See below.
  author: { name, tagline, bio: ["…"], avatar, avatarAlt },
  socials: {
    github: "Ryan-Dl",  // a bare handle…
    x: "",              // …or "" to leave it out entirely
    email: "",
  },
  nav: [{ label: "Writing", href: "/" }],
} satisfies BlogConfig;
```

**Socials take a handle or a full URL**, whichever you have. `github: "octocat"`
becomes `https://github.com/octocat`; `github: "https://git.internal/me"` is used
as-is. Mastodon handles split across their instance, and a leading `@` is fine
anywhere.

**Anything blank is omitted.** An empty string, whitespace, or a deleted line
means that icon never renders — so a half-filled config produces a clean footer
rather than links to profiles that don't exist. Blank the lot and the footer
renders nothing at all. Set `showRssLink: false` to drop the feed icon too.

Supported out of the box: `github`, `x`, `bluesky`, `mastodon`, `linkedin`,
`youtube`, `email`, `website`. For anything else, use `extraSocials`:

```ts
extraSocials: [{ label: "Ko-fi", href: "https://ko-fi.com/you" }],
```

`npm run typecheck` catches a mistyped key.

### About the `url` field

Leave it empty and every absolute URL — canonical tags, the RSS feed, the
sitemap, the OpenAPI server — is derived from the host serving the request. That
is correct on `localhost`, on `*.workers.dev`, and on your real domain, with
nothing to remember to change before deploying. Set it only to pin one canonical
origin when the site answers on several hostnames.

## The model

The blog is one chronological timeline of **entries**, of two kinds:

| `kind` | What it is | Lives in | Extra fields |
| --- | --- | --- | --- |
| `post` | Written and hosted here | `content/posts/*.md` | `readingMinutes` |
| `link` | Published on another site | `content/links/*.md` | `url`, `site` |

Every entry carries `kind`, so the front end branches on one field: render a
`post` as a permalink to your own page, and a `link` as a card pointing offsite.
Both kinds share `slug`, `title`, `date`, `updated`, `status`, `tags`,
`author`, `excerpt`, and a body. For a link the body is *commentary* — a
sentence or two about the piece — and may be empty; the real content is at
`url`.

## Publication status

Every entry also carries a `status`, which decides where it shows up:

| `status` | Listings, feeds, tags, sitemap | Fetchable at `/api/entries/:slug` |
| --- | --- | --- |
| `published` (default) | yes | yes |
| `preview` | **no** | **yes** |
| `draft` | no | no — 404 |

`preview` is the state for "not published, but I want to look at it". The front
end can render it exactly as it will appear once live, and you can send someone
the link — but it appears in no list, feed, tag count, related result, or
sitemap, so nobody stumbles onto it.

**A preview is unlisted, not protected.** Anyone who knows or guesses the slug
can read it. The API sets `X-Robots-Tag: noindex, nofollow` and
`Cache-Control: private, no-store` on preview responses, which keeps honest
crawlers and shared caches away, but it is not access control. Don't put
anything sensitive in one. (If you later want real protection, a token check on
the detail route is the place to add it.)

`status` comes back on every entry, and the site uses it: a preview page renders
a "Preview" banner, carries `<meta name="robots" content="noindex, nofollow">`,
and is excluded from view counting so a post doesn't launch with numbers from
you and your reviewers reloading it.

## Where data lives

| | Where | Changes |
| --- | --- | --- |
| Entry content | `content/**/*.md`, compiled into the Worker bundle | On deploy |
| View counts | D1 (`post_views`) | Every request |

`scripts/build-content.mjs` parses frontmatter and renders Markdown to HTML **at
build time**, in Node, and writes `src/generated/entries.ts`. So `gray-matter`
and `marked` never ship to the edge, cold starts don't parse anything, and a
malformed entry fails the build instead of a request.

## Getting started

```bash
npm install
npm run content:build          # compile content/ -> src/generated/entries.ts
npm run db:apply:local         # create post_views in the local D1
npm run dev                    # http://localhost:8787
```

`npm run dev`, `deploy`, `test`, and `typecheck` all run `content:build` first,
so the generated module is never stale.

## Writing a post

Drop a Markdown file in `content/posts/`. The filename sets the slug, with an
optional `YYYY-MM-DD-` prefix stripped: `2026-01-15-hello-world.md` → `hello-world`.

```markdown
---
title: Hello, world      # required
date: 2026-01-15         # required
status: preview          # optional — published (default) | preview | draft
tags: [meta, cloudflare] # optional
author: Ryan             # optional
excerpt: ...             # optional — derived from the body if omitted
slug: custom-slug        # optional — overrides the filename
updated: 2026-01-20      # optional
---

Body goes here.
```

`draft: true` and `preview: true` are shorthands for the matching `status`.
Setting both, or setting a `status` that contradicts a shorthand, fails the
build rather than picking a winner — guessing wrong there either leaks an
unfinished post or hides a finished one.

## Linking to a post you wrote elsewhere

Same idea, but in `content/links/` and with a required `url`:

```markdown
---
title: What I got wrong about edge caching   # required
date: 2026-02-20                             # required
url: https://example.com/blog/the-post       # required — absolute http(s)
site: Example Engineering                    # optional — defaults to the URL host
tags: [cloudflare]                           # optional
---

Optional commentary, shown next to the link.
```

`site` defaults to the hostname with `www.` stripped, so
`https://www.example.org/x` gives `example.org`.

The build fails, naming the file, on: a missing `title` or `date`, an
unparseable date, a link with no `url` or a non-absolute one, an unknown or
self-contradicting `status`, or a slug already used by another entry **of
either kind**.

## API

Everything returns `entries` — a mixed list unless you narrow it by kind.

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api` | Endpoint index |
| GET | `/api/health` | `{ ok, entries, posts, links, byStatus, timestamp }` |
| GET | `/api/entries` | The timeline. `?kind=&tag=&q=&limit=&offset=&views=` |
| GET | `/api/posts` | Alias for `?kind=post` |
| GET | `/api/links` | Alias for `?kind=link` |
| GET | `/api/entries/:slug` | Full entry incl. `markdown` and `html`; `?views=1` |
| GET | `/api/entries/:slug/related` | Entries sharing the most tags; `?limit=` |
| GET | `/api/entries/:slug/views` | Posts only |
| POST | `/api/entries/:slug/views` | Posts only; atomic increment |
| GET | `/api/tags` | Tags with counts across both kinds, most-used first |
| GET | `/api/popular` | Most-viewed posts; `?limit=` |
| GET | `/feed.xml` | RSS 2.0 over the whole timeline |
| GET | `/sitemap.xml` | Hosted posts only |
| GET | `/openapi.json` | OpenAPI 3.1 document; rendered at `/docs` |

Behaviour worth knowing:

- `kind` accepts `post`, `link`, or `all`. Anything else is a **400** — silently
  returning links to someone who asked for `kind=posts` would be a wrong answer,
  not a degraded one. Malformed *pagination* params do fall back to defaults.
- `limit` caps at 100.
- Drafts 404 everywhere. Previews 404 from nothing but appear in no listing —
  see [Publication status](#publication-status).
- View counting is for **published posts** only. On a link or a preview it
  returns **400** (the entry exists, the operation doesn't apply); on an
  unknown slug, 404. Preview reads are deliberately not counted, so a post
  doesn't launch with inflated numbers. `?views=1` on the timeline attaches
  `views` to posts and leaves links without the field.
- In RSS, a link item's `<link>` points at the external URL, while its `<guid>`
  stays on your domain so readers keep a stable identity for the item.
- The sitemap lists only hosted posts — `renderSitemap` takes `Post[]`, not
  `Entry[]`, so including an external URL is a compile error.

## The site

Pages are server-rendered by the Worker — the entries are already compiled into
the bundle, so rendering one is a lookup and a template. Nothing to fetch, no
hydration, no loading state.

| Route | |
| --- | --- |
| `/` | The timeline, posts and links together |
| `/about` | Author, portrait, bio, socials |
| `/posts/:slug` | A post, or a link with a callout to its source |
| `/tags/:tag` | Everything under one tag |
| `/docs` | Swagger UI over the API |

### Theme

Dark by default, with a toggle in the header. Precedence is: the visitor's
stored choice, then `prefers-color-scheme`, then **dark**. The initial theme is
resolved by a small inline script in `<head>` so there's no flash of the wrong
palette before the page paints; `public/theme.js` only handles the toggle
afterwards.

One nuance worth knowing: browsers report `prefers-color-scheme: light` when the
OS has no preference set at all, so "no configuration" is indistinguishable from
"prefers light" in CSS. Dark is the fallback for every other path — no
JavaScript, an unsupported browser, a thrown error. To make dark win even over
an explicit light preference, drop the `@media (prefers-color-scheme: light)`
block in `public/styles.css` and the `matchMedia` call in the bootstrap.

Palette lives in `public/styles.css` as tokens on `:root` — dark values are the
defaults, light is the override.

## Going live

Deploying needs a Cloudflare account and a real D1 database:

```bash
wrangler login                       # interactive — run this yourself
wrangler d1 create blog-part2-db     # paste the returned id into wrangler.jsonc
npm run db:apply:remote
npm run deploy
```

`wrangler.jsonc` ships with `database_id` set to a placeholder. Local dev works
without it; `deploy` will not.

Static files are served by Workers Static Assets from `public/` — the same
Worker serves the site, the assets, and the API, so there's one deploy, one
domain, and no CORS between the front end and the API.

## Layout

```
blog.config.ts            everything about the site that isn't a post
content/posts/*.md        posts hosted here
content/links/*.md        links to posts published elsewhere
scripts/build-content.mjs build-time Markdown -> src/generated/entries.ts
src/index.ts              Hono app: pages, API, feeds
src/config.ts             config types, social registry, resolution
src/content.ts            queries over the compiled entries
src/views.ts              D1 view counting
src/feed.ts               RSS + sitemap
src/openapi.ts            the OpenAPI document
src/views/                HTML templates
src/db/schema.sql         D1 schema
public/                   styles.css, theme.js, avatar.svg, favicon.svg
test/                     integration tests against a real Worker + D1
```

`src/generated/` is gitignored — it's wiped and rebuilt from the Markdown on
every build.

CORS on `/api/*` is `origin: "*"`, which only affects other people's clients
reading your API — the site itself is same-origin. Narrow it if you'd rather
nobody else consumed it.

## Commands

```bash
npm run dev          # local server
npm test             # vitest against real workerd + D1
npm run typecheck    # tsc over src and test
npm run cf-typegen   # regenerate worker-configuration.d.ts after config changes
npm run deploy
```
