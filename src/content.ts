import { ENTRIES } from "./generated/entries";
import type { Entry, EntryKind, EntrySummary, Post } from "./types";

/**
 * Read access to the compiled entries — posts hosted here and links to posts
 * published elsewhere, sharing one timeline.
 *
 * ENTRIES is already sorted newest-first by the build script. Everything here
 * is derived once at module scope, so it costs nothing per request.
 */

/** Published entries only — drafts are never served. */
const published: readonly Entry[] = ENTRIES.filter((e) => !e.draft);

const bySlug = new Map<string, Entry>(published.map((e) => [e.slug, e]));

export function getEntry(slug: string): Entry | undefined {
  return bySlug.get(slug);
}

/** Narrowed lookup for the endpoints that only make sense on hosted posts. */
export function getPost(slug: string): Post | undefined {
  const entry = bySlug.get(slug);
  return entry?.kind === "post" ? entry : undefined;
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

/** Entries sharing the most tags with `slug`, newest-first within the same score. */
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

/** The full timeline: posts and links together. */
export function allPublished(): readonly Entry[] {
  return published;
}

/** Only the posts hosted here — for the sitemap, which can't claim other sites' URLs. */
export function publishedPosts(): readonly Post[] {
  return published.filter((e): e is Post => e.kind === "post");
}
