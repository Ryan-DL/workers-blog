import type { BlogConfig } from "./src/config";

/**
 * Everything about this blog that isn't a post.
 *
 * This is the only file you need to edit to make the site yours. Nothing here
 * is required to be filled in except `title`, `description`, `author`, and
 * `nav` — every social link is optional, and **anything left blank is simply
 * not rendered**.
 *
 * `npm run typecheck` will tell you if you mistype a key.
 */
export default {
  title: "blog-part2",
  description: "A blog on Cloudflare Workers",

  // Leave empty to derive every absolute URL from the incoming request — right
  // in local dev and on your real domain alike. Set it only to pin a canonical
  // origin when the site answers on more than one hostname.
  url: "",

  language: "en",

  author: {
    name: "Ryan",
    tagline: "Engineer. I write about the edge, databases, and things that surprised me.",
    bio: [
      "This is placeholder copy. Replace it with your own — each string in this array becomes a paragraph on the about page.",
      "The site runs on Cloudflare Workers. Posts are Markdown files compiled into the Worker at build time, so serving one is a lookup rather than a database query. Links to writing published elsewhere share the same timeline.",
    ],
    // Drop a real photo in public/ and point this at it, e.g. "/me.jpg".
    avatar: "/avatar.svg",
    avatarAlt: "Placeholder portrait",
  },

  /**
   * Each value is either a bare handle or a full URL — both work.
   * Delete a line, or leave it "", and that icon won't appear in the footer.
   */
  socials: {
    github: "Ryan-Dl",
    x: "",
    bluesky: "",
    mastodon: "",
    linkedin: "",
    youtube: "",
    email: "",
    website: "",
  },

  // Anything the built-in list doesn't cover.
  // extraSocials: [{ label: "Ko-fi", href: "https://ko-fi.com/you" }],

  showRssLink: true,

  nav: [
    { label: "Writing", href: "/" },
    { label: "About", href: "/about" },
    { label: "API", href: "/docs" },
  ],
} satisfies BlogConfig;
