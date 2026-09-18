/**
 * Brand icon from a URL. WP10a, PLAN.md section 5.5.
 * A hand-made map: host -> full Iconify name. No network, no guessing.
 * `line-md` when the brand exists there, else `simple-icons`.
 * `scripts/check-icons.ts` checks every value: it must exist in the installed
 * pack and must not be marked `hidden` (simple-icons hides removed brands such
 * as linkedin, twitter, amazon, slack and codepen: never map to those).
 * Pure: no Vue or Node imports. nuxt.config.ts, the scripts and the app use it.
 */
import { MAILTO_PREFIX } from './mail-shield'

export const BRAND_ICONS: Readonly<Record<string, string>> = {
  // line-md
  'github.com': 'line-md:github',
  'linkedin.com': 'line-md:linkedin',
  'x.com': 'line-md:twitter-x',
  'twitter.com': 'line-md:twitter-x',
  'instagram.com': 'line-md:instagram',
  'youtube.com': 'line-md:youtube',
  'youtu.be': 'line-md:youtube',
  'facebook.com': 'line-md:facebook',
  'fb.com': 'line-md:facebook',
  'tiktok.com': 'line-md:tiktok',
  'discord.com': 'line-md:discord',
  'discord.gg': 'line-md:discord',
  'telegram.org': 'line-md:telegram',
  'telegram.me': 'line-md:telegram',
  't.me': 'line-md:telegram',
  'mastodon.social': 'line-md:mastodon',
  'joinmastodon.org': 'line-md:mastodon',
  'bsky.app': 'line-md:bluesky',
  'bsky.social': 'line-md:bluesky',
  'reddit.com': 'line-md:reddit',
  'spotify.com': 'line-md:spotify',
  'patreon.com': 'line-md:patreon',
  'buymeacoffee.com': 'line-md:buy-me-a-coffee',
  'soundcloud.com': 'line-md:soundcloud',
  // simple-icons
  'whatsapp.com': 'simple-icons:whatsapp',
  'wa.me': 'simple-icons:whatsapp',
  'threads.net': 'simple-icons:threads',
  'threads.com': 'simple-icons:threads',
  'twitch.tv': 'simple-icons:twitch',
  'medium.com': 'simple-icons:medium',
  'pinterest.com': 'simple-icons:pinterest',
  'pin.it': 'simple-icons:pinterest',
  'dribbble.com': 'simple-icons:dribbble',
  'behance.net': 'simple-icons:behance',
  'gitlab.com': 'simple-icons:gitlab',
  'stackoverflow.com': 'simple-icons:stackoverflow',
  'dev.to': 'simple-icons:devdotto',
  'hashnode.com': 'simple-icons:hashnode',
  'hashnode.dev': 'simple-icons:hashnode',
  'substack.com': 'simple-icons:substack',
  'music.apple.com': 'simple-icons:applemusic',
  'vimeo.com': 'simple-icons:vimeo',
  'figma.com': 'simple-icons:figma',
  'notion.so': 'simple-icons:notion',
  'notion.site': 'simple-icons:notion',
  'npmjs.com': 'simple-icons:npm',
  'producthunt.com': 'simple-icons:producthunt',
  'ko-fi.com': 'simple-icons:kofi',
  'paypal.com': 'simple-icons:paypal',
  'paypal.me': 'simple-icons:paypal',
  'calendly.com': 'simple-icons:calendly',
  'cal.com': 'simple-icons:caldotcom',
  'maps.google.com': 'simple-icons:googlemaps',
  'maps.app.goo.gl': 'simple-icons:googlemaps',
  'snapchat.com': 'simple-icons:snapchat',
  'signal.org': 'simple-icons:signal',
  'signal.me': 'simple-icons:signal',
  'steamcommunity.com': 'simple-icons:steam',
  'steampowered.com': 'simple-icons:steam',
  'bandcamp.com': 'simple-icons:bandcamp',
  'strava.com': 'simple-icons:strava',
  'letterboxd.com': 'simple-icons:letterboxd',
  'goodreads.com': 'simple-icons:goodreads',
  'gumroad.com': 'simple-icons:gumroad',
  'huggingface.co': 'simple-icons:huggingface',
}

/**
 * Icons for links that are not web pages. The mail scheme comes from `MAILTO_PREFIX`,
 * because the literal string may be in no file of `dist/` (WP17, docs/invariants.md).
 */
/**
 * The icon of a mail link. ONE definition (WP20): the PUBLIC copy of a mail tile carries a
 * `mail` token and no url, so `resolveLinkIcon` cannot ask `brandIconFor` for the scheme any
 * more and reads this constant instead. `NETWORKS.email` and `UI_ICONS.email` are the same name.
 */
export const MAIL_ICON = 'line-md:email'

const SCHEME_ICONS: Readonly<Record<string, string>> = {
  [MAILTO_PREFIX]: MAIL_ICON,
  'tel:': 'line-md:phone',
}

/**
 * The brand icon for a URL, or `undefined`.
 * Host in lower case, without `www.`. The full host first, then each parent
 * domain (`open.spotify.com` -> `spotify.com`), never the bare TLD.
 */
export function brandIconFor(url: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  }
  catch {
    return undefined
  }
  const scheme = SCHEME_ICONS[parsed.protocol]
  if (scheme) return scheme
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  const labels = parsed.hostname.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean)
  for (let start = 0; start < labels.length - 1; start++) {
    const candidate = labels.slice(start).join('.')
    if (Object.hasOwn(BRAND_ICONS, candidate)) return BRAND_ICONS[candidate]
  }
  return undefined
}

/** Every icon the map can return, sorted and unique. For `scripts/check-icons.ts`. */
export function allBrandIcons(): string[] {
  return [...new Set([...Object.values(BRAND_ICONS), ...Object.values(SCHEME_ICONS)])].sort()
}
