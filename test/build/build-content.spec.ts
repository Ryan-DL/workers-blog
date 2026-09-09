import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/**
 * Tests for scripts/build-content.mjs — the compiler that turns content/*.md
 * into the module baked into the Worker.
 *
 * The rest of the suite runs the Worker against an already-compiled set of
 * fixtures, so it only ever sees content that compiled successfully. What it
 * cannot see is the compiler refusing: a missing `date`, a link with no `url`,
 * two entries claiming one slug. Those rules are the ones a reader meets first
 * — they are what happens when you write your second post — and the promise the
 * README makes about them is specific: the build fails, and it names the file.
 *
 * So these run the real script as a subprocess over throwaway content trees and
 * assert on what it printed and whether it exited non-zero. A subprocess rather
 * than an import because the script is a CLI: it reads process.argv and calls
 * process.exit, and its exit code is the contract the npm scripts depend on.
 */

const exec = promisify(execFile);

const ROOT = fileURLToPath(new URL("../../", import.meta.url).href);
const TMP = join(ROOT, "test", ".tmp");

type Tree = { posts?: Record<string, string>; links?: Record<string, string> };
type Result = { ok: boolean; stdout: string; stderr: string; outFile: string };

let caseCount = 0;

/** Frontmatter plus a body, as a Markdown file. */
function md(frontmatter: string, body = "Some body text."): string {
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

/** Write a throwaway content tree and compile it, capturing the report. */
async function compile(tree: Tree, options: { outDirName?: string } = {}): Promise<Result> {
  const dir = join(TMP, `case-${++caseCount}`);
  await mkdir(dir, { recursive: true });

  for (const kind of ["posts", "links"] as const) {
    const files = tree[kind];
    if (!files) continue;
    await mkdir(join(dir, kind), { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      await writeFile(join(dir, kind, name), body, "utf8");
    }
  }

  // --source and --out are resolved against the repo root, so they have to be
  // repo-relative. POSIX separators keep the arguments identical on Windows.
  const outDir = join(dir, options.outDirName ?? "generated");
  const rel = (path: string) => relative(ROOT, path).split(sep).join("/");
  const args = ["scripts/build-content.mjs", "--source", rel(dir), "--out", rel(outDir)];
  const outFile = join(outDir, "entries.ts");

  try {
    const { stdout, stderr } = await exec("node", args, { cwd: ROOT });
    return { ok: true, stdout, stderr, outFile };
  } catch (err) {
    const { stdout = "", stderr = "" } = err as { stdout?: string; stderr?: string };
    return { ok: false, stdout, stderr, outFile };
  }
}

/**
 * The compiled module is a JSON array wrapped in a TypeScript declaration.
 * Anchored on the assignment rather than the first `[`, which belongs to the
 * `readonly Entry[]` annotation in the banner above it.
 */
async function readEntries(outFile: string): Promise<Array<Record<string, unknown>>> {
  const source = await readFile(outFile, "utf8");
  const json = /=\s*(\[[\s\S]*\])\s*as const;/.exec(source)?.[1];
  if (!json) throw new Error(`no ENTRIES array in ${outFile}:\n${source.slice(0, 400)}`);
  return JSON.parse(json);
}

beforeAll(async () => {
  await mkdir(TMP, { recursive: true });
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("compiling a valid tree", () => {
  it("merges posts and links into one timeline, newest first", async () => {
    const result = await compile({
      posts: {
        "older.md": md("title: Older\ndate: 2026-01-01"),
        "newer.md": md("title: Newer\ndate: 2026-03-01"),
      },
      links: {
        "elsewhere.md": md("title: Elsewhere\ndate: 2026-02-01\nurl: https://www.example.com/a"),
      },
    });

    expect(result.ok).toBe(true);
    const entries = await readEntries(result.outFile);

    expect(entries.map((e) => e.slug)).toEqual(["newer", "elsewhere", "older"]);
    expect(entries.map((e) => e.kind)).toEqual(["post", "link", "post"]);
  });

  it("reports what it compiled, so a silent no-op is visible", async () => {
    const result = await compile({
      posts: { "a.md": md("title: A\ndate: 2026-01-01") },
      links: { "b.md": md("title: B\ndate: 2026-01-02\nurl: https://example.com/b") },
    });

    expect(result.stdout).toContain("1 post(s), 1 link(s) compiled");
  });

  it("treats a missing links directory as normal, not an error", async () => {
    const result = await compile({ posts: { "only.md": md("title: Only\ndate: 2026-01-01") } });

    expect(result.ok).toBe(true);
    expect(await readEntries(result.outFile)).toHaveLength(1);
  });

  it("compiles an empty tree rather than failing on nothing to do", async () => {
    const result = await compile({});

    expect(result.ok).toBe(true);
    expect(await readEntries(result.outFile)).toEqual([]);
  });

  it("strips a dated filename prefix to form the slug", async () => {
    const result = await compile({
      posts: { "2026-01-15-hello-world.md": md("title: Hello\ndate: 2026-01-15") },
    });

    const entries = await readEntries(result.outFile);
    expect(entries[0]?.slug).toBe("hello-world");
  });

  it("lets frontmatter override the filename slug", async () => {
    const result = await compile({
      posts: { "2026-01-15-hello-world.md": md("title: Hello\ndate: 2026-01-15\nslug: custom") },
    });

    const entries = await readEntries(result.outFile);
    expect(entries[0]?.slug).toBe("custom");
  });
});

describe("required frontmatter", () => {
  it("names the file when title is missing", async () => {
    const result = await compile({ posts: { "untitled.md": md("date: 2026-01-01") } });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("untitled.md");
    expect(result.stderr).toContain("missing required `title`");
  });

  it("names the file when date is missing", async () => {
    const result = await compile({ posts: { "undated.md": md("title: Undated") } });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("undated.md");
    expect(result.stderr).toContain("missing required `date`");
  });

  it("rejects a date it cannot parse instead of coercing it", async () => {
    const result = await compile({
      posts: { "bad-date.md": md('title: Bad\ndate: "last Tuesday"') },
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('bad-date.md: unparseable date "last Tuesday"');
  });
});

describe("links", () => {
  it("requires a url, since the link is the point of the entry", async () => {
    const result = await compile({ links: { "no-url.md": md("title: No URL\ndate: 2026-01-01") } });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("no-url.md");
    expect(result.stderr).toContain("missing required `url`");
  });

  it("rejects a relative url rather than resolving it against the site", async () => {
    const result = await compile({
      links: { "relative.md": md("title: Relative\ndate: 2026-01-01\nurl: /posts/elsewhere") },
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('relative.md: url "/posts/elsewhere" is not an absolute URL');
  });

  it("rejects a non-http scheme", async () => {
    const result = await compile({
      links: { "ftp.md": md("title: FTP\ndate: 2026-01-01\nurl: ftp://example.com/a") },
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('ftp.md: url must be http(s), got "ftp:"');
  });
});

describe("status", () => {
  it("rejects a status outside the known set", async () => {
    const result = await compile({
      posts: { "odd.md": md("title: Odd\ndate: 2026-01-01\nstatus: archived") },
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('odd.md: unknown status "archived"');
    // The message lists the alternatives — the point is that a typo is fixable
    // from the error alone.
    expect(result.stderr).toContain("published, preview, draft");
  });

  it("refuses draft and preview together rather than picking a winner", async () => {
    const result = await compile({
      posts: { "both.md": md("title: Both\ndate: 2026-01-01\ndraft: true\npreview: true") },
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("both.md");
    expect(result.stderr).toContain("mutually exclusive");
  });

  it("refuses a status that contradicts its shorthand", async () => {
    const result = await compile({
      posts: { "clash.md": md("title: Clash\ndate: 2026-01-01\nstatus: published\ndraft: true") },
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("clash.md");
    expect(result.stderr).toContain("`status: published` contradicts `draft: true`");
  });

  it("accepts the shorthands on their own", async () => {
    const result = await compile({
      posts: {
        "d.md": md("title: D\ndate: 2026-01-01\ndraft: true"),
        "p.md": md("title: P\ndate: 2026-01-02\npreview: true"),
      },
    });

    expect(result.ok).toBe(true);
    const bySlug = Object.fromEntries((await readEntries(result.outFile)).map((e) => [e.slug, e.status]));
    expect(bySlug).toEqual({ d: "draft", p: "preview" });
  });
});

describe("slugs", () => {
  it("rejects one slug claimed twice, across kinds as well as within one", async () => {
    const result = await compile({
      posts: { "hello.md": md("title: Hello\ndate: 2026-01-01") },
      links: { "elsewhere.md": md("title: Elsewhere\ndate: 2026-01-02\nurl: https://example.com/a\nslug: hello") },
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('elsewhere.md: slug "hello" already used by hello.md');
  });
});

describe("the output directory guard", () => {
  it("refuses to wipe a directory that is not named generated", async () => {
    // --out is deleted recursively before writing, so the name is the only
    // thing standing between a mistyped flag and someone's source tree.
    const result = await compile(
      { posts: { "a.md": md("title: A\ndate: 2026-01-01") } },
      { outDirName: "src" },
    );

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("refusing to wipe");
    expect(result.stderr).toContain("must end in /generated");
  });
});
