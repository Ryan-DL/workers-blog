/** A post compiled from content/posts/*.md by scripts/build-content.mjs. */
export interface Post {
  slug: string;
  title: string;
  /** ISO 8601. */
  date: string;
  /** ISO 8601, or null if never revised. */
  updated: string | null;
  draft: boolean;
  tags: string[];
  author: string | null;
  excerpt: string;
  readingMinutes: number;
  /** Original Markdown body, frontmatter stripped. */
  markdown: string;
  /** Rendered at build time. */
  html: string;
  sourceFile: string;
}

/** Post shape returned by list endpoints — omits the heavy body fields. */
export type PostSummary = Omit<Post, "markdown" | "html" | "sourceFile">;

// `Env` (the DB binding and the vars) is not declared here: it's generated from
// wrangler.jsonc into worker-configuration.d.ts as a global, so the two can't
// drift. Regenerate with `npm run cf-typegen`.
