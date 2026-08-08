import type { HtmlEscapedString } from "hono/utils/html";

/**
 * What Hono's `html` tagged template actually returns.
 *
 * It's a union because an interpolated value may be a Promise. Ours never are,
 * but the type has to admit the possibility, and `c.html()` accepts both.
 */
export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;
