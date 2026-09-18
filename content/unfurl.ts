/**
 * Link preview engine ("unfurl"). WP10a, PLAN.md section 8.
 *
 * Runs on the OWNER's machine only: from the dev-only route `POST /api/unfurl`
 * (the editor) and from `scripts/fetch-links.ts` (build time). It reads a web
 * page once and saves what the tile needs as LOCAL files (`public/icons/`,
 * `public/thumbs/`, both ignored by git). The public page never calls it and
 * never talks to another host.
 *
 * Every outbound request goes through `safeRequest()`:
 * - http and https only, ports 80 and 443 only;
 * - the host is resolved first, and every address must be public unicast
 *   (no loopback, private, link-local, CGNAT, unique-local, IPv4-mapped...);
 * - the checked IP is pinned for the connection, so a second DNS answer cannot
 *   point the socket somewhere else (DNS rebinding);
 * - redirects are followed by hand, 5 at most, and every hop is checked again;
 * - 8 s timeout per hop, 3 s for the DNS answer, an honest User-Agent, a byte limit on every body.
 *
 * One `unfurl()` call has ONE budget for all of its requests (page, oEmbed,
 * manifest, icons, images): 20 s in total, 8 requests, 8 redirects. A slow or
 * hostile website cannot hold the editor or the build for longer. The caller
 * can stop the job early with `signal` (the editor closed the request).
 * A failed read is remembered for 10 minutes (`force` asks again).
 *
 * It never throws for a network reason: the answer is `{ ok: false, reason }`.
 *
 * Paths come from `ROOT` (./resolve.ts through ./unfurl-cache.ts), never from
 * this file's location: Nitro bundles this module (NOTES.md, WP7 regression fix).
 */
import { createHash } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns/promises'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Parser } from 'htmlparser2'
import ipaddr from 'ipaddr.js'
import { Agent, fetch as undiciFetch } from 'undici'
import { brandIconFor } from '../app/utils/brand-icons'
import { ROOT } from './resolve'
import {
  DEFAULT_DIRS,
  failureFor,
  FRESH_MS,
  localFileExists,
  normalizeUrl,
  readCacheSync,
  updateCache,
  updateFailure,
  type CacheEntry,
  type UnfurlData,
  type UnfurlDirs,
} from './unfurl-cache'

export { normalizeUrl, type UnfurlData, type UnfurlDirs }

/** One hop. */
const TIMEOUT_MS = 8000
/** One DNS answer. `dns.lookup` has no timeout of its own. */
const DNS_TIMEOUT_MS = 3000
/** One whole `unfurl()`: every request of it together. */
export const TOTAL_TIMEOUT_MS = 20_000
/** Redirects of one request. */
const MAX_REDIRECTS = 5
/** Redirects of one whole `unfurl()`, all of its requests together. */
export const MAX_TOTAL_REDIRECTS = 8
/** Requests of one whole `unfurl()`: page, oEmbed, manifest, icons, images. */
export const MAX_SUB_REQUESTS = 8
const MAX_HTML_BYTES = 512 * 1024
const MAX_JSON_BYTES = 256 * 1024
const MAX_ICON_BYTES = 1024 * 1024
const MAX_SVG_BYTES = 100 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MIN_IMAGE_PX = 200
const MAX_IMAGE_WIDTH = 1200
const ICON_TARGET_PX = 96
const TITLE_MAX = 120
const DESCRIPTION_MAX = 200
const HTML_ACCEPT = 'text/html,application/xhtml+xml'

function packageVersion(): string {
  try {
    const parsed: unknown = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && typeof parsed.version === 'string') return parsed.version
  }
  catch {
    // fall through
  }
  return '0.0.0'
}

/** Honest on purpose: never a browser string, never another company's bot name. */
export const USER_AGENT = `tilebox-unfurl/${packageVersion()} (+https://github.com/ricardov03/tilebox)`

export interface LookupAddress {
  address: string
  family: number
}

export type LookupFn = (host: string) => Promise<LookupAddress[]>

export interface TransportResponse {
  status: number
  headers: { get(name: string): string | null }
  body: AsyncIterable<Uint8Array> | null
  /** Frees the connection. Called after the body was read or dropped. */
  close?: () => void | Promise<void>
}

export interface TransportInit {
  /** Default `GET`. `HEAD` is for the link checker (WP11, content/link-check.ts). */
  method?: 'GET' | 'HEAD'
  headers: Record<string, string>
  signal: AbortSignal
  /** The address that passed the check. The connection must use it. `null` for an allowed test host. */
  pinned: LookupAddress | null
}

export type Transport = (url: URL, init: TransportInit) => Promise<TransportResponse>

export interface UnfurlOptions {
  /** Also fetch the website's image (the second switch). */
  showImage?: boolean
  /** Skip the 30-day freshness check and the 10-minute memory of a failure. Sends no `If-None-Match`. */
  force?: boolean
  /** The caller's stop button (the editor closed the request). The job ends with `reason: 'cancelled'` and caches nothing. */
  signal?: AbortSignal
  /** INTERNAL. The shared limits of one `unfurl()` call. `safeRequest()` makes its own when there is none. */
  budget?: RequestBudget
  /** TESTS ONLY. Hosts that skip the address and port checks (a local test server on 127.0.0.1). */
  allowHosts?: readonly string[]
  /** TESTS ONLY. Replaces `dns.lookup`. */
  lookup?: LookupFn
  /** TESTS ONLY. Replaces the undici connection. */
  transport?: Transport
  /** TESTS ONLY. Target folders and cache file. */
  dirs?: UnfurlDirs
  /** TESTS ONLY. The clock, in ms. */
  now?: () => number
}

export type UnfurlResult = ({ ok: true, cached: boolean } & UnfurlData) | { ok: false, reason: string, cached?: boolean }

/** What one `unfurl()` call may still spend. Shared by every request of that call. */
export interface RequestBudget {
  /** Aborts at the total deadline, or when the caller's `signal` does. */
  signal: AbortSignal
  redirectsLeft: number
  requestsLeft: number
}

export function newBudget(signal?: AbortSignal, totalMs: number = TOTAL_TIMEOUT_MS): RequestBudget {
  const deadline = AbortSignal.timeout(totalMs)
  return {
    signal: signal ? AbortSignal.any([deadline, signal]) : deadline,
    redirectsLeft: MAX_TOTAL_REDIRECTS,
    requestsLeft: MAX_SUB_REQUESTS,
  }
}

/** A failure with a short reason for the owner: "timeout", "http 403", "blocked address"... */
export class UnfurlError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
    this.name = 'UnfurlError'
  }
}

const defaultLookup: LookupFn = host => dnsLookup(host, { all: true })

/** One connection to one checked IP. `redirect: 'manual'`: the caller checks every hop. */
const defaultTransport: Transport = async (url, init) => {
  const pinned = init.pinned
  const agent = new Agent({
    connect: pinned
      ? {
          lookup: (_host, options, callback) => {
            if (options.all) callback(null, [{ address: pinned.address, family: pinned.family }])
            else callback(null, pinned.address, pinned.family)
          },
        }
      : undefined,
  })
  try {
    const response = await undiciFetch(url, {
      dispatcher: agent,
      method: init.method ?? 'GET',
      redirect: 'manual',
      headers: init.headers,
      signal: init.signal,
    })
    return {
      status: response.status,
      headers: response.headers,
      body: response.body,
      close: () => agent.destroy(),
    }
  }
  catch (error) {
    await agent.destroy()
    throw error
  }
}

function bareHost(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

/** True only for a public unicast address. Everything else is refused. */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false
  const parsed = ipaddr.parse(address)
  if (parsed.range() !== 'unicast') return false
  if (parsed.kind() === 'ipv6') {
    const parts = (parsed as ipaddr.IPv6).parts
    // `::/96`, the old "IPv4-compatible" form (`::127.0.0.1` = `::7f00:1`). ipaddr.js calls it unicast,
    // but a stack may send it to the IPv4 address inside. No public website lives there: refuse all of it.
    if (parts.slice(0, 6).every(part => part === 0)) return false
    // Any other form with an IPv4 address inside (mapped, translated) counts by that IPv4 address too.
    if (parts.slice(0, 5).every(part => part === 0) && parts[5] === 0xFFFF) return false
  }
  return true
}

/** `dns.lookup` has no timeout: a resolver that never answers would hold the job. 3 s, then "timeout". */
async function lookupInTime(lookup: LookupFn, host: string): Promise<LookupAddress[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new UnfurlError('timeout')), DNS_TIMEOUT_MS)
  })
  try {
    return await Promise.race([lookup(host), late])
  }
  finally {
    clearTimeout(timer)
  }
}

/** The SSRF guard for one URL. Returns the address to pin, or `null` for an allowed test host. */
export async function checkTarget(url: URL, options: Pick<UnfurlOptions, 'allowHosts' | 'lookup'> = {}): Promise<LookupAddress | null> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UnfurlError('not a web address')
  const host = bareHost(url)
  if (!host) throw new UnfurlError('not a web address')
  if (options.allowHosts?.includes(host)) return null
  if (url.port !== '' && url.port !== '80' && url.port !== '443') throw new UnfurlError('blocked port')

  let addresses: LookupAddress[]
  if (ipaddr.isValid(host)) {
    addresses = [{ address: host, family: ipaddr.parse(host).kind() === 'ipv6' ? 6 : 4 }]
  }
  else {
    try {
      addresses = await lookupInTime(options.lookup ?? defaultLookup, host)
    }
    catch (error) {
      if (error instanceof UnfurlError) throw error
      throw new UnfurlError('offline or unknown host')
    }
  }
  const first = addresses[0]
  if (!first) throw new UnfurlError('offline or unknown host')
  if (!addresses.every(entry => isPublicAddress(entry.address))) throw new UnfurlError('blocked address')
  return first
}

export interface RequestOptions {
  /** Default `GET`. With `HEAD` no body is read. */
  method?: 'GET' | 'HEAD'
  accept: string
  maxBytes: number
  /** `cut`: keep the first `maxBytes`. `fail`: a larger body is an error. */
  overflow: 'cut' | 'fail'
  /** HTML only: stop reading when the head ends. */
  stopAtHeadEnd?: boolean
  etag?: string
  lastModified?: string
}

export interface SafeResponse {
  status: number
  /** The URL after redirects. */
  url: URL
  headers: { get(name: string): string | null }
  body: Buffer
}

const HEAD_END = /<\/head\s*>|<body[\s>]/i

async function readLimited(body: AsyncIterable<Uint8Array> | null, options: RequestOptions): Promise<Buffer> {
  if (!body) return Buffer.alloc(0)
  const chunks: Buffer[] = []
  let total = 0
  let tail = ''
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk)
    chunks.push(buffer)
    total += buffer.byteLength
    if (total > options.maxBytes) {
      if (options.overflow === 'fail') throw new UnfurlError('file too large')
      break
    }
    if (options.stopAtHeadEnd) {
      const text = tail + buffer.toString('latin1')
      if (HEAD_END.test(text)) break
      tail = text.slice(-16)
    }
  }
  return Buffer.concat(chunks).subarray(0, options.maxBytes)
}

const TIMEOUT_CODES = new Set(['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'])
const UNKNOWN_HOST_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_NODATA', 'EAI_NONAME'])
/** Node's TLS verification codes that do not say CERT or ERR_TLS in their name. */
const CERTIFICATE_CODES = new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'HOSTNAME_MISMATCH', 'ERR_SSL_WRONG_VERSION_NUMBER'])

/**
 * A short reason for the owner. The real cause is often two or three `error.cause` levels deep
 * (`TypeError: fetch failed` -> undici error -> the TLS or socket error), so the whole chain is read.
 * Distinct answers: "bad certificate", "blocked address" (and every other guard reason),
 * "timeout", "too many redirects", "offline or unknown host".
 */
export function networkReason(error: unknown): string {
  const seen = new Set<unknown>()
  let fallback: string | undefined
  for (let current: unknown = error, depth = 0; current !== null && typeof current === 'object' && depth < 8 && !seen.has(current); depth++) {
    seen.add(current)
    // A refusal of the guard, also when another error wraps it.
    if (current instanceof UnfurlError) return current.reason
    const name = 'name' in current ? String(current.name) : ''
    const code = 'code' in current ? String(current.code) : ''
    if (name === 'TimeoutError' || name === 'AbortError' || TIMEOUT_CODES.has(code)) return 'timeout'
    if (code.startsWith('ERR_TLS') || code.includes('CERT') || CERTIFICATE_CODES.has(code)) return 'bad certificate'
    if (UNKNOWN_HOST_CODES.has(code)) fallback ??= 'offline or unknown host'
    current = 'cause' in current ? current.cause : undefined
  }
  return fallback ?? 'offline or the site did not answer'
}

/** Why the budget's signal fired: the caller stopped the job, or the 20 s are over. */
function stopReason(options: UnfurlOptions): string {
  return options.signal?.aborted ? 'cancelled' : 'timeout'
}

/**
 * One GET (or HEAD, for the link checker) through the guard. Follows redirects by hand. Throws `UnfurlError` only.
 * It spends from `options.budget` (one request, and one redirect per hop), so all
 * requests of one `unfurl()` share the 20 s, the 8 requests and the 8 redirects.
 */
export async function safeRequest(target: string | URL, request: RequestOptions, options: UnfurlOptions = {}): Promise<SafeResponse> {
  const transport = options.transport ?? defaultTransport
  const budget = options.budget ?? newBudget(options.signal)
  if (budget.signal.aborted) throw new UnfurlError(stopReason(options))
  if (budget.requestsLeft <= 0) throw new UnfurlError('too many requests')
  budget.requestsLeft--
  let url = new URL(target)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (budget.signal.aborted) throw new UnfurlError(stopReason(options))
    const pinned = await checkTarget(url, options)
    const headers: Record<string, string> = { 'user-agent': USER_AGENT, 'accept': request.accept }
    if (hop === 0 && request.etag) headers['if-none-match'] = request.etag
    if (hop === 0 && request.lastModified) headers['if-modified-since'] = request.lastModified
    let response: TransportResponse
    try {
      response = await transport(url, { method: request.method ?? 'GET', headers, signal: AbortSignal.any([budget.signal, AbortSignal.timeout(TIMEOUT_MS)]), pinned })
    }
    catch (error) {
      throw new UnfurlError(budget.signal.aborted ? stopReason(options) : networkReason(error))
    }
    try {
      const location = response.headers.get('location')
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        let next: URL
        try {
          next = new URL(location, url)
        }
        catch {
          throw new UnfurlError('bad redirect')
        }
        if (budget.redirectsLeft <= 0) throw new UnfurlError('too many redirects')
        budget.redirectsLeft--
        url = next
        continue
      }
      if (response.status !== 200) return { status: response.status, url, headers: response.headers, body: Buffer.alloc(0) }
      let body: Buffer
      try {
        body = await readLimited(response.body, request)
      }
      catch (error) {
        throw new UnfurlError(budget.signal.aborted ? stopReason(options) : networkReason(error))
      }
      return { status: 200, url, headers: response.headers, body }
    }
    finally {
      await Promise.resolve(response.close?.()).catch(() => undefined)
    }
  }
  throw new UnfurlError('too many redirects')
}

// ---------------------------------------------------------------------------
// HTML head
// ---------------------------------------------------------------------------

export interface IconCandidate {
  url: string
  rel: 'icon' | 'apple-touch-icon'
  /** Largest side from `sizes`, 0 when unknown. */
  size: number
  svg: boolean
}

export interface HeadData {
  title?: string
  description?: string
  siteName?: string
  themeColor?: string
  image?: { url: string, width?: number, height?: number, alt?: string }
  twitterImage?: string
  icons: IconCandidate[]
  manifest?: string
}

/** C0 and C1 control characters (after white space became a space), and the Unicode bidi controls U+202A-202E and U+2066-2069. */
// eslint-disable-next-line no-control-regex -- removing control characters is the point
const UNSAFE_TEXT = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g

/**
 * Every text that comes from a website (title, description, site name, alt, oEmbed fields) goes
 * through here: white space collapsed, control characters and bidi controls removed (a bidi
 * override can make a title read as something else in the editor and on the tile), length capped.
 */
export function cleanText(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined
  const text = value.replace(/\s+/g, ' ').replace(UNSAFE_TEXT, '').replace(/ {2,}/g, ' ').trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function absoluteUrl(href: string | undefined, base: URL): string | undefined {
  if (!href) return undefined
  try {
    const url = new URL(href.trim(), base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  }
  catch {
    return undefined
  }
}

function largestSize(sizes: string | undefined): number {
  if (!sizes) return 0
  return Math.max(0, ...sizes.split(/\s+/).map((part) => {
    const match = part.match(/^(\d+)x(\d+)$/i)
    return match ? Math.max(Number(match[1]), Number(match[2])) : 0
  }))
}

/** SAX pass over the head. Relative URLs are resolved against `finalUrl`. */
export function parseHead(html: string, finalUrl: string | URL): HeadData {
  const base = new URL(finalUrl)
  const meta = new Map<string, string>()
  const icons: IconCandidate[] = []
  let manifest: string | undefined
  let titleText = ''
  let inTitle = false
  let done = false

  const parser = new Parser({
    onopentag(name, attrs) {
      if (done) return
      if (name === 'body') {
        done = true
        return
      }
      if (name === 'title') inTitle = true
      if (name === 'meta') {
        const key = (attrs.property ?? attrs.name ?? '').trim().toLowerCase()
        const content = attrs.content
        if (key && content !== undefined && !meta.has(key)) meta.set(key, content)
      }
      if (name === 'link') {
        const rels = (attrs.rel ?? '').toLowerCase().split(/\s+/)
        const href = absoluteUrl(attrs.href, base)
        if (!href) return
        if (rels.includes('manifest')) manifest ??= href
        const apple = rels.includes('apple-touch-icon') || rels.includes('apple-touch-icon-precomposed')
        if (apple || rels.includes('icon')) {
          const svg = (attrs.type ?? '').toLowerCase().includes('svg') || /\.svg(\?|$)/i.test(href)
          icons.push({ url: href, rel: apple ? 'apple-touch-icon' : 'icon', size: largestSize(attrs.sizes), svg })
        }
      }
    },
    ontext(text) {
      if (inTitle && !done) titleText += text
    },
    onclosetag(name) {
      if (name === 'title') inTitle = false
      if (name === 'head') done = true
    },
  }, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true })
  parser.write(html)
  parser.end()

  const number = (value: string | undefined) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
  }
  /** The first value that still has text after cleaning. An empty `og:title` must not hide the `<title>`. */
  const first = (max: number, ...values: (string | undefined)[]) => values.map(value => cleanText(value, max)).find(value => value !== undefined)
  const imageUrl = absoluteUrl(meta.get('og:image') ?? meta.get('og:image:url'), base)
  const themeColor = cleanText(meta.get('theme-color'), 32)
  return {
    title: first(TITLE_MAX, meta.get('og:title'), meta.get('twitter:title'), titleText),
    description: first(DESCRIPTION_MAX, meta.get('og:description'), meta.get('description')),
    siteName: cleanText(meta.get('og:site_name'), TITLE_MAX),
    themeColor: themeColor && /^[#a-z0-9(),.%\s-]+$/i.test(themeColor) ? themeColor : undefined,
    image: imageUrl
      ? {
          url: imageUrl,
          width: number(meta.get('og:image:width')),
          height: number(meta.get('og:image:height')),
          alt: cleanText(meta.get('og:image:alt'), DESCRIPTION_MAX),
        }
      : undefined,
    twitterImage: absoluteUrl(meta.get('twitter:image') ?? meta.get('twitter:image:src'), base),
    icons,
    manifest,
  }
}

/** Charset: the header, then `<meta charset>`, then utf-8. */
export function decodeHtml(body: Buffer, contentType: string | null): string {
  const fromHeader = contentType?.match(/charset\s*=\s*"?([^";\s]+)/i)?.[1]
  const sniff = body.subarray(0, 2048).toString('latin1')
  const fromMeta = sniff.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1]
  for (const label of [fromHeader, fromMeta, 'utf-8']) {
    if (!label) continue
    try {
      return new TextDecoder(label).decode(body)
    }
    catch {
      // an unknown label: try the next one
    }
  }
  return body.toString('utf8')
}

// ---------------------------------------------------------------------------
// Files: magic bytes, ICO, icons, images
// ---------------------------------------------------------------------------

export type ImageKind = 'png' | 'jpeg' | 'webp' | 'gif' | 'avif' | 'ico' | 'svg'

/** The real type of a file, from its first bytes. The content-type header is not trusted. */
export function sniffImage(body: Buffer): ImageKind | null {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png'
  if (body.length >= 3 && body[0] === 0xFF && body[1] === 0xD8 && body[2] === 0xFF) return 'jpeg'
  const ascii = (start: number, end: number) => body.subarray(start, end).toString('latin1')
  if (body.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'gif'
  if (body.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  if (body.length >= 12 && ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) return 'avif'
  if (body.length >= 6 && body[0] === 0 && body[1] === 0 && body[2] === 1 && body[3] === 0) return 'ico'
  const head = body.subarray(0, 1024).toString('utf8').replace(/^\uFEFF/, '').trimStart()
  if ((head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!--') || head.startsWith('<!DOCTYPE svg')) && /<svg[\s>]/i.test(head)) return 'svg'
  return null
}

/** The largest PNG entry of an ICO file. BMP entries are skipped. `null` when there is none. */
export function largestPngFromIco(ico: Buffer): Buffer | null {
  if (sniffImage(ico) !== 'ico') return null
  const count = ico.readUInt16LE(4)
  let best: { size: number, data: Buffer } | null = null
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16
    if (entry + 16 > ico.length) break
    const width = ico[entry] || 256
    const height = ico[entry + 1] || 256
    const bytes = ico.readUInt32LE(entry + 8)
    const offset = ico.readUInt32LE(entry + 12)
    if (offset + bytes > ico.length) continue
    const data = ico.subarray(offset, offset + bytes)
    if (sniffImage(data) !== 'png') continue
    const size = Math.max(width, height)
    if (!best || size > best.size) best = { size, data: Buffer.from(data) }
  }
  return best?.data ?? null
}

/** The saved icon: a PNG that fits inside 128x128. */
const ICON_OUTPUT_PX = 128
/** No decoder input may be larger than this, whatever its header says. */
const MAX_INPUT_PIXELS = 4096 * 4096
const SVG_BASE_DENSITY = 72
/** Upper limit for the SVG render density. The render is about 128 px wide, so this only matters for a tiny viewBox. */
const SVG_MAX_DENSITY = 2400
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

/**
 * Every fetched icon goes through here, and ONLY the result is stored.
 * sharp decodes the bytes and draws them again as a PNG inside 128x128, so
 * nothing of the remote file (script, markup, metadata, a second payload after
 * the image data) reaches `public/icons/`. A remote SVG is never stored:
 * opened directly it would run script on the site's own origin. librsvg draws
 * it without running script and without loading outside files.
 * `null` = sharp cannot decode it = "no icon", the next source is tried.
 */
export async function rasterizeIcon(body: Buffer, kind: ImageKind): Promise<Buffer | null> {
  if (kind === 'ico') return null
  if (kind === 'svg' && body.byteLength > MAX_SVG_BYTES) return null
  try {
    const { default: sharp } = await import('sharp')
    const limits = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' as const }
    let density: number | undefined
    if (kind === 'svg') {
      // Size at 72 dpi, read from the header only (nothing is drawn yet). The density is set so the
      // render is about 128 px: a huge viewBox cannot use a lot of memory, a tiny one stays sharp.
      const meta = await sharp(body, { ...limits, density: SVG_BASE_DENSITY }).metadata()
      const side = Math.max(meta.width ?? 0, meta.height ?? 0)
      if (side <= 0) return null
      density = Math.min(SVG_MAX_DENSITY, Math.max(1, Math.round(SVG_BASE_DENSITY * ICON_OUTPUT_PX / side)))
    }
    const png = await sharp(body, { ...limits, ...(density ? { density } : {}) })
      .resize(ICON_OUTPUT_PX, ICON_OUTPUT_PX, { fit: 'inside', withoutEnlargement: kind !== 'svg', background: TRANSPARENT })
      .ensureAlpha()
      .png()
      .toBuffer()
    return sniffImage(png) === 'png' ? png : null
  }
  catch {
    return null
  }
}

function hashName(body: Buffer, ext: string): string {
  return `${createHash('sha1').update(body).digest('hex').slice(0, 16)}.${ext}`
}

async function writeOnce(dir: string, name: string, body: Buffer): Promise<void> {
  const file = resolve(dir, name)
  if (existsSync(file)) return
  await mkdir(dir, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  try {
    await writeFile(tmp, body)
    await rename(tmp, file)
  }
  catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw error
  }
}

/** The smallest icon of at least 96 px, else the largest. Unknown sizes come last. */
export function pickBySize<T extends { size: number }>(list: readonly T[]): T | undefined {
  const known = list.filter(item => item.size > 0).sort((a, b) => a.size - b.size)
  return known.find(item => item.size >= ICON_TARGET_PX) ?? known.at(-1) ?? list[0]
}

/** Downloads one icon and saves it as a PNG (`rasterizeIcon()`, never the remote bytes). Returns the public path, or `undefined` when this candidate is no good. */
async function saveIcon(url: string, options: UnfurlOptions, dirs: UnfurlDirs): Promise<string | undefined> {
  let response: SafeResponse
  try {
    response = await safeRequest(url, { accept: 'image/*', maxBytes: MAX_ICON_BYTES, overflow: 'fail' }, options)
  }
  catch {
    return undefined
  }
  if (response.status !== 200 || response.body.byteLength === 0) return undefined
  let body = response.body
  let kind = sniffImage(body)
  if (kind === 'ico') {
    const png = largestPngFromIco(body)
    if (!png) return undefined
    body = png
    kind = 'png'
  }
  if (!kind) return undefined
  const output = await rasterizeIcon(body, kind)
  if (!output) return undefined
  // The name is the hash of the OUTPUT: the stored bytes are the only thing the name vouches for.
  const name = hashName(output, 'png')
  await writeOnce(dirs.icons, name, output)
  return `/icons/${name}`
}

interface ManifestIcon {
  url: string
  size: number
}

async function manifestIcons(manifestUrl: string, options: UnfurlOptions): Promise<ManifestIcon[]> {
  try {
    const response = await safeRequest(manifestUrl, { accept: 'application/manifest+json,application/json', maxBytes: MAX_JSON_BYTES, overflow: 'fail' }, options)
    if (response.status !== 200) return []
    const parsed: unknown = JSON.parse(response.body.toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null || !('icons' in parsed) || !Array.isArray(parsed.icons)) return []
    return parsed.icons.flatMap((icon: unknown): ManifestIcon[] => {
      if (typeof icon !== 'object' || icon === null || !('src' in icon) || typeof icon.src !== 'string') return []
      const purpose = 'purpose' in icon && typeof icon.purpose === 'string' ? icon.purpose.trim().toLowerCase() : 'any'
      if (purpose === 'maskable') return []
      const url = absoluteUrl(icon.src, response.url)
      const sizes = 'sizes' in icon && typeof icon.sizes === 'string' ? icon.sizes : undefined
      return url ? [{ url, size: largestSize(sizes) }] : []
    })
  }
  catch {
    return []
  }
}

/**
 * Favicon, in order: SVG icon, apple-touch-icon, PNG icon, manifest icon (192 first),
 * `/favicon.ico` (its largest PNG entry), then the Google favicon service as the last try.
 */
async function fetchFavicon(head: HeadData | null, pageUrl: URL, options: UnfurlOptions, dirs: UnfurlDirs): Promise<string | undefined> {
  const icons = head?.icons ?? []
  const tries: (() => Promise<string | undefined>)[] = []
  const svg = icons.find(icon => icon.rel === 'icon' && icon.svg)
  if (svg) tries.push(() => saveIcon(svg.url, options, dirs))
  const apple = pickBySize(icons.filter(icon => icon.rel === 'apple-touch-icon'))
  if (apple) tries.push(() => saveIcon(apple.url, options, dirs))
  const raster = pickBySize(icons.filter(icon => icon.rel === 'icon' && !icon.svg))
  if (raster) tries.push(() => saveIcon(raster.url, options, dirs))
  const manifest = head?.manifest
  if (manifest) {
    tries.push(async () => {
      const list = await manifestIcons(manifest, options)
      const pick = list.find(icon => icon.size === 192) ?? pickBySize(list)
      return pick ? saveIcon(pick.url, options, dirs) : undefined
    })
  }
  tries.push(() => saveIcon(new URL('/favicon.ico', pageUrl).href, options, dirs))
  tries.push(() => saveIcon(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(pageUrl.hostname)}&sz=128`, options, dirs))
  for (const attempt of tries) {
    const path = await attempt()
    if (path) return path
  }
  return undefined
}

interface ImageCandidate {
  url: string
  alt?: string
}

/** Downloads, checks (magic bytes, 200x200 at least, no SVG) and re-encodes as webp, which drops EXIF. */
async function saveImage(candidate: ImageCandidate, options: UnfurlOptions, dirs: UnfurlDirs): Promise<string | undefined> {
  let response: SafeResponse
  try {
    response = await safeRequest(candidate.url, { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif', maxBytes: MAX_IMAGE_BYTES, overflow: 'fail' }, options)
  }
  catch {
    return undefined
  }
  if (response.status !== 200) return undefined
  const kind = sniffImage(response.body)
  if (!kind || !['png', 'jpeg', 'webp', 'gif', 'avif'].includes(kind)) return undefined
  try {
    const { default: sharp } = await import('sharp')
    const meta = await sharp(response.body).metadata()
    if (!meta.width || !meta.height || meta.width < MIN_IMAGE_PX || meta.height < MIN_IMAGE_PX) return undefined
    const webp = await sharp(response.body)
      .rotate()
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    const name = hashName(response.body, 'webp')
    await writeOnce(dirs.thumbs, name, webp)
    return `/thumbs/${name}`
  }
  catch {
    return undefined
  }
}

export type PictureResult = { ok: true, body: Buffer } | { ok: false, reason: string }

/**
 * One remote picture for a build script (the YouTube thumbnail of a video tile), through the SAME
 * guard as every other request: address check, pinned IP, redirects by hand, timeouts, and the
 * byte limit applied WHILE the body is read (5 MB by default). The bytes are decoded and written
 * again as a JPEG, so the file on disk is never the remote file as it came. Never throws.
 */
export async function fetchPicture(url: string, options: UnfurlOptions & { maxBytes?: number } = {}): Promise<PictureResult> {
  try {
    const response = await safeRequest(url, { accept: 'image/jpeg,image/png,image/webp', maxBytes: options.maxBytes ?? MAX_IMAGE_BYTES, overflow: 'fail' }, options)
    if (response.status !== 200) return { ok: false, reason: `http ${response.status}` }
    const kind = sniffImage(response.body)
    if (kind !== 'jpeg' && kind !== 'png' && kind !== 'webp') return { ok: false, reason: 'not a picture' }
    const { default: sharp } = await import('sharp')
    const body = await sharp(response.body, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).rotate().jpeg({ quality: 85 }).toBuffer()
    return { ok: true, body }
  }
  catch (error) {
    return { ok: false, reason: error instanceof UnfurlError ? error.reason : 'not a picture' }
  }
}

// ---------------------------------------------------------------------------
// oEmbed and other shortcuts
// ---------------------------------------------------------------------------

interface OembedProvider {
  name: string
  hosts: readonly string[]
  /** Only these paths have an oEmbed answer. No pattern = every path. */
  path?: RegExp
  endpoint: string
}

/** Keyless oEmbed endpoints. The page URL is appended, encoded. */
const OEMBED_PROVIDERS: readonly OembedProvider[] = [
  { name: 'YouTube', hosts: ['youtube.com', 'm.youtube.com', 'youtu.be'], path: /^\/(watch|shorts\/|live\/|playlist|embed\/|[\w-]{11}$)/, endpoint: 'https://www.youtube.com/oembed?format=json&url=' },
  { name: 'Vimeo', hosts: ['vimeo.com', 'player.vimeo.com'], path: /\d{5,}/, endpoint: 'https://vimeo.com/api/oembed.json?url=' },
  { name: 'Spotify', hosts: ['open.spotify.com'], path: /^\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|show|episode)\//, endpoint: 'https://open.spotify.com/oembed?url=' },
  { name: 'SoundCloud', hosts: ['soundcloud.com', 'on.soundcloud.com'], path: /^\/[^/]+/, endpoint: 'https://soundcloud.com/oembed?format=json&url=' },
  { name: 'TikTok', hosts: ['tiktok.com', 'vm.tiktok.com'], path: /^\/(@[^/]+|t\/|[\w]+\/?$)/, endpoint: 'https://www.tiktok.com/oembed?url=' },
  { name: 'X', hosts: ['x.com', 'twitter.com', 'mobile.twitter.com'], path: /^\/[^/]+\/status\/\d+/, endpoint: 'https://publish.twitter.com/oembed?omit_script=1&url=' },
  { name: 'Bluesky', hosts: ['bsky.app'], path: /^\/profile\/[^/]+\/post\//, endpoint: 'https://embed.bsky.app/oembed?url=' },
  { name: 'Reddit', hosts: ['reddit.com', 'old.reddit.com'], path: /^\/r\/[^/]+\/comments\//, endpoint: 'https://www.reddit.com/oembed?url=' },
  { name: 'Flickr', hosts: ['flickr.com', 'flic.kr'], path: /^\/(photos|p)\//, endpoint: 'https://www.flickr.com/services/oembed/?format=json&url=' },
  { name: 'Mixcloud', hosts: ['mixcloud.com'], path: /^\/[^/]+\/[^/]+/, endpoint: 'https://app.mixcloud.com/oembed/?format=json&url=' },
  { name: 'Apple Music', hosts: ['music.apple.com'], path: /^\/[a-z]{2}\/(album|playlist|song|artist|music-video)\//, endpoint: 'https://music.apple.com/api/oembed?url=' },
  { name: 'Giphy', hosts: ['giphy.com', 'gph.is'], path: /^\/(gifs|clips|stickers)\/|^\/[\w]+$/, endpoint: 'https://giphy.com/services/oembed?url=' },
  { name: 'Pinterest', hosts: ['pinterest.com', 'pin.it'], path: /^\/(pin\/|[\w]+$)/, endpoint: 'https://www.pinterest.com/oembed.json?url=' },
]

/** The oEmbed request URL for a page, or `null` when no listed provider takes it. */
export function oembedUrlFor(page: string | URL): { provider: string, url: string } | null {
  const url = new URL(page)
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const provider = OEMBED_PROVIDERS.find(entry =>
    (entry.hosts.includes(host) || (entry.name === 'Pinterest' && /^([a-z]{2}\.)?pinterest\.[a-z.]+$/.test(host)))
    && (!entry.path || entry.path.test(url.pathname)))
  return provider ? { provider: provider.name, url: `${provider.endpoint}${encodeURIComponent(url.href)}` } : null
}

/** `https://github.com/<user>` -> the avatar, 200 px. `null` for any other URL. */
export function githubAvatarFor(page: string | URL): string | null {
  const url = new URL(page)
  if (url.hostname.toLowerCase().replace(/^www\./, '') !== 'github.com') return null
  const match = url.pathname.match(/^\/([a-z\d](?:[a-z\d-]{0,38}))\/?$/i)
  return match?.[1] ? `https://github.com/${match[1]}.png?size=200` : null
}

interface Found {
  title?: string
  description?: string
  siteName?: string
  themeColor?: string
  images: ImageCandidate[]
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

async function fromOembed(endpoint: { provider: string, url: string }, options: UnfurlOptions): Promise<Found | null> {
  let response: SafeResponse
  try {
    response = await safeRequest(endpoint.url, { accept: 'application/json', maxBytes: MAX_JSON_BYTES, overflow: 'fail' }, options)
  }
  catch {
    return null
  }
  if (response.status !== 200) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(response.body.toString('utf8'))
  }
  catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const data = parsed as Record<string, unknown>
  const author = cleanText(text(data.author_name), TITLE_MAX)
  const siteName = cleanText(text(data.provider_name), TITLE_MAX) ?? endpoint.provider
  const title = cleanText(text(data.title), TITLE_MAX) ?? (author ? cleanText(`${author} on ${siteName}`, TITLE_MAX) : undefined)
  if (!title) return null
  const thumbnail = absoluteUrl(text(data.thumbnail_url), response.url)
  return {
    title,
    description: text(data.title) && author ? cleanText(`By ${author}`, DESCRIPTION_MAX) : undefined,
    siteName,
    images: thumbnail ? [{ url: thumbnail }] : [],
  }
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

function filesPresent(entry: CacheEntry, dirs: UnfurlDirs): boolean {
  const { favicon, image } = entry.data
  return (!favicon || localFileExists(favicon, dirs)) && (!image || localFileExists(image, dirs))
}

/** The answer for the caller. The image is part of it only when it was asked for. */
function answer(data: UnfurlData, showImage: boolean, cached: boolean): UnfurlResult {
  const { image, imageAlt, ...rest } = data
  return { ok: true, cached, ...rest, ...(showImage && image ? { image, ...(imageAlt ? { imageAlt } : {}) } : {}) }
}

/** Refusals of the local guard. They cost no network, so they are not remembered. */
const CHEAP_REASONS = new Set(['blocked address', 'blocked port', 'not a web address', 'offline or unknown host', 'cancelled'])

async function run(input: string, caller: UnfurlOptions): Promise<UnfurlResult> {
  // ONE budget for every request of this call: 20 s, 8 requests, 8 redirects.
  const options: UnfurlOptions = { ...caller, budget: newBudget(caller.signal) }
  const cancelled = () => caller.signal?.aborted === true
  const ctx = { dirs: options.dirs ?? DEFAULT_DIRS, now: options.now ?? Date.now }
  const showImage = options.showImage ?? false
  const key = normalizeUrl(input)
  if (!key) return { ok: false, reason: 'not a web address (http or https, 2048 characters at most)' }
  const pageUrl = new URL(key)

  const entry = readCacheSync(ctx.dirs)[key]
  const usable = entry !== undefined && filesPresent(entry, ctx.dirs) && (!showImage || entry.imageTried)
  if (entry && usable && !options.force && ctx.now() - Date.parse(entry.data.fetchedAt) < FRESH_MS) {
    return answer(entry.data, showImage, true)
  }

  const brand = brandIconFor(key)
  const fetchedAt = new Date(ctx.now()).toISOString()
  let found: Found | null = null
  let source: UnfurlData['source'] = 'html'
  let finalUrl = pageUrl
  let head: HeadData | null = null
  let etag: string | undefined
  let lastModified: string | undefined
  let note: string | undefined

  // A read that failed less than 10 minutes ago is not tried again (`force` does).
  const remembered = options.force ? undefined : failureFor(key, ctx.now(), ctx.dirs)
  let pageError: string | undefined = remembered?.reason

  const oembed = oembedUrlFor(pageUrl)
  if (oembed && !remembered) {
    found = await fromOembed(oembed, options)
    if (found) source = 'oembed'
  }

  if (!found && !remembered) {
    try {
      const response = await safeRequest(pageUrl, {
        accept: HTML_ACCEPT,
        maxBytes: MAX_HTML_BYTES,
        overflow: 'cut',
        stopAtHeadEnd: true,
        // Refresh (`force`) asks for the whole page: with `If-None-Match` a 304 would keep the old data.
        ...(entry && usable && !options.force ? { etag: entry.etag, lastModified: entry.lastModified } : {}),
      }, options)
      if (response.status === 304 && entry) {
        const data: UnfurlData = { ...entry.data, fetchedAt }
        await updateCache(key, { ...entry, data }, ctx.dirs)
        return answer(data, showImage, true)
      }
      if (response.status !== 200) throw new UnfurlError(`http ${response.status}`)
      const contentType = response.headers.get('content-type')
      if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(contentType?.trim() ?? '')) throw new UnfurlError('not html')
      finalUrl = response.url
      head = parseHead(decodeHtml(response.body, contentType), finalUrl)
      // Longer values would not pass the cache schema (content/unfurl-cache.ts), so they are not kept.
      const validator = (name: string, max: number) => {
        const value = response.headers.get(name)
        return value && value.length <= max ? value : undefined
      }
      etag = validator('etag', 1024)
      lastModified = validator('last-modified', 128)
      const images: ImageCandidate[] = []
      if (head.image) images.push({ url: head.image.url, alt: head.image.alt })
      if (head.twitterImage && head.twitterImage !== head.image?.url) images.push({ url: head.twitterImage })
      found = { title: head.title, description: head.description, siteName: head.siteName, themeColor: head.themeColor, images }
    }
    catch (error) {
      pageError = cancelled() ? 'cancelled' : networkReason(error)
      if (!CHEAP_REASONS.has(pageError)) {
        await updateFailure(key, { reason: pageError, at: fetchedAt }, ctx.dirs, ctx.now())
      }
    }
  }

  if (!found) {
    const reason = pageError ?? 'the link could not be read'
    // A brand we know still gets its icon, with no network at all.
    if (!brand || reason === 'cancelled') return { ok: false, reason, ...(remembered ? { cached: true } : {}) }
    source = 'brand'
    note = `The website gave no data (${reason}). The brand icon still works.`
    found = { siteName: pageUrl.hostname.replace(/^www\./, ''), images: [] }
  }

  const avatar = githubAvatarFor(pageUrl)
  const images = [...(avatar ? [{ url: avatar }] : []), ...found.images]

  // A brand icon wins over a favicon on the tile, so its favicon is never downloaded.
  const favicon = brand || source === 'brand' ? undefined : await fetchFavicon(head, finalUrl, options, ctx.dirs)

  let image: string | undefined
  let imageAlt: string | undefined
  if (showImage) {
    for (const candidate of images.slice(0, 3)) {
      image = await saveImage(candidate, options, ctx.dirs)
      if (image) {
        imageAlt = candidate.alt
        break
      }
    }
  }
  else if (entry && localFileExists(entry.data.image, ctx.dirs)) {
    // Keep a picture an earlier run saved: the switch may come back on.
    image = entry.data.image
    imageAlt = entry.data.imageAlt
  }

  const data: UnfurlData = {
    url: key,
    finalUrl: finalUrl.href,
    ...(found.title ? { title: found.title } : {}),
    ...(found.description ? { description: found.description } : {}),
    ...(found.siteName ? { siteName: found.siteName } : {}),
    ...(found.themeColor ? { themeColor: found.themeColor } : {}),
    ...(favicon ? { favicon } : {}),
    ...(image ? { image } : {}),
    ...(image && imageAlt ? { imageAlt } : {}),
    source,
    fetchedAt,
    ...(note ? { note } : {}),
  }
  // The editor closed the request: what was found may be half of it. Nothing is cached.
  if (cancelled()) return { ok: false, reason: 'cancelled' }
  // A brand-only answer is a failed read. It is not cached as data (its failure is remembered for 10 minutes).
  if (source !== 'brand') {
    await updateCache(key, { data, imageTried: showImage || (entry?.imageTried === true && image !== undefined), etag, lastModified }, ctx.dirs)
  }
  return answer(data, showImage, false)
}

/** Reads one link. Never throws for a network reason: a failure is `{ ok: false, reason }`. */
export async function unfurl(url: string, options: UnfurlOptions = {}): Promise<UnfurlResult> {
  try {
    return await run(url, options)
  }
  catch (error) {
    return { ok: false, reason: error instanceof UnfurlError ? error.reason : 'the link could not be read' }
  }
}
