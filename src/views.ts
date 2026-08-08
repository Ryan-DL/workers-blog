/**
 * View counts — the one piece of blog state that lives in D1 rather than in
 * the Markdown source.
 */

/** Atomically increment and return the new count. */
export async function recordView(db: D1Database, slug: string): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO post_views (slug, views, updated_at)
       VALUES (?1, 1, datetime('now'))
       ON CONFLICT(slug) DO UPDATE SET
         views = views + 1,
         updated_at = datetime('now')
       RETURNING views`,
    )
    .bind(slug)
    .first<{ views: number }>();

  // RETURNING always yields a row here, but the types don't know that.
  return row?.views ?? 0;
}

export async function getViews(db: D1Database, slug: string): Promise<number> {
  const row = await db
    .prepare("SELECT views FROM post_views WHERE slug = ?1")
    .bind(slug)
    .first<{ views: number }>();

  // No row means nobody has read it yet, which is a count of zero.
  return row?.views ?? 0;
}

/** View counts for many slugs at once, so list endpoints stay one round trip. */
export async function getViewsBatch(
  db: D1Database,
  slugs: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(slugs.map((s) => [s, 0]));
  if (slugs.length === 0) return counts;

  const placeholders = slugs.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(`SELECT slug, views FROM post_views WHERE slug IN (${placeholders})`)
    .bind(...slugs)
    .all<{ slug: string; views: number }>();

  for (const row of results) counts[row.slug] = row.views;
  return counts;
}

export interface PopularPost {
  slug: string;
  views: number;
}

export async function mostViewed(db: D1Database, limit: number): Promise<PopularPost[]> {
  const { results } = await db
    .prepare("SELECT slug, views FROM post_views ORDER BY views DESC, slug ASC LIMIT ?1")
    .bind(limit)
    .all<PopularPost>();

  return results;
}
