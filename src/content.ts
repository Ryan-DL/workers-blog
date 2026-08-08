import { ENTRIES } from "./generated/entries";
import type { Entry, EntryKind, EntrySummary, Post } from "./types";

/**
 * Read access to the compiled entries — posts hosted here and links to posts
 * published elsewhere, sharing one timeline.
 *
 * ENTRIES is already sorted newest-first by the build script. Everything here
 * is derived once at module scope, so it costs nothing per request.
 */

/**
 * Two sets, and the difference between them is the whole preview feature:
 *
 * - `servable` — reachable by slug. Published and preview entries.
 * - `published` — everything else: lists, tags, related, feeds, sitemap.
 *
 * A preview entry is therefore fetchable but undiscoverable. Drafts are in
 * neither set, so they 404 everywhere.
 */
const servable: readonly Entry[] = ENTRIES.filter((e) => e.status !== "draft");
const published: readonly Entry[] = servable.filter((e) => e.status === "published");

const bySlug = new Map<string, Entry>(servable.map((e) => [e.slug, e]));

/** Lookup by slug, including preview entries. */
export function getEntry(slug: string): Entry | undefined {
  return bySlug.get(slug);
}

/**
 * Narrowed lookup for endpoints that only make sense on a published post —
 * view counting. A preview post is deliberately excluded so reads of an
 * unpublished draft don't inflate its numbers before launch.
 */
export function getPublishedPost(slug: string): Post | undefined {
  const entry = bySlug.get(slug);
  return entry?.kind === "post" && entry.status === "published" ? entry : undefined;
}

export function summarize(entry: Entry): EntrySummary {
  const { markdown: _markdown, html: _html, sourceFile: _sourceFile, ...summary } = entry;
  return summary;
}

export interface ListOptions {
  kind?: EntryKind;
  tag?: string;
  /** Case-insensitive substring match over title, excerpt, and body. */
  query?: string;
  limit: number;
  offset: number;
}

export interface ListResult {
  entries: EntrySummary[];
  total: number;
  limit: number;
  offset: number;
}

export function listEntries(options: ListOptions): ListResult {
  let matches = published;

  if (options.kind) {
    matches = matches.filter((e) => e.kind === options.kind);
  }

  if (options.tag) {
    const tag = options.tag.toLowerCase();
    matches = matches.filter((e) => e.tags.some((t) => t.toLowerCase() === tag));
  }

  if (options.query) {
    const q = options.query.toLowerCase();
    matches = matches.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.excerpt.toLowerCase().includes(q) ||
        e.markdown.toLowerCase().includes(q),
    );
  }

  return {
    entries: matches.slice(options.offset, options.offset + options.limit).map(summarize),
    total: matches.length,
    limit: options.limit,
    offset: options.offset,
  };
}

export interface TagCount {
  tag: string;
  count: number;
}

/** Every tag in use, most-used first, ties broken alphabetically. */
export function listTags(): TagCount[] {
  const counts = new Map<string, number>();
  for (const entry of published) {
    for (const tag of entry.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Entries sharing the most tags with `slug`, newest-first within the same score.
 *
 * The source entry may be a preview — its own page needs related links — but
 * candidates are drawn from `published`, so a preview never surfaces as a
 * related link on a public post.
 */
export function relatedEntries(slug: string, limit = 3): EntrySummary[] {
  const entry = bySlug.get(slug);
  if (!entry || entry.tags.length === 0) return [];

  const tags = new Set(entry.tags.map((t) => t.toLowerCase()));
  return published
    .filter((e) => e.slug !== slug)
    .map((e) => ({ entry: e, score: e.tags.filter((t) => tags.has(t.toLowerCase())).length }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date))
    .slice(0, limit)
    .map((candidate) => summarize(candidate.entry));
}

/** The public timeline: published posts and links together. */
export function publishedEntries(): readonly Entry[] {
  return published;
}

/** Only the posts hosted here — for the sitemap, which can't claim other sites' URLs. */
export function publishedPosts(): readonly Post[] {
  return published.filter((e): e is Post => e.kind === "post");
}

/** Counts for the health endpoint. */
export function statusCounts(): Record<string, number> {
  const counts: Record<string, number> = { published: 0, preview: 0, draft: 0 };
  for (const entry of ENTRIES) counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  return counts;
}
