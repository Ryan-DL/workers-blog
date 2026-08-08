/**
 * Entries compiled from content/ by scripts/build-content.mjs.
 *
 * The blog has two kinds of entry: posts written here, and links to posts
 * published elsewhere. They share a timeline, so they share a base shape and
 * are told apart by `kind`.
 */

export type EntryKind = "post" | "link";

/**
 * Where an entry sits between "not written yet" and "public".
 *
 * - `published` — in every list, feed, and tag count.
 * - `preview`   — fetchable by slug so the front end can render it, but absent
 *                 from all listings, feeds, tags, related results, and the
 *                 sitemap. Unlisted, not access-controlled: anyone who knows
 *                 the slug can read it.
 * - `draft`     — never served at all; 404 everywhere.
 */
export type EntryStatus = "published" | "preview" | "draft";

interface BaseEntry {
  kind: EntryKind;
  /** Stable identifier, unique across both kinds. */
  slug: string;
  title: string;
  /** ISO 8601. */
  date: string;
  /** ISO 8601, or null if never revised. */
  updated: string | null;
  status: EntryStatus;
  tags: string[];
  author: string | null;
  excerpt: string;
  /** Original Markdown body, frontmatter stripped. */
  markdown: string;
  /** Rendered at build time. */
  html: string;
  sourceFile: string;
}

/** A post hosted by this blog. */
export interface Post extends BaseEntry {
  kind: "post";
  readingMinutes: number;
}

/**
 * A post published on another site. The body, if any, is commentary shown
 * alongside the link — the real content lives at `url`.
 */
export interface Link extends BaseEntry {
  kind: "link";
  /** Absolute URL of the external post. */
  url: string;
  /** Human-readable source, e.g. "Another Site". Derived from the host if unset. */
  site: string;
}

export type Entry = Post | Link;

/** Entry shape returned by list endpoints — omits the heavy body fields. */
export type EntrySummary =
  | Omit<Post, "markdown" | "html" | "sourceFile">
  | Omit<Link, "markdown" | "html" | "sourceFile">;

// `Env` (the DB binding and the vars) is not declared here: it's generated from
// wrangler.jsonc into worker-configuration.d.ts as a global, so the two can't
// drift. Regenerate with `npm run cf-typegen`.
