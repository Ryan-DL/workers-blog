---
title: Hello, world
date: 2026-01-15
tags: [meta, cloudflare]
author: Ryan
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
