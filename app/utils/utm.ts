/**
 * UTM tags at build time (WP11). Pure: no Vue, no Node. Used by
 * `toPublicProfile()`, the JSON-LD `sameAs` list, the editor and the tests.
 *
 * The stored URLs stay clean. The build adds `utm_source`, `utm_medium` and
 * `utm_campaign` to EXTERNAL http(s) links only. It never replaces a parameter
 * that is already in the URL, and it never touches `mailto:`, `tel:`, a local
 * path or a link to the site itself.
 */

export interface UtmSettings {
  source: string
  medium: string
  campaign?: string
}

/** Lowercase letters, digits, `_` and `-`. 1 to 40 characters. So no value ever needs escaping. */
export const UTM_VALUE = /^[a-z0-9_-]{1,40}$/

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const

function parse(url: string): URL | null {
  try {
    return new URL(url)
  }
  catch {
    return null
  }
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, '')

/** True for an http(s) URL on another host than the site. `siteUrl` '' = every http(s) URL is external. */
export function isExternalHttpUrl(url: string, siteUrl: string = ''): boolean {
  const parsed = parse(url)
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) return false
  const site = siteUrl ? parse(siteUrl) : null
  return !site || bareHost(parsed.hostname) !== bareHost(site.hostname)
}

/**
 * The URL with the UTM parameters that are not in it yet. The rest of the text
 * stays as it was typed (no re-encoding of the query, the hash stays last).
 */
export function withUtm(url: string, utm: UtmSettings | undefined, siteUrl: string = ''): string {
  if (!utm || !isExternalHttpUrl(url, siteUrl)) return url
  const parsed = parse(url)
  if (!parsed) return url
  const values: Record<(typeof UTM_KEYS)[number], string | undefined> = {
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
  }
  const pairs = UTM_KEYS.flatMap((key) => {
    const value = values[key]
    if (!value || !UTM_VALUE.test(value) || parsed.searchParams.has(key)) return []
    return [`${key}=${value}`]
  })
  if (pairs.length === 0) return url
  const hashAt = url.indexOf('#')
  const base = hashAt === -1 ? url : url.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : url.slice(hashAt)
  const joiner = !base.includes('?') ? '?' : /[?&]$/.test(base) ? '' : '&'
  return `${base}${joiner}${pairs.join('&')}${hash}`
}

/** The URL without `utm_source`, `utm_medium` and `utm_campaign`. For JSON-LD `sameAs`: an identity URL carries no tracking. */
export function withoutUtm(url: string): string {
  const hashAt = url.indexOf('#')
  const base = hashAt === -1 ? url : url.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : url.slice(hashAt)
  const queryAt = base.indexOf('?')
  if (queryAt === -1) return url
  const kept = base.slice(queryAt + 1).split('&').filter(pair => !/^utm_(source|medium|campaign)=/i.test(pair))
  return `${base.slice(0, queryAt)}${kept.length ? `?${kept.join('&')}` : ''}${hash}`
}
