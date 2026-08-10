#!/usr/bin/env node
/**
 * Compiles a directory of Markdown into a generated TypeScript module.
 *
 * Two sources feed one timeline:
 *   <source>/posts/*.md  -> kind "post", hosted here
 *   <source>/links/*.md  -> kind "link", published elsewhere, body is commentary
 *
 * Frontmatter parsing and Markdown rendering happen HERE, at build time, in
 * Node — not in the Worker. That keeps `gray-matter` and `marked` out of the
 * deployed bundle, keeps cold starts fast, and means a malformed entry fails
 * the build instead of a request.
 *
 * Source and destination are arguments so the same compiler serves two callers:
 *
 *   npm run content:build    content/       -> src/generated/     (the site)
 *   npm run fixtures:build   test/fixtures/ -> test/generated/    (the tests)
 *
 * That split is what lets the test suite keep a stable cast of entries — a
 * draft, a preview, a couple of links — while the real blog holds whatever
 * you've actually written. Tests assert on counts and slugs, so without it
 * every new post would break the build.
 */

import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, basename, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const SOURCE_REL = arg("source", "content");
const OUT_REL = arg("out", "src/generated");

const POSTS_DIR = join(ROOT, SOURCE_REL, "posts");
const LINKS_DIR = join(ROOT, SOURCE_REL, "links");
const OUT_DIR = join(ROOT, OUT_REL);
const OUT_FILE = join(OUT_DIR, "entries.ts");

// The output directory is wiped before writing, so refuse to point that at
// anything but a directory whose name says it's disposable.
if (basename(OUT_DIR) !== "generated") {
  console.error(`[content] refusing to wipe --out "${OUT_REL}": must end in /generated`);
  process.exit(1);
}

/** Import specifier for src/types, relative to wherever we're writing. */
const TYPES_SPECIFIER = (() => {
  const rel = relative(OUT_DIR, join(ROOT, "src", "types")).split(sep).join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
})();

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
      sourceFile: `${SOURCE_REL}/${label}/${filename}`,
      ...matter(await readFile(join(dir, filename), "utf8")),
    })),
  );
}

const STATUSES = ["published", "preview", "draft"];

/**
 * Resolve the publication status from frontmatter.
 *
 * `status:` is canonical; `draft: true` and `preview: true` are shorthands.
 * Contradicting each other fails the build rather than picking a winner —
 * guessing wrong here either leaks an unfinished post or hides a finished one.
 */
function normalizeStatus(file, data) {
  const shorthands = [];
  if (data.draft === true) shorthands.push("draft");
  if (data.preview === true) shorthands.push("preview");

  if (shorthands.length > 1) {
    fail(file, "`draft: true` and `preview: true` are mutually exclusive");
  }

  if (data.status === undefined) return shorthands[0] ?? "published";

  const status = String(data.status);
  if (!STATUSES.includes(status)) {
    fail(file, `unknown status "${status}" — expected ${STATUSES.join(", ")}`);
  }
  if (shorthands.length === 1 && shorthands[0] !== status) {
    fail(file, `\`status: ${status}\` contradicts \`${shorthands[0]}: true\``);
  }
  return status;
}

/** Fields every entry shares, whichever kind it is. */
function commonFields(file, data, content) {
  if (!data.title) fail(file, "frontmatter is missing required `title`");

  const plain = toPlainText(content);
  return {
    title: String(data.title),
    date: normalizeDate(data.date, file),
    updated: data.updated ? normalizeDate(data.updated, file) : null,
    status: normalizeStatus(file, data),
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
    `// Compiled from ${SOURCE_REL}/. Regenerate with: npm run build\n\n` +
    `import type { Entry } from "${TYPES_SPECIFIER}";\n\n`;

  const body = `export const ENTRIES: readonly Entry[] = ${JSON.stringify(entries, null, 2)} as const;\n`;

  // Wipe rather than overwrite: a module left behind by an earlier version of
  // this script would still typecheck against the current types and confuse
  // the build.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, banner + body, "utf8");

  const posts = entries.filter((e) => e.kind === "post").length;
  const links = entries.filter((e) => e.kind === "link").length;
  const held = STATUSES.slice(1)
    .map((status) => [status, entries.filter((e) => e.status === status).length])
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`);

  console.log(
    `[content] ${SOURCE_REL}: ${posts} post(s), ${links} link(s) compiled` +
      (held.length ? ` (${held.join(", ")})` : "") +
      ` -> ${OUT_REL}/entries.ts`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
