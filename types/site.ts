/**
 * Site metadata (WP10b). The optional top-level `site` object of the profile.
 * Absent = defaults: title = name (+ ` (@handle)`), description = bio, lang `en`.
 * Its own file, imported by ./profile.ts. Pure: zod only, safe for the client.
 */
import { z } from 'zod'
import { UTM_VALUE } from '../app/utils/utm'

export const SITE_TITLE_MAX = 70
export const SITE_DESCRIPTION_MAX = 160
export const SITE_DEFAULT_LANG = 'en'

/** `https://host` or `https://host/path`. No trailing slash, no query, no hash. */
export function isSiteUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value) || value.endsWith('/')) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname !== '' && parsed.search === '' && parsed.hash === ''
      && parsed.username === '' && parsed.password === ''
  }
  catch {
    return false
  }
}

/** A file under `public/`, as the page sees it: `/site-uploads/icon.png`. No `..`, no query. */
const localPath = (extensions: string) => z.string().regex(
  new RegExp(`^/(?!.*\\.\\.)[^?#\\\\]+\\.(${extensions})$`, 'i'),
  `Must be a local path that starts with / and ends with .${extensions.split('|').join(', .')}`,
)

/** Lowercase letters, digits, `_` and `-`, 40 at most: a value that never needs escaping in a URL. */
const utmValue = z.string().regex(UTM_VALUE, 'Use lowercase letters, digits, _ and - (40 at most)')

export const SiteSchema = z.object({
  /** `<title>` and og:title. Default: the name, plus ` (@handle)`. */
  title: z.string().min(1).max(SITE_TITLE_MAX).optional(),
  /** Meta description and og:description. Default: the bio. */
  description: z.string().min(1).max(SITE_DESCRIPTION_MAX).optional(),
  /** The public address. `NUXT_PUBLIC_SITE_URL` wins over it (README, "Site metadata"). */
  url: z.string().refine(isSiteUrl, 'Must be an https URL without a trailing slash, for example https://example.com').optional(),
  /** BCP 47 language tag for `<html lang>`. Default `en`. */
  lang: z.string().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i, 'Must be a language tag like en, es or pt-BR').optional(),
  /** true = `<meta name="robots" content="noindex, nofollow">`. Default false. */
  noindex: z.boolean().optional(),
  /** An uploaded social preview image. It wins over the generated one. */
  ogImage: localPath('png|jpg|jpeg|webp').optional(),
  /** An uploaded square favicon source. It wins over the avatar and the initials. No `svg`: the upload route stores an SVG as a PNG. */
  favicon: localPath('png|jpg|jpeg|webp').optional(),
  /** X (Twitter) user name without the @. */
  xHandle: z.string().regex(/^[a-z0-9_]{1,15}$/i, 'Must be an X user name without the @').optional(),
  jobTitle: z.string().min(1).max(100).optional(),
  location: z.string().min(1).max(100).optional(),
  /** The share button on the profile tile (WP11). Absent = true. `false` removes it. */
  share: z.boolean().optional(),
  /** UTM tags the BUILD adds to external links (WP11, app/utils/utm.ts). The stored URLs stay clean. Absent = none. */
  utm: z.object({
    source: utmValue,
    medium: utmValue,
    campaign: utmValue.optional(),
  }).strict().optional(),
}).strict()

export type Site = z.infer<typeof SiteSchema>

/**
 * The files of `public/site/` that exist, as public paths (`/site/og.png`).
 * A missing key = the file is not there, the head uses the tracked fallback.
 */
export const SiteAssetsSchema = z.object({
  ogImage: z.string().optional(),
  faviconIco: z.string().optional(),
  iconSvg: z.string().optional(),
  icon192: z.string().optional(),
  appleTouchIcon: z.string().optional(),
  manifest: z.string().optional(),
  /** `/site/contact.vcf` (WP11). Missing = the build drops every `contact` block. */
  contactCard: z.string().optional(),
  /** `/site/qr.svg` (WP11). Missing = the build drops every `qr` block. */
  qrCode: z.string().optional(),
}).strict()

export type SiteAssets = z.infer<typeof SiteAssetsSchema>

/** Build-time facts that `toPublicProfile()` adds to `site`. */
export interface PublicSiteExtras {
  assets?: SiteAssets
  /** ISO date of the build. JSON-LD `dateModified`. */
  builtAt?: string
}

/** What the public page gets: the fields, the generated asset paths, the build date. No upload paths, no `utm` (it is already inside the links). */
export const PublicSiteSchema = SiteSchema
  .omit({ ogImage: true, favicon: true, utm: true })
  .extend({ assets: SiteAssetsSchema.optional(), builtAt: z.string().optional() })
  .strict()

export type PublicSite = z.infer<typeof PublicSiteSchema>

/** Pure. The upload paths are dropped: the page only needs the generated files. */
export function toPublicSite(site: Site | undefined, extras: PublicSiteExtras = {}): PublicSite {
  const { ogImage: _ogImage, favicon: _favicon, utm: _utm, ...rest } = site ?? {}
  return {
    ...rest,
    ...(extras.assets ? { assets: extras.assets } : {}),
    ...(extras.builtAt ? { builtAt: extras.builtAt } : {}),
  }
}
