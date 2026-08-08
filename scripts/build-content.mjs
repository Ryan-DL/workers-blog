#!/usr/bin/env node
/**
 * Compiles content/ into src/generated/entries.ts.
 *
 * Two sources feed one timeline:
 *   content/posts/*.md  -> kind "post", hosted here
 *   content/links/*.md  -> kind "link", published elsewhere, body is commentary
 *
 * Frontmatter parsing and Markdown rendering happen HERE, at build time, in
 * Node — not in the Worker. That keeps `gray-matter` and `marked` out of the
 * deployed bundle, keeps cold starts fast, and means a malformed entry fails
 * the build instead of a request.
 *
 * Run it via `npm run content:build` (dev/deploy/test do this automatically).
 */

import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const POSTS_DIR = join(ROOT, "content", "posts");
const LINKS_DIR = join(ROOT, "content", "links");
const OUT_DIR = join(ROOT, "src", "generated");
const OUT_FILE = join(OUT_DIR, "entries.ts");

marked.setOptions({ gfm: true, breaks: false });

/** Turn a filename into a URL slug: "2026-01-02-my-post.md" -> "my-post". */
function slugFromFilename(filename) {
  const base = basename(filename, extname(filename));
  // Strip a leading ISO date prefix if the file uses the dated convention.
  return base.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

/** Strip Markdown/HTML down to plain text for excerpts and read-time. */
function toPlainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/^[#>\-*+]\s+/gm, "") // list/heading/quote markers
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptFrom(plain, limit = 200) {
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function fail(file, message) {
  throw new Error(`[content] ${file}: ${message}`);
}

function normalizeDate(value, file) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) fail(file, `unparseable date "${value}"`);
    return parsed.toISOString();
  }
  fail(file, "frontmatter is missing required `date`");
}

/** "https://www.example.com/a/b" -> "example.com" */
function siteFromUrl(url) {
  return new URL(url).hostname.replace(/^www\./, "");
}

/** Read a directory of Markdown files, tolerating its absence. */
async function readMarkdownDir(dir, label) {
  let filenames;
  try {
    filenames = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch (err) {
    // An empty or missing links/ directory is normal, not an error.
    if (err.code === "ENOENT") return [];
    throw err;
  }
  filenames.sort();

  return Promise.all(
    filenames.map(async (filename) => ({
      filename,
      sourceFile: `content/${label}/${filename}`,
      ...matter(await readFile(join(dir, filename), "utf8")),
    })),
  );
}

/** Fields every entry shares, whichever kind it is. */
function commonFields(file, data, content) {
  if (!data.title) fail(file, "frontmatter is missing required `title`");

  const plain = toPlainText(content);
  return {
    title: String(data.title),
    date: normalizeDate(data.date, file),
    updated: data.updated ? normalizeDate(data.updated, file) : null,
    // An entry is published unless it explicitly says `draft: true`.
    draft: data.draft === true,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    author: data.author ? String(data.author) : null,
    excerpt: data.excerpt ? String(data.excerpt) : excerptFrom(plain),
    markdown: content.trim(),
    html: marked.parse(content).trim(),
    plain,
  };
}

async function main() {
  const entries = [];
  const seenSlugs = new Map();

  function claimSlug(slug, filename) {
    if (seenSlugs.has(slug)) {
      fail(filename, `slug "${slug}" already used by ${seenSlugs.get(slug)}`);
    }
    seenSlugs.set(slug, filename);
    return slug;
  }

  // --- Posts hosted here ---
  for (const { filename, sourceFile, data, content } of await readMarkdownDir(POSTS_DIR, "posts")) {
    const { plain, ...common } = commonFields(filename, data, content);
    const words = plain ? plain.split(" ").length : 0;

    entries.push({
      kind: "post",
      slug: claimSlug(data.slug ? String(data.slug) : slugFromFilename(filename), filename),
      ...common,
      readingMinutes: Math.max(1, Math.round(words / 220)),
      sourceFile,
    });
  }

  // --- Links to posts published elsewhere ---
  for (const { filename, sourceFile, data, content } of await readMarkdownDir(LINKS_DIR, "links")) {
    if (!data.url) fail(filename, "frontmatter is missing required `url`");

    const url = String(data.url);
    let site;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        fail(filename, `url must be http(s), got "${parsed.protocol}"`);
      }
      site = data.site ? String(data.site) : siteFromUrl(url);
    } catch (err) {
      if (err.message.startsWith("[content]")) throw err;
      fail(filename, `url "${url}" is not an absolute URL`);
    }

    const { plain: _plain, ...common } = commonFields(filename, data, content);

    entries.push({
      kind: "link",
      slug: claimSlug(data.slug ? String(data.slug) : slugFromFilename(filename), filename),
      ...common,
      url,
      site,
      sourceFile,
    });
  }

  // Newest first — the order the API serves them in.
  entries.sort((a, b) => b.date.localeCompare(a.date));

  const banner =
    "// AUTO-GENERATED by scripts/build-content.mjs — do not edit.\n" +
    "// Regenerate with: npm run content:build\n\n" +
    'import type { Entry } from "../types";\n\n';

  const body = `export const ENTRIES: readonly Entry[] = ${JSON.stringify(entries, null, 2)} as const;\n`;

  // Wipe rather than overwrite: a module left behind by an earlier version of
  // this script would still typecheck against the current types and confuse
  // the build.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, banner + body, "utf8");

  const posts = entries.filter((e) => e.kind === "post").length;
  const links = entries.filter((e) => e.kind === "link").length;
  const drafts = entries.filter((e) => e.draft).length;
  console.log(
    `[content] ${posts} post(s), ${links} link(s) compiled` +
      (drafts ? ` (${drafts} draft${drafts === 1 ? "" : "s"})` : "") +
      ` -> src/generated/entries.ts`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
