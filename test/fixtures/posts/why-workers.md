---
title: Why run a blog on Workers
date: 2026-02-03
tags: [cloudflare, architecture]
author: Ryan
excerpt: Notes on picking Workers over a conventional server, and where the split between build time and request time falls.
---

A blog is mostly static, which makes it a bad fit for a server that runs all the
time and a good fit for something that wakes up only when someone reads it.

## The split

Everything this project serves is written once and read constantly. Post
content lives in Git, gets compiled into the Worker bundle at build time, and
never touches a database.

That means the read path for a post is a map lookup. There is no query to make
slow, no connection to pool, and nothing to keep warm.

## What this costs

The trade is that publishing requires a deploy. For a blog written by one
person, that's not a real constraint — you were already committing the post.
