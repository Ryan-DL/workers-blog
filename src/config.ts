/**
 * Config types, the social-platform registry, and the logic that turns a
 * user's `blog.config.ts` into what the templates actually render.
 *
 * You don't edit this file to configure the blog — edit `blog.config.ts` at
 * the repo root. This is the machinery behind it.
 */

/** Inline SVG path data drawn on a 24x24 viewBox. */
type IconPath = string;

export interface SocialProvider {
  label: string;
  icon: IconPath;
  /** Turns a bare handle into a URL. Full URLs bypass this entirely. */
  fromHandle: (handle: string) => string;
}

/**
 * Platforms you can configure by handle alone.
 *
 * Every field also accepts a full `https://` URL, which is used as-is — so an
 * unusual profile URL, or a platform not listed here, is never a dead end.
 */
export const SOCIAL_PROVIDERS = {
  github: {
    label: "GitHub",
    fromHandle: (handle) => `https://github.com/${handle}`,
    icon: "M12 2A10 10 0 0 0 8.84 21.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.16.59.67.5A10 10 0 0 0 12 2Z",
  },
  x: {
    label: "X",
    fromHandle: (handle) => `https://x.com/${handle.replace(/^@/, "")}`,
    icon: "M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.6-8.7L1.7 2h6.7l4.7 6.2L18.9 2Zm-1.1 18h1.7L7.3 3.7H5.4L17.8 20Z",
  },
  bluesky: {
    label: "Bluesky",
    fromHandle: (handle) => `https://bsky.app/profile/${handle.replace(/^@/, "")}`,
    icon: "M5.8 4.2C8.4 6.1 11.2 10 12 12.2c.8-2.2 3.6-6.1 6.2-8 1.9-1.4 4.8-2.4 4.8.9 0 .7-.4 5.5-.6 6.3-.7 2.7-3.4 3.4-5.9 3 4.3.7 5.4 3.2 3 5.6-4.4 4.6-6.4-1.2-6.9-2.7-.1-.3-.2-.4-.2-.3 0-.1 0 .1-.2.3-.5 1.5-2.5 7.3-6.9 2.7-2.4-2.4-1.3-4.9 3-5.6-2.5.4-5.2-.3-5.9-3-.2-.8-.6-5.6-.6-6.3 0-3.3 2.9-2.3 4.8-.9Z",
  },
  mastodon: {
    label: "Mastodon",
    // Handles look like @you@instance.social; the instance is the host.
    fromHandle: (handle) => {
      const [, user, host] = handle.match(/^@?([^@]+)@(.+)$/) ?? [];
      return user && host ? `https://${host}/@${user}` : `https://mastodon.social/@${handle.replace(/^@/, "")}`;
    },
    icon: "M21.6 8.9c0-4-2.6-5.1-2.6-5.1C17.7 3.2 15.5 3 13.2 3h-.1c-2.3 0-4.5.2-5.8.8 0 0-2.6 1.1-2.6 5.1v3.4c0 4.4.7 8.7 6 10.1 1.5.4 2.8.5 3.8.4 1.9-.1 2.9-.6 2.9-.6l-.1-1.4s-1.3.4-2.9.4c-1.6-.1-3.2-.2-3.5-2.1v-.6c3.3.8 6.2.4 7-.1 2.2-.3 3.7-2.2 3.7-4.6V8.9Zm-3 4.9h-1.9V9.2c0-1-.4-1.5-1.2-1.5-.9 0-1.4.6-1.4 1.8v2.4h-1.9V9.5c0-1.2-.4-1.8-1.3-1.8-.9 0-1.3.5-1.3 1.5v4.6H7.7V9.1c0-1 .3-1.8.8-2.4.5-.6 1.2-.9 2.1-.9 1 0 1.8.4 2.3 1.2l.5.8.5-.8c.5-.8 1.3-1.2 2.3-1.2.9 0 1.6.3 2.1.9.5.6.8 1.4.8 2.4v4.7Z",
  },
  linkedin: {
    label: "LinkedIn",
    fromHandle: (handle) => `https://www.linkedin.com/in/${handle}`,
    icon: "M6.94 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM3.2 8.5h3.5V21H3.2V8.5Zm5.9 0h3.35v1.7h.05c.47-.85 1.6-1.75 3.3-1.75 3.53 0 4.2 2.2 4.2 5.1V21h-3.5v-6.1c0-1.45-.03-3.3-2.05-3.3-2.05 0-2.36 1.57-2.36 3.2V21H9.1V8.5Z",
  },
  youtube: {
    label: "YouTube",
    fromHandle: (handle) => `https://youtube.com/@${handle.replace(/^@/, "")}`,
    icon: "M23 12s0-3.9-.5-5.8a3 3 0 0 0-2.1-2.1C18.5 3.6 12 3.6 12 3.6s-6.5 0-8.4.5A3 3 0 0 0 1.5 6.2C1 8.1 1 12 1 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 8.4.5 8.4.5s6.5 0 8.4-.5a3 3 0 0 0 2.1-2.1C23 15.9 23 12 23 12ZM9.9 15.6V8.4l6.3 3.6-6.3 3.6Z",
  },
  email: {
    label: "Email",
    fromHandle: (handle) => `mailto:${handle}`,
    icon: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1.5 2.2v.6l7.5 5 7.5-5v-.6L12 11.9 4.5 7.2Z",
  },
  website: {
    label: "Website",
    fromHandle: (handle) => (handle.includes("://") ? handle : `https://${handle}`),
    icon: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-2.95a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8ZM12 4.1c.7 1 1.3 2.2 1.7 3.9h-3.4c.4-1.7 1-2.9 1.7-3.9ZM4.3 14a8 8 0 0 1 0-4h3.4a17 17 0 0 0 0 4H4.3Zm.8 2h2.95c.35 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16Zm2.95-8H5.1a8 8 0 0 1 4.35-3.6A15.7 15.7 0 0 0 8.05 8ZM12 19.9c-.7-1-1.3-2.2-1.7-3.9h3.4c-.4 1.7-1 2.9-1.7 3.9Zm2.1-5.9H9.9a15 15 0 0 1 0-4h4.2a15 15 0 0 1 0 4Zm.45 5.6c.6-1.1 1.05-2.3 1.4-3.6h2.95a8 8 0 0 1-4.35 3.6ZM16.3 14a17 17 0 0 0 0-4h3.4a8 8 0 0 1 0 4h-3.4Z",
  },
} as const satisfies Record<string, SocialProvider>;

export type SocialKey = keyof typeof SOCIAL_PROVIDERS;

/** A social profile, resolved and ready to render. */
export interface SocialLink {
  label: string;
  href: string;
  icon: IconPath;
}

export interface BlogConfig {
  /** Shown in the header, page titles, and the feed. */
  title: string;
  description: string;
  /**
   * Canonical origin, e.g. "https://blog.example.com".
   *
   * Leave it empty and every absolute URL is derived from the incoming
   * request instead — which is correct in local dev and on your real domain
   * alike. Set it only if you serve the same site on several hostnames and
   * want one of them to win.
   */
  url?: string;
  /** BCP 47 tag for <html lang> and the feed. */
  language?: string;

  author: {
    name: string;
    /** One line under the name on the about page. */
    tagline: string;
    /** Paragraphs of about-page copy. */
    bio: string[];
    /** Path or URL to a portrait. */
    avatar: string;
    avatarAlt: string;
  };

  /**
   * Handles or full URLs, keyed by platform. **Anything empty is omitted** —
   * delete a line or leave it as "" and that icon simply won't render.
   */
  socials: Partial<Record<SocialKey, string>>;

  /** Anything the registry doesn't cover. Same omit-if-blank rule. */
  extraSocials?: { label: string; href: string; icon?: IconPath }[];

  /** Whether the RSS icon appears alongside the socials. */
  showRssLink?: boolean;

  /** Header navigation. Order is preserved. */
  nav: { label: string; href: string }[];
}

const RSS_ICON =
  "M5 3a16 16 0 0 1 16 16h-3A13 13 0 0 0 5 6V3Zm0 6a10 10 0 0 1 10 10h-3A7 7 0 0 0 5 12V9Zm2.5 6.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z";

const GENERIC_ICON =
  "M10.6 13.4a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2 1.4 1.4 1.2-1.2a2 2 0 0 1 2.9 2.9l-3 3a2 2 0 0 1-2.9 0l-1.4 1.4Zm2.8-2.8a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2-1.4-1.4-1.2 1.2a2 2 0 0 1-2.9-2.9l3-3a2 2 0 0 1 2.9 0l1.4-1.4Z";

/** Blank, whitespace-only, and unset all mean "don't show this". */
function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim() === "";
}

/**
 * Turn the configured handles into renderable links.
 *
 * Order follows SOCIAL_PROVIDERS rather than the order keys happen to appear
 * in the config object, so the footer looks the same however someone writes
 * their config. Blanks are dropped, so a half-filled config renders cleanly
 * instead of linking to a profile page for nobody.
 */
export function resolveSocials(config: BlogConfig): SocialLink[] {
  const links: SocialLink[] = [];

  for (const [key, provider] of Object.entries(SOCIAL_PROVIDERS) as [
    SocialKey,
    SocialProvider,
  ][]) {
    const value = config.socials[key];
    if (isBlank(value)) continue;

    const handle = value!.trim();
    // A full URL is taken at face value; anything else is a handle.
    const href = /^(https?:\/\/|mailto:)/i.test(handle)
      ? handle
      : provider.fromHandle(handle);

    links.push({ label: provider.label, href, icon: provider.icon });
  }

  for (const extra of config.extraSocials ?? []) {
    if (isBlank(extra.href) || isBlank(extra.label)) continue;
    links.push({
      label: extra.label.trim(),
      href: extra.href.trim(),
      icon: extra.icon ?? GENERIC_ICON,
    });
  }

  // The feed always exists, so this one needs no configuring — only opting out.
  if (config.showRssLink !== false) {
    links.push({ label: "RSS", href: "/feed.xml", icon: RSS_ICON });
  }

  return links;
}

/** Everything a template needs about the site, resolved for one request. */
export interface Site {
  title: string;
  description: string;
  /** Absolute origin with no trailing slash. */
  url: string;
  language: string;
  socials: SocialLink[];
  author: BlogConfig["author"];
  nav: BlogConfig["nav"];
}

/**
 * Resolve config against the request.
 *
 * Deriving the origin from the request is what stops the classic mistake of
 * deploying with a hardcoded localhost URL in the feed and the sitemap.
 */
export function resolveSite(config: BlogConfig, requestUrl: string): Site {
  const origin = isBlank(config.url)
    ? new URL(requestUrl).origin
    : config.url!.trim().replace(/\/$/, "");

  return {
    title: config.title,
    description: config.description,
    url: origin,
    language: config.language?.trim() || "en",
    socials: resolveSocials(config),
    author: config.author,
    nav: config.nav,
  };
}
