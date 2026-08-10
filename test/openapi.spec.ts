import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applySchema } from "./helpers";

interface Spec {
  openapi: string;
  info: { title: string; version: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown>; parameters: Record<string, unknown> };
}

let spec: Spec;

beforeAll(async () => {
  // The path-coverage test below actually calls the view-count endpoints.
  await applySchema();
  spec = await (await SELF.fetch("https://example.com/openapi.json")).json<Spec>();
});

describe("/openapi.json", () => {
  it("is served as JSON", async () => {
    const res = await SELF.fetch("https://example.com/openapi.json");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("is a 3.1 document with a server pointing at this deployment", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toContain("API");
    expect(spec.servers[0]!.url).toBe("https://example.com");
  });

  /**
   * The spec is hand-written, so the risk is drift. Rather than trust it,
   * fetch every documented path and assert the Worker actually serves it.
   */
  it("documents only paths the Worker really serves", async () => {
    const documented = Object.keys(spec.paths);
    expect(documented.length).toBeGreaterThan(8);

    for (const path of documented) {
      const probe = path.replace("{slug}", "hello-world");
      const res = await SELF.fetch(`https://example.com${probe}`);

      expect(res.status, `GET ${probe}`).not.toBe(404);
      expect(res.status, `GET ${probe}`).toBeLessThan(500);
    }
  });

  it("covers every route the API index advertises", async () => {
    const index = await (
      await SELF.fetch("https://example.com/api")
    ).json<{ endpoints: string[] }>();

    const advertised = index.endpoints.map(
      (line) => line.split(/\s+/)[1]!.replace(/:slug/, "{slug}").split("?")[0]!,
    );

    for (const path of new Set(advertised)) {
      expect(Object.keys(spec.paths), `${path} should be documented`).toContain(path);
    }
  });

  it("declares the POST operation for view counting", () => {
    const views = spec.paths["/api/entries/{slug}/views"];

    expect(views).toBeDefined();
    expect(views).toHaveProperty("get");
    expect(views).toHaveProperty("post");
  });

  it("models the two entry kinds as a discriminated union", () => {
    const summary = spec.components.schemas.EntrySummary as {
      oneOf: { $ref: string }[];
      discriminator: { propertyName: string };
    };

    expect(summary.discriminator.propertyName).toBe("kind");
    expect(summary.oneOf.map((ref) => ref.$ref)).toEqual([
      "#/components/schemas/PostSummary",
      "#/components/schemas/LinkSummary",
    ]);
    expect(spec.components.schemas.PostSummary).toBeDefined();
    expect(spec.components.schemas.LinkSummary).toBeDefined();
  });

  it("has no dangling $ref", () => {
    const refs = new Set<string>();
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        if (key === "$ref" && typeof value === "string") refs.add(value);
        else walk(value);
      }
    };
    walk(spec);

    expect(refs.size).toBeGreaterThan(0);
    for (const ref of refs) {
      const resolved = ref
        .replace(/^#\//, "")
        .split("/")
        .reduce<unknown>(
          (node, key) => (node as Record<string, unknown> | undefined)?.[key],
          spec as unknown,
        );
      expect(resolved, `${ref} should resolve`).toBeDefined();
    }
  });
});

describe("/docs", () => {
  it("renders a Swagger UI page pointed at the spec", async () => {
    const res = await SELF.fetch("https://example.com/docs");
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("SwaggerUIBundle");
    expect(body).toContain("/openapi.json");
  });

  // Swagger UI ships light-only, so /docs opts out of the site's theming
  // rather than carrying a hand-maintained dark palette for someone else's DOM.
  it("is pinned to light, whatever the visitor's theme", async () => {
    const body = await (await SELF.fetch("https://example.com/docs")).text();

    expect(body).toContain('<html lang="en" data-theme="light">');
    // Nothing that could move it off light: no stored-choice bootstrap, no
    // toggle, and not theme.js — which follows the OS while no choice is stored.
    expect(body).not.toContain("localStorage");
    expect(body).not.toContain("data-theme-toggle");
    expect(body).not.toContain('src="/theme.js"');
  });

  it("still reads the site's own tokens for its header strip", async () => {
    const body = await (await SELF.fetch("https://example.com/docs")).text();

    expect(body).toContain('href="/styles.css"');
    expect(body).toContain("bg-canvas");
  });
});
