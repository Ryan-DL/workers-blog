import { env } from "cloudflare:test";
import schema from "../src/db/schema.sql?raw";

/**
 * Apply src/db/schema.sql to the test D1 instance.
 *
 * D1's `exec` chokes on comments and multi-line statements, so the file is
 * reduced to bare statements first. Tests therefore run against the same
 * schema that ships to production, not a copy that can drift.
 */
export async function applySchema(): Promise<void> {
  const statements = schema
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
}

export async function resetViews(): Promise<void> {
  await env.DB.prepare("DELETE FROM post_views").run();
}
