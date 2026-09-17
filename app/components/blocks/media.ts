/**
 * Pure helpers shared by the block components and the build scripts.
 * No Vue imports here: `scripts/*.ts` run this file with tsx.
 */

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

/** Text shown as the "domain" line on a link tile. `mailto:` shows the address. */
export function domainLabel(url: string): string {
  const host = hostOf(url)
  if (host) return host
  return url.replace(/^mailto:/i, '').split('?')[0] ?? ''
}

/** True only for http(s) links. Those open in a new tab. */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
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
    const match = parsed.pathname.match(/^\/(?:embed|shorts|v|live)\/([\w-]{11})/)
    return valid(match?.[1])
  }
  return null
}

/** Privacy-enhanced embed URL for a YouTube id. Autoplays because it loads after a click. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`
}

/** Public URL of the fetched favicon for a host, or `null` when the build did not fetch one. */
export function faviconPath(host: string, manifest: Readonly<Record<string, string>>): string | null {
  const file = manifest[host]
  return file ? `/icons/${file}` : null
}

/** Public URL of the fetched YouTube thumbnail, or `null` when the build did not fetch one. */
export function thumbPath(id: string, manifest: Readonly<Record<string, string>>): string | null {
  const file = manifest[id]
  return file ? `/thumbs/${file}` : null
}
