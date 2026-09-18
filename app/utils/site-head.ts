/**
 * The `<head>` of the public page, as plain data (WP10b). Pure: no Vue, no Nuxt,
 * no file access. `useSiteHead()` passes the result to `useHead()`, the tests
 * and the asset builder (content/site-assets.ts) call it directly.
 *
 * Site URL precedence: `NUXT_PUBLIC_SITE_URL` (the build env, `npm run publish`
 * sets it) > `site.url` > '' (unknown: no canonical, no og:url, a relative og:image).
 */
import type { PublicProfile } from '../../types/profile'
import { SITE_DEFAULT_LANG, type PublicSite, type Site } from '../../types/site'
import { withoutUtm } from './utm'

/** Tracked fallbacks, used when `public/site/` has no generated file. */
export const FALLBACK_OG_IMAGE = '/og.png'
export const FALLBACK_FAVICON = '/favicon.ico'
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

export interface HeadMeta {
  name?: string
  property?: string
  content: string
}

export interface HeadLink {
  rel: string
  href: string
  type?: string
  sizes?: string
}

export interface HeadScript {
  key: string
  type: 'application/ld+json'
  innerHTML: string
}

export interface SiteHead {
  htmlAttrs: { lang: string }
  title: string
  meta: HeadMeta[]
  link: HeadLink[]
  script: HeadScript[]
}

/** `ricardov` for `@ricardov`. */
export function cleanHandle(handle: string): string {
  return handle.trim().replace(/^@+/, '')
}

/** `Name (@handle)`, or the name alone when the handle is empty. */
export function defaultSiteTitle(info: { name: string, handle: string }): string {
  const handle = cleanHandle(info.handle)
  return handle ? `${info.name} (@${handle})` : info.name
}

export function siteTitle(info: { name: string, handle: string }, site?: Site | PublicSite): string {
  return site?.title?.trim() || defaultSiteTitle(info)
}

export function siteDescription(info: { bio: string }, site?: Site | PublicSite): string {
  return site?.description?.trim() || info.bio.trim()
}

/** The env value wins, then `site.url`. No trailing slash. '' = unknown. Only http(s) counts. */
export function resolveSiteUrl(envUrl: string | undefined, site?: Site | PublicSite): string {
  for (const candidate of [envUrl, site?.url]) {
    const value = (candidate ?? '').trim().replace(/\/+$/, '')
    if (/^https?:\/\/[^/\s]+/i.test(value)) return value
  }
  return ''
}

/** `example.com` or `example.com/me` for the preview cards. '' when the URL is unknown. */
export function siteHost(siteUrl: string): string {
  return siteUrl.replace(/^https?:\/\//i, '')
}

/** First word + the rest, only for a name of 2 or more words. */
export function splitName(name: string): { first: string, last: string } | null {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const [first, ...rest] = words
  if (!first || rest.length === 0) return null
  return { first, last: rest.join(' ') }
}

/** Up to 2 letters for the initials tile, same rule as ProfileHeader.vue: the first 2 words. `?` for an empty name. */
export function initialsOf(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => [...word][0] ?? '')
  return letters.join('').toUpperCase() || '?'
}

const DEFAULT_TERRITORY: Record<string, string> = {
  en: 'US', es: 'ES', pt: 'BR', fr: 'FR', de: 'DE', it: 'IT', nl: 'NL', ja: 'JP', ko: 'KR', zh: 'CN',
}

/** `en` -> `en_US`, `pt-BR` -> `pt_BR`. `undefined` when no territory is known. */
export function ogLocale(lang: string): string | undefined {
  const [language, ...rest] = lang.split('-')
  if (!language) return undefined
  const region = rest.find(part => /^([a-z]{2}|\d{3})$/i.test(part))
  const territory = region?.toUpperCase() ?? DEFAULT_TERRITORY[language.toLowerCase()]
  return territory ? `${language.toLowerCase()}_${territory}` : undefined
}

/** JSON for an inline `<script>`: `<` is escaped, so `</script>` in a bio can never close the tag. */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
}

/** A root-relative path gets the site URL in front of it when it is known. */
function absolute(path: string, siteUrl: string): string {
  if (/^https?:\/\//i.test(path) || !siteUrl) return path
  return `${siteUrl}${path.startsWith('/') ? '' : '/'}${path}`
}

/** Every http(s) URL of the social blocks of the PUBLIC profile, unique, in block order. */
export function sameAsOf(profile: PublicProfile): string[] {
  const urls = profile.blocks.flatMap((block) => {
    if (block.type !== 'social' || !/^https?:\/\//i.test(block.url)) return []
    // A block hidden from the page is not public (the `hidden` flag of the link blocks work package).
    if ('hidden' in block && block.hidden === true) return []
    // WP11: the build may have added UTM tags to the link. An identity URL carries no tracking.
    return [withoutUtm(block.url)]
  })
  return [...new Set(urls)]
}

export function buildJsonLd(profile: PublicProfile, siteUrl: string): Record<string, unknown> {
  const info = profile.profile
  const site = profile.site
  const handle = cleanHandle(info.handle)
  const sameAs = sameAsOf(profile)
  const person: Record<string, unknown> = {
    '@type': 'Person',
    'name': info.name,
    ...(handle ? { alternateName: handle } : {}),
    ...(info.bio.trim() ? { description: info.bio.trim() } : {}),
    ...(info.avatar ? { image: absolute(info.avatar, siteUrl) } : {}),
    ...(siteUrl ? { url: `${siteUrl}/` } : {}),
    ...(site?.jobTitle ? { jobTitle: site.jobTitle } : {}),
    ...(site?.location ? { address: { '@type': 'PostalAddress', 'addressLocality': site.location } } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    ...(site?.builtAt ? { dateModified: site.builtAt } : {}),
    'mainEntity': person,
  }
}

/**
 * The whole head of the public page. `envSiteUrl` is `NUXT_PUBLIC_SITE_URL`
 * ('' when it is not set); `site.url` is the second choice.
 * The theme-color metas are not here: useTheme owns them.
 */
export function buildHead(profile: PublicProfile, envSiteUrl: string = ''): SiteHead {
  const info = profile.profile
  const site = profile.site
  const assets = site?.assets ?? {}
  const siteUrl = resolveSiteUrl(envSiteUrl, site)
  const title = siteTitle(info, site)
  const description = siteDescription(info, site)
  const lang = site?.lang || SITE_DEFAULT_LANG
  const locale = ogLocale(lang)
  const handle = cleanHandle(info.handle)
  const names = splitName(info.name)
  const xHandle = site?.xHandle ? `@${site.xHandle}` : null

  const meta: HeadMeta[] = [
    ...(description ? [{ name: 'description', content: description }] : []),
    ...(site?.noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
    { property: 'og:type', content: 'profile' },
    { property: 'og:title', content: title },
    ...(description ? [{ property: 'og:description', content: description }] : []),
    ...(siteUrl ? [{ property: 'og:url', content: `${siteUrl}/` }] : []),
    { property: 'og:site_name', content: info.name },
    ...(locale ? [{ property: 'og:locale', content: locale }] : []),
    { property: 'og:image', content: absolute(assets.ogImage ?? FALLBACK_OG_IMAGE, siteUrl) },
    { property: 'og:image:width', content: String(OG_IMAGE_WIDTH) },
    { property: 'og:image:height', content: String(OG_IMAGE_HEIGHT) },
    { property: 'og:image:alt', content: `Preview card of ${info.name}` },
    ...(handle ? [{ property: 'profile:username', content: handle }] : []),
    ...(names
      ? [
          { property: 'profile:first_name', content: names.first },
          { property: 'profile:last_name', content: names.last },
        ]
      : []),
    { name: 'twitter:card', content: 'summary_large_image' },
    ...(xHandle
      ? [
          { name: 'twitter:site', content: xHandle },
          { name: 'twitter:creator', content: xHandle },
        ]
      : []),
  ]

  const link: HeadLink[] = [
    ...(siteUrl ? [{ rel: 'canonical', href: `${siteUrl}/` }] : []),
    { rel: 'icon', href: assets.faviconIco ?? FALLBACK_FAVICON, sizes: '32x32' },
    ...(assets.iconSvg ? [{ rel: 'icon', href: assets.iconSvg, type: 'image/svg+xml' }] : []),
    ...(assets.icon192 ? [{ rel: 'icon', href: assets.icon192, type: 'image/png', sizes: '192x192' }] : []),
    ...(assets.appleTouchIcon ? [{ rel: 'apple-touch-icon', href: assets.appleTouchIcon }] : []),
    ...(assets.manifest ? [{ rel: 'manifest', href: assets.manifest }] : []),
  ]

  return {
    htmlAttrs: { lang },
    title,
    meta,
    link,
    script: [{ key: 'tilebox-jsonld', type: 'application/ld+json', innerHTML: jsonForScript(buildJsonLd(profile, siteUrl)) }],
  }
}
