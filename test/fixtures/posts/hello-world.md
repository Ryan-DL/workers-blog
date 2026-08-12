---
title: Hello, world
date: 2026-01-15
tags: [meta, cloudflare]
author: Test Author
---

This is the first post. It exists mostly to prove the content pipeline works
end to end: a Markdown file in `content/posts/` becomes JSON on the API without
anyone touching a database.

## How a post becomes an endpoint

When you run `npm run content:build`, the script reads every `.md` file in this
directory, pulls the frontmatter, renders the body to HTML, and writes a single
generated TypeScript module. The Worker imports that module. No filesystem
access at runtime, no Markdown parser in the bundle.

The upshot is that publishing is a deploy, and a malformed post breaks the build
instead of a request.

## What the build actually writes

Frontmatter in, a typed module out. Every entry is frozen into the bundle, so
`getEntry("hello-world")` is an object lookup rather than a query:

```ts
export const ENTRIES: Entry[] = [
  {
    kind: "post",
    slug: "hello-world",
    title: "Hello, world",
    date: "2026-01-15",
    status: "published",
    tags: ["meta", "cloudflare"],
    readingMinutes: 2,
    html: "<p>This is the first post...</p>",
  },
];
```

Running it by hand is one command, and it tells you what it found:

```bash
$ npm run content:build
[content] 4 post(s), 2 link(s) compiled (1 preview, 1 draft) -> src/generated/entries.ts
```

A line long enough to need scrolling stays inside its own box rather than pushing the page sideways — worth checking on a phone, since `overflow-x` on a `pre` is the sort of thing that only breaks at 375px wide.
