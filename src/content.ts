import { POSTS } from "./generated/posts";
import type { Post, PostSummary } from "./types";

/**
 * Read access to the compiled posts.
 *
 * POSTS is already sorted newest-first by the build script. Everything here is
 * derived once at module scope, so it costs nothing per request.
 */

/** Published posts only — drafts are never served. */
const published: readonly Post[] = POSTS.filter((p) => !p.draft);

const bySlug = new Map<string, Post>(published.map((p) => [p.slug, p]));

export function getPost(slug: string): Post | undefined {
  return bySlug.get(slug);
}

export function summarize(post: Post): PostSummary {
  const { markdown: _markdown, html: _html, sourceFile: _sourceFile, ...summary } = post;
  return summary;
}

export interface ListOptions {
  tag?: string;
  /** Case-insensitive substring match over title, excerpt, and body. */
  query?: string;
  limit: number;
  offset: number;
}

export interface ListResult {
  posts: PostSummary[];
  total: number;
  limit: number;
  offset: number;
}

export function listPosts(options: ListOptions): ListResult {
  let matches = published;

  if (options.tag) {
    const tag = options.tag.toLowerCase();
    matches = matches.filter((p) => p.tags.some((t) => t.toLowerCase() === tag));
  }

  if (options.query) {
    const q = options.query.toLowerCase();
    matches = matches.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.markdown.toLowerCase().includes(q),
    );
  }

  return {
    posts: matches.slice(options.offset, options.offset + options.limit).map(summarize),
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
  for (const post of published) {
    for (const tag of post.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Posts sharing the most tags with `slug`, newest-first within the same score. */
export function relatedPosts(slug: string, limit = 3): PostSummary[] {
  const post = bySlug.get(slug);
  if (!post || post.tags.length === 0) return [];

  const tags = new Set(post.tags.map((t) => t.toLowerCase()));
  return published
    .filter((p) => p.slug !== slug)
    .map((p) => ({ post: p, score: p.tags.filter((t) => tags.has(t.toLowerCase())).length }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.post.date.localeCompare(a.post.date))
    .slice(0, limit)
    .map((entry) => summarize(entry.post));
}

export function allPublished(): readonly Post[] {
  return published;
}
