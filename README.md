# blog

A blog on Cloudflare Workers. Posts are Markdown files in this repo, compiled
into the Worker at build time — no database. The Worker serves server-rendered
pages and a read-only JSON API with an OpenAPI spec. Clone it, edit one config
file, and deploy; nothing is wired to a particular person or domain.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Ryan-DL/workers-blog)

Click the button to spin up a copy of this blog inside your own Cloudflare and
GitHub accounts — it clones the repo, creates the Worker, and wires up Workers
Builds so future pushes redeploy automatically. The repo comes with placeholder
identity on purpose, so your first deploy "just works"; edit `blog.config.ts`
and push to make it yours.

## Make it yours

Everything that isn't a post lives in **`blog.config.ts`** — title,
description, author, about-page copy, socials, navigation. It's the only file
you need to edit.

Beyond that, a fresh clone only wants:

| Thing | Note |
| --- | --- |
| `content/posts/*.md` | Delete the sample post and write your own |
| `public/avatar.svg` | Replace with a real photo; point `author.avatar` at it |
| `name` in `wrangler.jsonc` | The Worker's name, and so its `*.workers.dev` hostname |
| `routes` in `wrangler.jsonc` | Only if you have a domain — [see below](#using-your-own-domain) |

```ts
export default {
  title: "blog",
  description: "A blog on Cloudflare Workers",
  url: "",              // empty = derive from the request. See below.
  author: { name, tagline, bio: ["…"], avatar, avatarAlt },
  socials: {
    github: "octocat",  // a bare handle…
    x: "",              // …or "" to leave it out entirely
    email: "",
  },
  nav: [{ label: "Writing", href: "/" }],
} satisfies BlogConfig;
```

**Socials take a handle or a full URL**; a leading `@` is fine. **Anything blank
is omitted**, so a half-filled config renders a clean footer. Built-ins: `github`,
`x`, `bluesky`, `mastodon`, `linkedin`, `youtube`, `email`, `website`; anything
else via `extraSocials`. `showRssLink: false` drops the feed icon. `npm run
typecheck` catches a mistyped key.

**`url`:** leave it empty and every absolute URL (canonical tags, RSS, sitemap,
OpenAPI) is derived from the request host — correct on `localhost`,
`*.workers.dev`, and your real domain with nothing to change before deploying.
Set it only to pin one canonical origin when the site answers on several
hostnames.

## The model

One chronological timeline of **entries**, of two kinds: `post` (written and
hosted here, in `content/posts/*.md`) and `link` (published elsewhere, in
`content/links/*.md`, with extra `url` and `site` fields). The front end
branches on `kind`: a `post` renders as a permalink, a `link` as a card pointing
offsite. Both share `slug`, `title`, `date`, `updated`, `status`, `tags`,
`author`, `excerpt`, and a body (for a link the body is optional commentary).

Every entry carries a `status`, which decides where it shows up:

| status | Listings, feeds, tags, sitemap | Fetchable at `/api/entries/:slug` |
| --- | --- | --- |
| `published` (default) | yes | yes |
| `preview` | no | yes |
| `draft` | no | no — 404 |

`preview` is "not published, but I want to look at it" — renderable and
shareable, but in no list or sitemap. **A preview is unlisted, not protected**:
anyone who knows the slug can read it, so don't put anything sensitive in one.

### Where data lives

Your posts are just Markdown files under `content/`. When you build or deploy,
`scripts/build-content.mjs` reads them, turns each into a page, and bakes the
result into the Worker. That's why the blog needs no database and no runtime
parsing — the posts *are* the site's code. (And if a file is malformed, the
build fails loudly instead of a visitor hitting a broken page later.)

The same build step also feeds the test suite, but from a separate folder,
`test/fixtures/`, filled with a small set of sample entries. Why separate? The
tests check specific things (e.g. "there are 4 entries, 2 of them posts"), so
if they ran against *your* `content/`, writing just one new post would break
them. Running against the fixed sample set keeps the tests green no matter how
many posts you add.

## Getting started

```bash
npm install
npm run build   # content/ -> src/generated/, Tailwind -> public/styles.css
npm run dev     # http://localhost:8787
```

`dev`/`deploy`/`test` run `build` first. While iterating on styles, run
`npm run css:watch` alongside `npm run dev`.

## Writing a post

Drop a Markdown file in `content/posts/`. The filename sets the slug, with an
optional `YYYY-MM-DD-` prefix stripped: `2026-01-15-hello-world.md` →
`hello-world`.

```markdown
---
title: Hello, world      # required
date: 2026-01-15         # required
status: preview          # optional — published (default) | preview | draft
tags: [meta, cloudflare] # optional
author: Your Name        # optional
excerpt: ...             # optional — derived from the body if omitted
slug: custom-slug        # optional — overrides the filename
updated: 2026-01-20      # optional
---

Body goes here.
```

`draft: true` and `preview: true` are shorthands. Setting one that contradicts a
`status` fails the build rather than picking a winner.

### Linking to a post you wrote elsewhere

Same idea, but in `content/links/` with a **required** `url`:

```markdown
---
title: What I got wrong about edge caching   # required
date: 2026-02-20                             # required
url: https://example.com/blog/the-post        # required — absolute http(s)
site: Example Engineering                    # optional — defaults to the URL host
tags: [cloudflare]                           # optional
---
Optional commentary, shown next to the link.
```

The build fails, naming the file, on: a missing `title`/`date`, an unparseable
date, a link with no or non-absolute `url`, an unknown or self-contradicting
`status`, or a slug already used by another entry **of either kind**.

## API

Everything returns `entries` — a mixed list unless you narrow it by kind.

| Route | Notes |
| --- | --- |
| `/api`, `/api/health` | Index; health with counts |
| `/api/entries` | The timeline. `?kind=&tag=&q=&limit=&offset=` (`kind` = `post`\|`link`\|`all`) |
| `/api/posts`, `/api/links` | Aliases for `?kind=post` / `?kind=link` |
| `/api/entries/:slug` | Full entry incl. `markdown` and `html` |
| `/api/tags` | Tags with counts, most-used first |
| `/feed.xml` | RSS 2.0 over the timeline |
| `/sitemap.xml` | Hosted posts only |
| `/openapi.json` | OpenAPI 3.1 document; rendered at `/docs` |

Drafts 404 everywhere; previews appear in no listing. `limit` caps at 100; a
bad `kind` is a 400 while bad pagination falls back to defaults.

## The site

Pages are server-rendered by the Worker — the entries are already in the bundle,
so rendering is a lookup and a template. No fetching, hydration, or loading
state. Routes: `/` (timeline), `/about`, `/posts/:slug`, `/tags/:tag`, `/docs`.

### Styling & theme

**Tailwind CSS v4.** `src/styles.css` is the entry point; `css:build` compiles
it to `public/styles.css` (gitignored — edit the source, never the file in
`public/`). Most of the design lives as utility classes in `src/views/*.ts`;
`src/styles.css` holds the parts utilities can't express: the `@theme` tokens
(palette, fonts, widths), the light-palette blocks, a base layer for link/focus
defaults, and `.prose` variables for rendered Markdown.

Colours are **semantic** — `bg-canvas`, `text-ink-dim`, `text-accent` each
compile to a `--color-*` variable, so switching theme swaps variables rather
than duplicating rules under `dark:` (that's also why rendered Markdown needs no
`dark:prose-invert`). Tailwind scans `src/**/*.ts` for class names and emits only
what it finds; `src/generated/` is excluded so prose words like "block" don't
generate stray CSS.

**Dark by default**, with a header toggle. Precedence: stored choice →
`prefers-color-scheme` → **dark**. A tiny inline script in `<head>` resolves the
initial theme (no flash) and sets `data-theme` on `<html>`, which `dark:`/`light:`
variants key off so an explicit choice beats the OS. It's handled this way
because a media query can't be overridden by one. Anything the JS or tests need
to find uses a `data-` attribute (`data-theme-toggle`, `data-socials`) rather
than a restylable utility class.

## Going live

You need a Cloudflare account and nothing else — there are no bindings to
provision:

```bash
wrangler login   # interactive — run this yourself
npm run deploy
```

That publishes to `blog.<your-subdomain>.workers.dev` — a real site with no
domain of your own. Static files are served from `public/` by Workers Static
Assets; one Worker serves the site, assets, and API, so there's one deploy, one
domain, and no CORS.

### Deploying from CI

`.github/workflows/ci.yml` runs typecheck and the test suite on every push/PR to
`main`, then — on `main` only — `npm run deploy`. **Pushing to `main` is
publishing**, and a red suite blocks a broken build before it reaches the edge.
Set two repo secrets first:

| Secret | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token with **Edit Cloudflare Workers** permission |
| `CLOUDFLARE_ACCOUNT_ID` | The account the Worker lives in |

Create the token at **Cloudflare dashboard → My Profile → API Tokens → Create
Token → Edit Cloudflare Workers**, then `gh secret set CLOUDFLARE_API_TOKEN`.
Deploying by hand needs neither secret — `wrangler login` uses your OAuth.

### Pull request previews

Every pull request gets its own live preview. When you open a PR, CI uploads a
preview of your branch — without touching the deployed site — and posts a link
on the PR:

```
https://pr-<number>-blog.<subdomain>.workers.dev
```

The link works for the whole life of the PR and updates as you push commits, so
you (and reviewers) can see exactly what the change will look like before it
ships. A quick checklist:

- **It never replaces the live site.** Production keeps serving `main`;
  previews are just versions uploaded *next to* it.
- **Previews live on `*.workers.dev` only** — Cloudflare won't serve them from a
  custom domain.
- **They're public.** Nothing links to them, but treat them as unlisted, not
  private.
- **No logs.** Workers Logs and `wrangler tail` don't cover preview URLs.

Previews need `"preview_urls": true` in `wrangler.jsonc`.

### Using your own domain

Add a `routes` entry to `wrangler.jsonc` and drop `workers_dev`:

```jsonc
"routes": [{ "pattern": "example.com", "custom_domain": true }]
```

`custom_domain: true` hands Cloudflare the whole hostname — it creates the DNS
record and issues the certificate on deploy (zone must already be on your
account). Expect a few minutes before the cert goes live. Two consequences:
once `routes` is set, the `*.workers.dev` hostname turns off (keep
`"workers_dev": true` to have both), and only the apex is claimed — redirect
`www` with a Cloudflare Redirect Rule rather than a second custom domain.
Because `url` is empty, canonical/RSS/sitemap/OpenAPI all follow the request
host, so nothing changes when the domain is added.

## Commands

```bash
npm run dev          # local server
npm run build        # content -> src/generated, Tailwind -> public/styles.css
npm test             # vitest against real workerd
npm run typecheck    # tsc over src and test
npm run deploy
```

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, publish under it.