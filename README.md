# blog-part2

A blog backend on Cloudflare Workers. Posts are Markdown files in this repo;
D1 holds the mutable state (view counts). No front end yet — this is a JSON API.

## The core idea

Two kinds of data, stored two different ways:

| | Where it lives | Changes |
| --- | --- | --- |
| Post content | `content/posts/*.md`, compiled into the Worker bundle | On deploy |
| View counts | D1 (`post_views`) | Every request |

`scripts/build-content.mjs` parses frontmatter and renders Markdown to HTML **at
build time**, in Node, and writes `src/generated/posts.ts`. So `gray-matter` and
`marked` never ship to the edge, cold starts don't parse anything, and a
malformed post fails the build instead of a request.

## Getting started

```bash
npm install
npm run content:build          # compile content/posts -> src/generated/posts.ts
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
tags: [meta, cloudflare] # optional
author: Ryan             # optional
excerpt: ...             # optional — derived from the body if omitted
slug: custom-slug        # optional — overrides the filename
draft: true              # optional — drafts are never served
updated: 2026-01-20      # optional
---

Body goes here.
```

`readingMinutes` and `excerpt` are computed for you. Duplicate slugs, missing
titles, and unparseable dates fail the build with the offending filename.

## API

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/` | Endpoint index |
| GET | `/api/health` | `{ ok, posts, timestamp }` |
| GET | `/api/posts` | `?tag=&q=&limit=&offset=&views=` — summaries, newest first |
| GET | `/api/posts/:slug` | Full post incl. `markdown` and rendered `html`; `?views=1` |
| GET | `/api/posts/:slug/related` | Posts sharing the most tags; `?limit=` |
| GET | `/api/posts/:slug/views` | Current count |
| POST | `/api/posts/:slug/views` | Atomic increment, returns new count |
| GET | `/api/tags` | Tags with counts, most-used first |
| GET | `/api/popular` | Most-viewed posts; `?limit=` |
| GET | `/feed.xml` | RSS 2.0 with full post HTML |
| GET | `/sitemap.xml` | |

`limit` caps at 100. Malformed pagination params fall back to defaults rather
than erroring. Drafts 404 everywhere. `POST /views` 404s for unknown slugs, so
the table can't be seeded with arbitrary keys.

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

Also update `SITE_URL` in `wrangler.jsonc` before deploying — the RSS feed and
sitemap build absolute URLs from it.

## Layout

```
content/posts/*.md        posts (the source of truth)
scripts/build-content.mjs build-time Markdown -> src/generated/posts.ts
src/index.ts              Hono app and routes
src/content.ts            queries over the compiled posts
src/views.ts              D1 view counting
src/feed.ts               RSS + sitemap
src/db/schema.sql         D1 schema
test/api.spec.ts          integration tests against a real Worker + D1
```

`src/generated/` is gitignored — it's rebuilt from the Markdown every time.

## Notes for the front end

CORS on `/api/*` is currently `origin: "*"` so a separate dev server can call
it. Narrow it before launch. When you add static files, uncomment the `assets`
block in `wrangler.jsonc`.

## Commands

```bash
npm run dev          # local server
npm test             # vitest against real workerd + D1
npm run typecheck    # tsc over src and test
npm run cf-typegen   # regenerate worker-configuration.d.ts after config changes
npm run deploy
```
