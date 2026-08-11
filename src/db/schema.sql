-- D1 schema for blog.
--
-- Post content is NOT stored here: it lives in content/posts/*.md and is
-- compiled into the Worker bundle. D1 holds only mutable, per-request state.

CREATE TABLE IF NOT EXISTS post_views (
  slug       TEXT PRIMARY KEY,
  views      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_post_views_views ON post_views (views DESC);
