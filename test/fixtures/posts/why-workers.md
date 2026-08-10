---
title: Why run a blog on Workers
date: 2026-02-03
tags: [cloudflare, architecture]
author: Ryan
excerpt: Notes on picking Workers and D1 over a conventional server, and where the split between build time and request time falls.
---

A blog is mostly static, which makes it a bad fit for a server that runs all the
time and a good fit for something that wakes up only when someone reads it.

## The split

Two kinds of data live in this project, and they're stored differently:

- **Post content** is written once and read constantly. It lives in Git, gets
  compiled into the Worker bundle, and never touches a database.
- **View counts** change on every read. They live in D1.

Keeping those separate means the read path for a post is a map lookup, and the
only thing that can be slow is the part that genuinely needs to be.

## What this costs

The trade is that publishing requires a deploy. For a blog written by one
person, that's not a real constraint — you were already committing the post.
