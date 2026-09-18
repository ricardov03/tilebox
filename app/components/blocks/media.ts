/**
 * Pure helpers shared by the block components and the build scripts.
 * No Vue imports here: `scripts/*.ts` run this file with tsx.
 */
import { LOCAL_ICON_PATH as LOCAL_FAVICON, LOCAL_THUMB_PATH as LOCAL_THUMB } from '../../../types/local-paths'
import { brandIconFor } from '../../utils/brand-icons'

/** The `source` of an image block, as far as the credit line needs it. */
export interface ImageCreditSource {
  provider: 'pexels' | 'unsplash' | 'r2'
  url?: string
  author?: string
  authorUrl?: string
}

/** "Photo by {author} on {provider}". A `null` URL renders as plain text. */
export interface ImageCredit {
  author: string | null
  authorUrl: string | null
  provider: string | null
  providerUrl: string | null
}

const STOCK_PROVIDERS: Partial<Record<ImageCreditSource['provider'], { label: string, home: string }>> = {
  pexels: { label: 'Pexels', home: 'https://www.pexels.com' },
  unsplash: { label: 'Unsplash', home: 'https://unsplash.com' },
}

/**
 * The credit line of a photo tile (WP12). Pexels asks for a credit to the photographer and a link to
 * Pexels where possible, so a `pexels` source ALWAYS gives a line, also without an author, and there is
 * no switch to hide it. The provider link is the photo page (`source.url`), else the provider's home.
 * Only http(s) URLs become links. The URLs are used as they are: no tracking parameters are added.
 */
export function imageCredit(source: ImageCreditSource | null | undefined): ImageCredit | null {
  if (!source) return null
  const stock = STOCK_PROVIDERS[source.provider]
  const author = source.author?.trim() || null
  if (!stock && !author) return null
  return {
    author,
    authorUrl: author && source.authorUrl && isHttpUrl(source.authorUrl) ? source.authorUrl : null,
    provider: stock?.label ?? null,
    providerUrl: stock ? (source.url && isHttpUrl(source.url) ? source.url : stock.home) : null,
  }
}

/** Tile chrome variants. `accent` and `pop` have no border. */
export type TileVariant = 'tile' | 'accent' | 'pop'

/** Host of a URL without a leading `www.`. Empty for `mailto:` and invalid URLs. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  }
  catch {
    return ''
  }
}

/** Text shown as the "domain" line on a link tile. `mailto:` shows the address, `tel:` the number. */
export function domainLabel(url: string): string {
  const host = hostOf(url)
  if (host) return host
  return url.replace(/^(mailto|tel):/i, '').split('?')[0] ?? ''
}

/** True only for http(s) links. Those open in a new tab. */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** True for the schemes a tile may link to: http(s), mailto: and tel:. */
export function isSafeHref(url: string): boolean {
  return isHttpUrl(url) || /^(mailto|tel):/i.test(url)
}

/** YouTube video id for watch, shorts, embed, live and youtu.be URLs. `null` otherwise. */
export function youtubeId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return null
  }
  const host = parsed.hostname.replace(/^(www|m)\./, '')
  const valid = (value: string | null | undefined) => (value && /^[\w-]{11}$/.test(value) ? value : null)
  if (host === 'youtu.be') return valid(parsed.pathname.slice(1).split('/')[0])
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') return valid(parsed.searchParams.get('v'))
    const match = parsed.pathname.match(/^\/(?:embed|shorts|v|live)\/([\w-]{11})(?:[/?#]|$)/)
    return valid(match?.[1])
  }
  return null
}

/** Privacy-enhanced embed URL for a YouTube id. Autoplays because it loads after a click. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`
}

/** The icon a link tile shows. `source` says where it came from: only `manual` was picked by the owner. */
export type LinkIcon
  = | { kind: 'icon', name: string, source: 'manual' | 'brand' | 'fallback' }
    | { kind: 'favicon', src: string }

const FALLBACK_LINK_ICON = 'line-md:link'
// LOCAL_FAVICON / LOCAL_THUMB: only local files the unfurl engine wrote (PNG icons, webp images).
// A remote URL here would be a runtime network call.

/**
 * Icon of a link tile, in order (WP10a): the owner's `icon`, the brand icon
 * from the URL (no network), the local favicon file, then `line-md:link`.
 */
export function resolveLinkIcon(block: { url: string, icon?: string, favicon?: string }): LinkIcon {
  if (block.icon) return { kind: 'icon', name: block.icon, source: 'manual' }
  const brand = brandIconFor(block.url)
  if (brand) return { kind: 'icon', name: brand, source: 'brand' }
  if (block.favicon && LOCAL_FAVICON.test(block.favicon)) return { kind: 'favicon', src: block.favicon }
  return { kind: 'icon', name: FALLBACK_LINK_ICON, source: 'fallback' }
}

/** Where the website's image sits on a featured link tile. */
export type LinkImageLayout = 'top' | 'side'

/**
 * The featured look. `null` = a plain tile. The image shows only when the owner
 * turned `showImage` on, a local `/thumbs/*.webp` file is set, and the tile is
 * larger than 1x1: `2x2` and `1x2` put it on top, `2x1` on the right third.
 */
export function linkImageLayout(block: { size: string, showImage?: boolean, image?: string }): LinkImageLayout | null {
  if (!block.showImage || !block.image || !LOCAL_THUMB.test(block.image)) return null
  if (block.size === '2x2' || block.size === '1x2') return 'top'
  if (block.size === '2x1') return 'side'
  return null
}

/** Public URL of the fetched YouTube thumbnail, or `null` when the build did not fetch one. */
export function thumbPath(id: string, manifest: Readonly<Record<string, string>>): string | null {
  const file = manifest[id]
  return file ? `/thumbs/${file}` : null
}
