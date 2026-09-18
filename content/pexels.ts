/**
 * Pexels photo picker engine. WP12, PLAN.md section 8.
 *
 * Runs on the OWNER's machine only, behind the dev-only routes `server/api/images/pexels/*`.
 * The public page never calls it: a picked photo is a LOCAL file in `public/blocks/` (ignored by git).
 *
 * API facts (checked 2026-09-18 on https://www.pexels.com/api/documentation/):
 * - `GET https://api.pexels.com/v1/search?query=&page=&per_page=&orientation=`, `GET /v1/photos/:id`;
 * - the key goes in the `Authorization` header, as it is (no `Bearer`);
 * - 200 requests per hour and 20,000 per month by default;
 * - `X-Ratelimit-Limit`, `X-Ratelimit-Remaining`, `X-Ratelimit-Reset` (UNIX seconds) come with 2xx answers
 *   ONLY, never with a 429. So the last reset time is remembered here for the 429 message.
 *
 * Rules:
 * - Every request goes through `safeRequest()` of ./unfurl.ts (address check, pinned IP, redirects by
 *   hand, timeouts, byte limits) with a host allow-list: `api.pexels.com` for the API,
 *   `images.pexels.com` for the download. https only.
 * - The key is sent to `api.pexels.com` only, on the first hop only. It is in no answer and in no error text.
 * - `pickPhoto()` takes an ID, never a URL: the download URL comes from the Pexels API answer and must be
 *   on `images.pexels.com`. The route cannot be used as an open proxy (docs/security.md).
 * - The remote bytes are never stored: sharp decodes them and writes a new WebP (no metadata).
 * - Paths come from `ROOT` (./resolve.ts), never from this file's location: Nitro bundles this module.
 */
import { existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { ROOT } from './resolve'
import { cleanText, newBudget, safeRequest, sniffImage, UnfurlError, type LookupFn, type RequestBudget, type SafeResponse, type Transport } from './unfurl'

export const PEXELS_API_HOST = 'api.pexels.com'
export const PEXELS_IMAGE_HOST = 'images.pexels.com'
/** Hosts a credit link may point to. */
const PEXELS_PAGE_HOSTS = ['www.pexels.com', 'pexels.com'] as const

/** 24 = full rows in a grid of 2, 3 or 4 columns. The API allows 80. */
export const PER_PAGE = 24
export const MAX_PAGE = 50
export const SEARCH_CACHE_MS = 10 * 60 * 1000
const SEARCH_CACHE_ENTRIES = 100
const SEARCH_TIMEOUT_MS = 8000
const PICK_TIMEOUT_MS = 20_000
const MAX_JSON_BYTES = 512 * 1024
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024
/** The long side of the saved file. */
export const MAX_SIDE_PX = 1600
const WEBP_QUALITY = 82
/** No decoder input may be larger than this, whatever its header says. */
const MAX_INPUT_PIXELS = 8192 * 8192
const ALT_MAX = 200
const NAME_MAX = 80

export const ORIENTATIONS = ['landscape', 'portrait', 'square'] as const
export type Orientation = (typeof ORIENTATIONS)[number]

/** The `src` variants the pick route may download. `large2x` is 1880 px wide at most: enough for 1600. */
export const PICK_SIZES = ['large2x', 'large'] as const
export type PickSize = (typeof PICK_SIZES)[number]

export const SearchInputSchema = z.object({
  q: z.string().trim().min(1).max(80),
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  orientation: z.enum(ORIENTATIONS).optional(),
}).strict()
export type SearchInput = z.infer<typeof SearchInputSchema>

export const PickInputSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  size: z.enum(PICK_SIZES).default('large2x'),
}).strict()
export type PickInput = z.infer<typeof PickInputSchema>

/** What the editor gets for one photo. Small on purpose: nothing else of the API answer leaves the server. */
export interface PexelsPhoto {
  id: number
  width: number
  height: number
  alt: string
  /** `#rrggbb`, the placeholder while the thumbnail loads. */
  avgColor: string | null
  photographer: string
  photographerUrl: string | null
  pageUrl: string
  thumb: string
  preview: string
}

export interface RateLimit {
  remaining: number | null
  /** UNIX seconds. */
  reset: number | null
}

export interface SearchResult {
  photos: PexelsPhoto[]
  page: number
  hasMore: boolean
  rateLimit: RateLimit
}

export interface PickResult {
  src: string
  width: number
  height: number
  alt: string
  source: { provider: 'pexels', id: string, url: string, author?: string, authorUrl?: string }
}

export interface PexelsOptions {
  /** The owner's key, from `.env`. Never logged, never returned. */
  key: string | undefined
  signal?: AbortSignal
  /** TESTS ONLY. Replaces the undici connection. */
  transport?: Transport
  /** TESTS ONLY. Replaces `dns.lookup`. */
  lookup?: LookupFn
  /** TESTS ONLY. The clock, in ms. */
  now?: () => number
  /** TESTS ONLY. The target folder. Default `public/blocks`. */
  dir?: string
}

/** A failure with an HTTP status for the route and one line for the owner. */
export class PexelsError extends Error {
  constructor(public readonly status: number, message: string, public readonly reset: number | null = null) {
    super(message)
    this.name = 'PexelsError'
  }
}

const PhotoSchema = z.object({
  id: z.number().int().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  url: z.string().optional(),
  photographer: z.string().nullish(),
  photographer_url: z.string().nullish(),
  avg_color: z.string().nullish(),
  alt: z.string().nullish(),
  src: z.record(z.string(), z.unknown()),
})
type ApiPhoto = z.infer<typeof PhotoSchema>

const SearchAnswerSchema = z.object({
  photos: z.array(z.unknown()),
  next_page: z.string().nullish(),
})

/** Printable ASCII, no space: safe as a header value. */
const KEY_SHAPE = /^[\x21-\x7E]{1,256}$/

export function isConfigured(key: string | undefined): boolean {
  return (key ?? '').trim() !== ''
}

function usableKey(key: string | undefined): string {
  const trimmed = (key ?? '').trim()
  if (!trimmed) throw new PexelsError(503, 'No Pexels key. Put PEXELS_API_KEY in .env and start npm run dev again.')
  if (!KEY_SHAPE.test(trimmed)) throw new PexelsError(401, 'The Pexels key is wrong')
  return trimmed
}

/** `https:` on one of `hosts`, else `null`. */
function httpsOn(value: unknown, hosts: readonly string[]): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && hosts.includes(url.hostname) && !url.username && !url.password ? url.href : null
  }
  catch {
    return null
  }
}

function pageUrlOf(photo: ApiPhoto): string {
  return httpsOn(photo.url, PEXELS_PAGE_HOSTS) ?? `https://www.pexels.com/photo/${photo.id}/`
}

/** `null` when the photo has no thumbnail on the Pexels image host: the editor never loads another host. */
function toPhoto(raw: unknown): PexelsPhoto | null {
  const parsed = PhotoSchema.safeParse(raw)
  if (!parsed.success) return null
  const photo = parsed.data
  const thumb = httpsOn(photo.src.medium, [PEXELS_IMAGE_HOST]) ?? httpsOn(photo.src.small, [PEXELS_IMAGE_HOST])
  if (!thumb) return null
  const avg = photo.avg_color ?? ''
  return {
    id: photo.id,
    width: Math.round(photo.width),
    height: Math.round(photo.height),
    alt: cleanText(photo.alt ?? undefined, ALT_MAX) ?? '',
    avgColor: /^#[0-9a-f]{6}$/i.test(avg) ? avg : null,
    photographer: cleanText(photo.photographer ?? undefined, NAME_MAX) ?? '',
    photographerUrl: httpsOn(photo.photographer_url, PEXELS_PAGE_HOSTS),
    pageUrl: pageUrlOf(photo),
    thumb,
    preview: httpsOn(photo.src.large, [PEXELS_IMAGE_HOST]) ?? thumb,
  }
}

// ---------------------------------------------------------------------------
// Memory of this dev server: the search cache and the last rate-limit reset
// ---------------------------------------------------------------------------

const searchCache = new Map<string, { at: number, result: SearchResult }>()
let lastReset: number | null = null

/** TESTS ONLY. */
export function resetPexelsMemory(): void {
  searchCache.clear()
  lastReset = null
}

function numberHeader(response: SafeResponse, name: string): number | null {
  const value = Number(response.headers.get(name) ?? '')
  return Number.isFinite(value) && value >= 0 && response.headers.get(name) !== null ? Math.floor(value) : null
}

function rateLimitOf(response: SafeResponse): RateLimit {
  const limit = { remaining: numberHeader(response, 'x-ratelimit-remaining'), reset: numberHeader(response, 'x-ratelimit-reset') }
  if (limit.reset !== null) lastReset = limit.reset
  return limit
}

const two = (value: number) => String(value).padStart(2, '0')

/** `14:05` today, `2026-10-01 00:00` on another day. Local time of this machine: it is the owner's machine. */
export function formatReset(resetSeconds: number, nowMs: number): string {
  const at = new Date(resetSeconds * 1000)
  const now = new Date(nowMs)
  const time = `${two(at.getHours())}:${two(at.getMinutes())}`
  const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate()
  return sameDay ? time : `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${time}`
}

function rateLimitError(nowMs: number): PexelsError {
  const known = lastReset !== null && lastReset * 1000 > nowMs ? lastReset : null
  const when = known !== null ? `at ${formatReset(known, nowMs)}` : 'in about one hour'
  return new PexelsError(429, `Pexels rate limit reached, try again ${when}`, known)
}

/** One guarded GET to the API. Answers the parsed JSON of a 200. Every other case is a `PexelsError`. */
async function callApi(path: string, options: PexelsOptions, budget: RequestBudget): Promise<{ json: unknown, response: SafeResponse }> {
  const key = usableKey(options.key)
  const now = options.now ?? Date.now
  let response: SafeResponse
  try {
    response = await safeRequest(`https://${PEXELS_API_HOST}${path}`, {
      accept: 'application/json',
      maxBytes: MAX_JSON_BYTES,
      overflow: 'fail',
      onlyHosts: [PEXELS_API_HOST],
      headers: { authorization: key },
    }, { budget, signal: options.signal, transport: options.transport, lookup: options.lookup })
  }
  catch (error) {
    const reason = error instanceof UnfurlError ? error.reason : 'offline or the site did not answer'
    throw new PexelsError(reason === 'timeout' ? 504 : 502, `Cannot reach Pexels (${reason})`)
  }
  if (response.status === 401 || response.status === 403) throw new PexelsError(401, 'The Pexels key is wrong')
  if (response.status === 429) throw rateLimitError(now())
  if (response.status === 404) throw new PexelsError(404, 'Pexels does not have this photo')
  if (response.status !== 200) throw new PexelsError(502, `Pexels answered with http ${response.status}`)
  try {
    return { json: JSON.parse(response.body.toString('utf8')) as unknown, response }
  }
  catch {
    throw new PexelsError(502, 'Pexels sent an answer that is not JSON')
  }
}

/** Input: already validated with `SearchInputSchema`. Identical searches are answered from memory for 10 minutes. */
export async function searchPhotos(input: SearchInput, options: PexelsOptions): Promise<SearchResult> {
  usableKey(options.key)
  const now = options.now ?? Date.now
  const cacheKey = JSON.stringify([input.q.toLowerCase(), input.page, input.orientation ?? ''])
  const cached = searchCache.get(cacheKey)
  if (cached && now() - cached.at < SEARCH_CACHE_MS) return cached.result

  const query = new URLSearchParams({ query: input.q, page: String(input.page), per_page: String(PER_PAGE) })
  if (input.orientation) query.set('orientation', input.orientation)
  const { json, response } = await callApi(`/v1/search?${query.toString()}`, options, newBudget(options.signal, SEARCH_TIMEOUT_MS))
  const answer = SearchAnswerSchema.safeParse(json)
  if (!answer.success) throw new PexelsError(502, 'Pexels sent an answer this editor does not understand')

  const result: SearchResult = {
    photos: answer.data.photos.flatMap((raw) => {
      const photo = toPhoto(raw)
      return photo ? [photo] : []
    }),
    page: input.page,
    hasMore: Boolean(answer.data.next_page) && input.page < MAX_PAGE,
    rateLimit: rateLimitOf(response),
  }
  if (searchCache.size >= SEARCH_CACHE_ENTRIES) {
    const oldest = searchCache.keys().next().value
    if (oldest !== undefined) searchCache.delete(oldest)
  }
  searchCache.set(cacheKey, { at: now(), result })
  return result
}

// ---------------------------------------------------------------------------
// Pick: ID -> API -> images.pexels.com -> sharp -> public/blocks/pexels-<id>.webp
// ---------------------------------------------------------------------------

interface SavedImage {
  width: number
  height: number
}

async function encodeAndWrite(body: Buffer, file: string): Promise<SavedImage> {
  const { default: sharp } = await import('sharp')
  let output: { data: Buffer, info: { width: number, height: number } }
  try {
    output = await sharp(body, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_SIDE_PX, height: MAX_SIDE_PX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true })
  }
  catch {
    throw new PexelsError(415, 'The file from Pexels is not a picture this editor can read')
  }
  if (sniffImage(output.data) !== 'webp') throw new PexelsError(500, 'The picture could not be written as WebP')
  const tmp = `${file}.${process.pid}.tmp`
  try {
    await writeFile(tmp, output.data)
    await rename(tmp, file)
  }
  catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw error
  }
  return { width: output.info.width, height: output.info.height }
}

/** Size of a file this module wrote before. `null` = not a readable WebP: it is written again. */
async function sizeOfSaved(file: string): Promise<SavedImage | null> {
  try {
    const { default: sharp } = await import('sharp')
    const meta = await sharp(file, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
    return meta.format === 'webp' && meta.width && meta.height ? { width: meta.width, height: meta.height } : null
  }
  catch {
    return null
  }
}

/** One job per photo id at a time: two clicks on the same photo never write the same file twice. */
const picking = new Map<string, Promise<PickResult>>()

async function runPick(input: PickInput, options: PexelsOptions): Promise<PickResult> {
  const budget = newBudget(options.signal, PICK_TIMEOUT_MS)
  // The photo is read from the API by its id. The caller never names a URL.
  const { json, response } = await callApi(`/v1/photos/${input.id}`, options, budget)
  rateLimitOf(response)
  const parsed = PhotoSchema.safeParse(json)
  if (!parsed.success || parsed.data.id !== input.id) throw new PexelsError(502, 'Pexels sent an answer this editor does not understand')
  const photo = parsed.data

  const dir = options.dir ?? resolve(ROOT, 'public/blocks')
  const name = `pexels-${input.id}.webp`
  const file = resolve(dir, name)
  let saved = existsSync(file) ? await sizeOfSaved(file) : null
  if (!saved) {
    const download = httpsOn(photo.src[input.size], [PEXELS_IMAGE_HOST]) ?? httpsOn(photo.src.large, [PEXELS_IMAGE_HOST])
    if (!download) throw new PexelsError(502, 'The photo file is not on images.pexels.com. Nothing was downloaded.')
    let picture: SafeResponse
    try {
      picture = await safeRequest(download, {
        accept: 'image/jpeg,image/webp,image/png',
        maxBytes: MAX_DOWNLOAD_BYTES,
        overflow: 'fail',
        onlyHosts: [PEXELS_IMAGE_HOST],
      }, { budget, signal: options.signal, transport: options.transport, lookup: options.lookup })
    }
    catch (error) {
      const reason = error instanceof UnfurlError ? error.reason : 'offline or the site did not answer'
      throw new PexelsError(reason === 'file too large' ? 413 : 502, `Cannot download the photo (${reason})`)
    }
    if (picture.status !== 200) throw new PexelsError(502, `Cannot download the photo (http ${picture.status})`)
    const kind = sniffImage(picture.body)
    if (kind !== 'jpeg' && kind !== 'png' && kind !== 'webp') throw new PexelsError(415, 'The file from Pexels is not a jpeg, png or webp picture')
    await mkdir(dir, { recursive: true })
    saved = await encodeAndWrite(picture.body, file)
  }

  const author = cleanText(photo.photographer ?? undefined, NAME_MAX)
  const authorUrl = httpsOn(photo.photographer_url, PEXELS_PAGE_HOSTS)
  return {
    src: `/blocks/${name}`,
    width: saved.width,
    height: saved.height,
    alt: cleanText(photo.alt ?? undefined, ALT_MAX) ?? (author ? `Photo by ${author}` : 'Photo from Pexels'),
    source: {
      provider: 'pexels',
      id: String(input.id),
      url: pageUrlOf(photo),
      ...(author ? { author } : {}),
      ...(authorUrl ? { authorUrl } : {}),
    },
  }
}

/** Input: already validated with `PickInputSchema`. A file that exists is used again (no second download). */
export function pickPhoto(input: PickInput, options: PexelsOptions): Promise<PickResult> {
  const running = picking.get(String(input.id))
  if (running) return running
  const job = runPick(input, options).finally(() => picking.delete(String(input.id)))
  picking.set(String(input.id), job)
  return job
}
