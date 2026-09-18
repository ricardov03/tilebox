/**
 * Dead-link check (WP11). `npm run check:links`, `npm run publish` and the
 * dev-only route `POST /api/links/check` share this module.
 *
 * Every request goes through the SAME guarded request as the link previews
 * (`safeRequest()` in ./unfurl.ts, docs/security.md): public unicast addresses
 * only, the pinned IP, ports 80 and 443, redirects by hand with a check per hop,
 * 8 s per hop, the honest user agent. One budget per URL (20 s, 8 redirects).
 *
 * Per URL: a HEAD; on 403, 405 or 501 (the site refuses HEAD) one GET that reads 1 KB at most.
 * - `ok`: 2xx or 3xx.
 * - `blocked`: 401, 403, 429 and the other 4xx. The site blocks checks. The link is probably fine.
 * - `broken`: 404, 410, 5xx, DNS failure, timeout, bad certificate, a refused address.
 * It never throws and never fails a build: a warning list, nothing else.
 *
 * No Vue or Nuxt imports: tsx runs this file.
 */
import type { Profile } from '../types/profile'
import { newBudget, safeRequest, UnfurlError, type UnfurlOptions } from './unfurl'

export type LinkStatus = 'ok' | 'blocked' | 'broken'

export interface LinkCheckResult {
  url: string
  /** Ids of the blocks that use the URL. `contact` = the vCard URL. */
  blockIds: string[]
  status: LinkStatus
  /** `http 404`, `timeout`, `bad certificate`, `site blocks checks, probably fine`... */
  reason: string
}

export interface LinkTarget {
  url: string
  blockIds: string[]
}

export const MAX_LINKS = 60
export const LINK_CHECK_CONCURRENCY = 4
const MAX_GET_BYTES = 1024
/** A HEAD these sites answer with means "HEAD is not welcome", not "the page is gone". */
const RETRY_WITH_GET = new Set([403, 405, 501])
const BLOCKED_NOTE = 'site blocks checks, probably fine'

const isHttp = (url: string) => /^https?:\/\//i.test(url)

/**
 * Every external http(s) URL of the profile, unique, in block order, `MAX_LINKS` at most.
 * The ORIGINAL URLs: no UTM tags (the build adds them later). Hidden blocks too: the owner may show them again.
 */
export function linkTargets(profile: Profile, max: number = MAX_LINKS): LinkTarget[] {
  const byUrl = new Map<string, string[]>()
  const add = (url: string | undefined, id: string) => {
    if (!url || !isHttp(url)) return
    const ids = byUrl.get(url) ?? []
    if (!ids.includes(id)) ids.push(id)
    byUrl.set(url, ids)
  }
  for (const block of profile.blocks) {
    if (block.type === 'link' || block.type === 'social' || block.type === 'map' || block.type === 'video') add(block.url, block.id)
    if (block.type === 'image') add(block.source?.url, block.id)
  }
  if (profile.contact?.enabled) add(profile.contact.url, 'contact')
  return [...byUrl.entries()].slice(0, max).map(([url, blockIds]) => ({ url, blockIds }))
}

/** Pure. The class and the reason of one HTTP status. */
export function classifyStatus(status: number): { status: LinkStatus, reason: string } {
  if (status >= 200 && status < 400) return { status: 'ok', reason: `http ${status}` }
  if (status === 404 || status === 410 || status >= 500) return { status: 'broken', reason: `http ${status}` }
  return { status: 'blocked', reason: `http ${status}: ${BLOCKED_NOTE}` }
}

/** One URL. `options` carries the test hooks of the engine (`transport`, `lookup`, `allowHosts`) and the caller's `signal`. */
export async function checkLink(url: string, options: UnfurlOptions = {}): Promise<{ status: LinkStatus, reason: string }> {
  // One budget for the HEAD and the GET of this URL: 20 s and 8 redirects in total.
  const shared: UnfurlOptions = { ...options, budget: newBudget(options.signal) }
  try {
    const head = await safeRequest(url, { method: 'HEAD', accept: '*/*', maxBytes: 0, overflow: 'cut' }, shared)
    if (!RETRY_WITH_GET.has(head.status)) return classifyStatus(head.status)
    const get = await safeRequest(url, { method: 'GET', accept: '*/*', maxBytes: MAX_GET_BYTES, overflow: 'cut' }, shared)
    return classifyStatus(get.status)
  }
  catch (error) {
    return { status: 'broken', reason: error instanceof UnfurlError ? error.reason : 'offline or the site did not answer' }
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host.toLowerCase()
  }
  catch {
    return url
  }
}

/**
 * All targets, `LINK_CHECK_CONCURRENCY` at a time and never two requests to the same host at once.
 * Results come back in the order of `targets`.
 */
export async function checkLinks(targets: readonly LinkTarget[], options: UnfurlOptions = {}, onResult?: (result: LinkCheckResult) => void): Promise<LinkCheckResult[]> {
  const results = new Array<LinkCheckResult | undefined>(targets.length)
  const waiting = targets.map((target, index) => ({ target, index }))
  const busyHosts = new Set<string>()
  let active = 0

  await new Promise<void>((done) => {
    const pump = () => {
      if (waiting.length === 0 && active === 0) return done()
      while (active < LINK_CHECK_CONCURRENCY) {
        const at = waiting.findIndex(item => !busyHosts.has(hostOf(item.target.url)))
        if (at === -1) return
        const [item] = waiting.splice(at, 1)
        if (!item) return
        const host = hostOf(item.target.url)
        busyHosts.add(host)
        active++
        void checkLink(item.target.url, options).then((outcome) => {
          const result: LinkCheckResult = { ...item.target, ...outcome }
          results[item.index] = result
          onResult?.(result)
          busyHosts.delete(host)
          active--
          pump()
        })
      }
    }
    pump()
  })
  return results.flatMap(result => (result ? [result] : []))
}

/** A plain text table for the terminal. */
export function linkTable(results: readonly LinkCheckResult[]): string {
  const rows = results.map(result => [result.status, result.blockIds.join(','), result.url, result.reason])
  const header = ['status', 'blocks', 'url', 'reason']
  const widths = header.map((title, column) => Math.min(70, Math.max(title.length, ...rows.map(row => (row[column] ?? '').length))))
  const line = (cells: string[]) => cells.map((cell, column) => (column === cells.length - 1 ? cell : cell.padEnd(widths[column] ?? 0))).join('  ').trimEnd()
  return [line(header), line(widths.map(width => '-'.repeat(width))), ...rows.map(line)].join('\n')
}
