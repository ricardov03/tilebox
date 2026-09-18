/**
 * The Pexels engine (content/pexels.ts). WP12. No browser, no internet, no real key.
 * A mocked `transport` plays `api.pexels.com` and `images.pexels.com`, a mocked `lookup` answers every
 * host with a public address, so the real guard of content/unfurl.ts runs but nothing leaves the machine.
 * Files go to a temp folder (`dir`), never to `public/blocks/`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import {
  formatReset,
  isConfigured,
  MAX_SIDE_PX,
  PER_PAGE,
  PexelsError,
  PickInputSchema,
  pickPhoto,
  resetPexelsMemory,
  SEARCH_CACHE_MS,
  SearchInputSchema,
  searchPhotos,
  type PexelsOptions,
} from '../../content/pexels'
import { sniffImage, type Transport, type TransportResponse } from '../../content/unfurl'
import { pruneLinkFiles } from '../../content/unfurl-cache'
import { ImageBlockSchema } from '../../types/profile'
import { imageCredit } from '../../app/components/blocks/media'
import { readProfile, ROOT } from './helpers'

const KEY = 'test-key-5f2c9a7e41b8d3c6-never-a-real-key'
const NOW = Date.parse('2026-09-18T10:00:00Z')
const RESET = Math.floor(NOW / 1000) + 1800

interface Call {
  url: URL
  headers: Record<string, string>
}

interface Reply {
  status?: number
  headers?: Record<string, string>
  body?: Buffer | string
}

function respond(reply: Reply): TransportResponse {
  const body = typeof reply.body === 'string' ? Buffer.from(reply.body) : reply.body
  return {
    status: reply.status ?? 200,
    headers: new Headers(reply.headers ?? {}),
    body: body
      ? (async function* () {
          yield new Uint8Array(body)
        })()
      : null,
  }
}

/** A transport that records every call and answers from `handler`. */
function mock(handler: (url: URL) => Reply): { transport: Transport, calls: Call[], to: (host: string) => Call[] } {
  const calls: Call[] = []
  return {
    calls,
    to: host => calls.filter(call => call.url.hostname === host),
    transport: async (url, init) => {
      calls.push({ url, headers: init.headers })
      return respond(handler(url))
    },
  }
}

const lookup: PexelsOptions['lookup'] = async () => [{ address: '151.101.1.10', family: 4 }]

function apiPhoto(id: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    width: 4000,
    height: 3000,
    url: `https://www.pexels.com/photo/a-desk-${id}/`,
    photographer: 'Ada Example',
    photographer_url: 'https://www.pexels.com/@ada',
    photographer_id: 7,
    avg_color: '#8899AA',
    alt: 'A desk with a laptop',
    liked: false,
    src: {
      original: `https://images.pexels.com/photos/${id}/o.jpeg`,
      large2x: `https://images.pexels.com/photos/${id}/o.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940`,
      large: `https://images.pexels.com/photos/${id}/o.jpeg?auto=compress&cs=tinysrgb&h=650&w=940`,
      medium: `https://images.pexels.com/photos/${id}/o.jpeg?auto=compress&cs=tinysrgb&h=350`,
      small: `https://images.pexels.com/photos/${id}/o.jpeg?auto=compress&cs=tinysrgb&h=130`,
    },
    ...over,
  }
}

const RATE_HEADERS = { 'x-ratelimit-limit': '20000', 'x-ratelimit-remaining': '19684', 'x-ratelimit-reset': String(RESET) }

function searchAnswer(photos: unknown[], next = true): Reply {
  return {
    headers: { 'content-type': 'application/json', ...RATE_HEADERS },
    body: JSON.stringify({ page: 1, per_page: PER_PAGE, total_results: 900, photos, ...(next ? { next_page: 'https://api.pexels.com/v1/search?page=2' } : {}) }),
  }
}

async function failure(job: Promise<unknown>): Promise<PexelsError> {
  try {
    await job
  }
  catch (error) {
    expect(error).toBeInstanceOf(PexelsError)
    if (error instanceof PexelsError) return error
  }
  throw new Error('The call did not fail')
}

let dir = ''
let bigJpeg: Buffer

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tilebox-pexels-'))
  bigJpeg = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#3366cc' } })
    .withExif({ IFD0: { Copyright: 'secret camera owner', Artist: 'exif artist' } })
    .jpeg({ quality: 90 })
    .toBuffer()
})

test.afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

test.beforeEach(() => {
  resetPexelsMemory()
})

test.describe('search', () => {
  test('sends the key to api.pexels.com and maps the answer to the small shape', async () => {
    const net = mock(() => searchAnswer([
      apiPhoto(11),
      apiPhoto(12, { alt: null, avg_color: 'red', photographer_url: 'https://evil.test/@x', url: 'javascript:alert(1)' }),
      apiPhoto(13, { src: { medium: 'https://evil.test/m.jpg', small: 'http://images.pexels.com/s.jpg' } }),
      { id: 'nope' },
    ]))
    const result = await searchPhotos({ q: 'desk', page: 1, orientation: 'landscape' }, { key: ` ${KEY}\n`, transport: net.transport, lookup, now: () => NOW })

    expect(net.calls).toHaveLength(1)
    const call = net.calls[0]!
    expect(call.url.origin).toBe('https://api.pexels.com')
    expect(call.url.pathname).toBe('/v1/search')
    expect(Object.fromEntries(call.url.searchParams)).toEqual({ query: 'desk', page: '1', per_page: String(PER_PAGE), orientation: 'landscape' })
    expect(call.headers.authorization).toBe(KEY)

    expect(result.page).toBe(1)
    expect(result.hasMore).toBe(true)
    expect(result.rateLimit).toEqual({ remaining: 19684, reset: RESET })
    // The third photo has no thumbnail on images.pexels.com, the fourth is not a photo: both are dropped.
    expect(result.photos.map(photo => photo.id)).toEqual([11, 12])
    expect(result.photos[0]).toEqual({
      id: 11,
      width: 4000,
      height: 3000,
      alt: 'A desk with a laptop',
      avgColor: '#8899AA',
      photographer: 'Ada Example',
      photographerUrl: 'https://www.pexels.com/@ada',
      pageUrl: 'https://www.pexels.com/photo/a-desk-11/',
      thumb: 'https://images.pexels.com/photos/11/o.jpeg?auto=compress&cs=tinysrgb&h=350',
      preview: 'https://images.pexels.com/photos/11/o.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    })
    // Bad values never pass: a colour that is not #rrggbb, links that are not https on pexels.com.
    expect(result.photos[1]).toMatchObject({ alt: '', avgColor: null, photographerUrl: null, pageUrl: 'https://www.pexels.com/photo/12/' })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  test('an empty answer is a result, not an error', async () => {
    const net = mock(() => searchAnswer([], false))
    const result = await searchPhotos({ q: 'zzzzqqq', page: 1 }, { key: KEY, transport: net.transport, lookup, now: () => NOW })
    expect(result).toEqual({ photos: [], page: 1, hasMore: false, rateLimit: { remaining: 19684, reset: RESET } })
    expect(net.calls[0]!.url.searchParams.has('orientation')).toBe(false)
  })

  test('an identical search is answered from memory for 10 minutes', async () => {
    const net = mock(() => searchAnswer([apiPhoto(21)]))
    let now = NOW
    const options: PexelsOptions = { key: KEY, transport: net.transport, lookup, now: () => now }
    const first = await searchPhotos({ q: 'Desk', page: 1 }, options)
    now += SEARCH_CACHE_MS - 1000
    expect(await searchPhotos({ q: 'desk', page: 1 }, options)).toBe(first)
    expect(net.calls).toHaveLength(1)
    await searchPhotos({ q: 'desk', page: 2 }, options)
    expect(net.calls).toHaveLength(2)
    now += 2000
    await searchPhotos({ q: 'desk', page: 1 }, options)
    expect(net.calls).toHaveLength(3)
  })

  test('401 -> "The Pexels key is wrong", and the text never holds the key', async () => {
    const net = mock(() => ({ status: 401, body: '{"error":"Unauthorized"}' }))
    const error = await failure(searchPhotos({ q: 'desk', page: 1 }, { key: KEY, transport: net.transport, lookup, now: () => NOW }))
    expect(error.status).toBe(401)
    expect(error.message).toBe('The Pexels key is wrong')
    expect(error.message).not.toContain(KEY)
  })

  test('429 -> the message names the reset time of the last good answer (a 429 has no rate-limit headers)', async () => {
    let limited = false
    const net = mock(() => (limited ? { status: 429, body: 'Too Many Requests' } : searchAnswer([apiPhoto(31)])))
    const options: PexelsOptions = { key: KEY, transport: net.transport, lookup, now: () => NOW }
    await searchPhotos({ q: 'one', page: 1 }, options)
    limited = true
    const error = await failure(searchPhotos({ q: 'two', page: 1 }, options))
    expect(error.status).toBe(429)
    expect(error.reset).toBe(RESET)
    expect(error.message).toBe(`Pexels rate limit reached, try again at ${formatReset(RESET, NOW)}`)
    expect(error.message).toMatch(/try again at \d{2}:\d{2}$/)

    resetPexelsMemory()
    const unknown = await failure(searchPhotos({ q: 'three', page: 1 }, options))
    expect(unknown.message).toBe('Pexels rate limit reached, try again in about one hour')
    expect(unknown.reset).toBeNull()
  })

  test('formatReset: the time today, the date and the time on another day', () => {
    expect(formatReset(RESET, NOW)).toMatch(/^\d{2}:\d{2}$/)
    expect(formatReset(RESET + 40 * 24 * 3600, NOW)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  test('no key, or a key that cannot be a header: no request is made', async () => {
    const net = mock(() => searchAnswer([]))
    const none = await failure(searchPhotos({ q: 'desk', page: 1 }, { key: '  ', transport: net.transport, lookup }))
    expect(none.status).toBe(503)
    const broken = await failure(searchPhotos({ q: 'desk', page: 1 }, { key: 'abc\r\nx-evil: 1', transport: net.transport, lookup }))
    expect(broken.status).toBe(401)
    expect(net.calls).toHaveLength(0)
    expect(isConfigured(undefined)).toBe(false)
    expect(isConfigured(' ')).toBe(false)
    expect(isConfigured(KEY)).toBe(true)
  })

  test('a redirect of the API to another host is refused and never gets the key', async () => {
    const net = mock(url => (url.hostname === 'api.pexels.com' ? { status: 302, headers: { location: 'https://evil.test/collect' } } : { body: '{}' }))
    const error = await failure(searchPhotos({ q: 'desk', page: 1 }, { key: KEY, transport: net.transport, lookup, now: () => NOW }))
    expect(error.status).toBe(502)
    expect(error.message).toContain('blocked host')
    expect(net.to('evil.test')).toHaveLength(0)
  })

  test('offline: one clear line', async () => {
    const error = await failure(searchPhotos({ q: 'desk', page: 1 }, {
      key: KEY,
      lookup: async () => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
      },
    }))
    expect(error.status).toBe(502)
    expect(error.message).toBe('Cannot reach Pexels (offline or unknown host)')
  })
})

test.describe('input validation', () => {
  test('search: q 1..80, page 1..50, orientation enum, no other key', () => {
    expect(SearchInputSchema.parse({ q: '  desk ' })).toEqual({ q: 'desk', page: 1 })
    expect(SearchInputSchema.parse({ q: 'desk', page: '50', orientation: 'square' })).toEqual({ q: 'desk', page: 50, orientation: 'square' })
    for (const bad of [
      {},
      { q: '' },
      { q: '   ' },
      { q: 'x'.repeat(81) },
      { q: 'desk', page: '0' },
      { q: 'desk', page: '51' },
      { q: 'desk', page: '1.5' },
      { q: 'desk', page: 'two' },
      { q: 'desk', orientation: 'wide' },
      { q: 'desk', per_page: '80' },
      { q: ['a', 'b'] },
    ]) {
      expect(SearchInputSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
  })

  test('pick: a number id and a known size, never a URL', () => {
    expect(PickInputSchema.parse({ id: 5 })).toEqual({ id: 5, size: 'large2x' })
    expect(PickInputSchema.parse({ id: 5, size: 'large' })).toEqual({ id: 5, size: 'large' })
    for (const bad of [
      {},
      { id: '5' },
      { id: 0 },
      { id: -1 },
      { id: 1.5 },
      { id: 5, size: 'original' },
      { id: 5, url: 'https://images.pexels.com/x.jpg' },
      { id: 5, src: 'https://evil.test/x.jpg' },
      null,
    ]) {
      expect(PickInputSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
    }
  })
})

test.describe('pick', () => {
  function pexels(id: number, photo: Record<string, unknown>, image: Reply) {
    return mock((url) => {
      if (url.hostname === 'api.pexels.com' && url.pathname === `/v1/photos/${id}`) {
        return { headers: { 'content-type': 'application/json', ...RATE_HEADERS }, body: JSON.stringify(photo) }
      }
      if (url.hostname === 'images.pexels.com') return image
      return { status: 404 }
    })
  }

  test('writes a new WebP (1600 px, no metadata) and answers src + source; a second call downloads nothing', async () => {
    const net = pexels(101, apiPhoto(101), { headers: { 'content-type': 'image/jpeg' }, body: bigJpeg })
    const options: PexelsOptions = { key: KEY, transport: net.transport, lookup, now: () => NOW, dir }
    const result = await pickPhoto({ id: 101, size: 'large2x' }, options)

    expect(result).toEqual({
      src: '/blocks/pexels-101.webp',
      width: MAX_SIDE_PX,
      height: 800,
      alt: 'A desk with a laptop',
      source: { provider: 'pexels', id: '101', url: 'https://www.pexels.com/photo/a-desk-101/', author: 'Ada Example', authorUrl: 'https://www.pexels.com/@ada' },
    })
    // The answer fits the profile contract as it is.
    expect(ImageBlockSchema.safeParse({ id: 'px', type: 'image', size: '2x2', src: result.src, alt: result.alt, source: result.source }).success).toBe(true)

    const file = join(dir, 'pexels-101.webp')
    const bytes = readFileSync(file)
    expect(sniffImage(bytes)).toBe('webp')
    expect(bytes.equals(bigJpeg)).toBe(false)
    const meta = await sharp(bytes).metadata()
    expect([meta.width, meta.height]).toEqual([1600, 800])
    expect(meta.exif).toBeUndefined()
    expect(bytes.includes(Buffer.from('secret camera owner'))).toBe(false)
    expect(readdirSync(dir)).toEqual(['pexels-101.webp'])

    // The key went to the API only. The download is the large2x file.
    expect(net.to('api.pexels.com')[0]!.headers.authorization).toBe(KEY)
    const download = net.to('images.pexels.com')
    expect(download).toHaveLength(1)
    expect(download[0]!.headers.authorization).toBeUndefined()
    expect(download[0]!.url.searchParams.get('dpr')).toBe('2')
    expect(JSON.stringify(result)).not.toContain(KEY)

    const before = statSync(file).mtimeMs
    const again = await pickPhoto({ id: 101, size: 'large2x' }, options)
    expect(again).toEqual(result)
    expect(net.to('images.pexels.com')).toHaveLength(1)
    expect(statSync(file).mtimeMs).toBe(before)
  })

  test('refuses a file URL that is not https on images.pexels.com: nothing is downloaded', async () => {
    const photo = apiPhoto(102, { src: { large2x: 'https://evil.test/photo.jpg', large: 'http://images.pexels.com/photo.jpg', original: 'https://images.pexels.com.evil.test/o.jpg' } })
    const net = pexels(102, photo, { body: bigJpeg })
    const error = await failure(pickPhoto({ id: 102, size: 'large2x' }, { key: KEY, transport: net.transport, lookup, dir }))
    expect(error.status).toBe(502)
    expect(error.message).toContain('not on images.pexels.com')
    expect(net.calls.map(call => call.url.hostname)).toEqual(['api.pexels.com'])
    expect(existsSync(join(dir, 'pexels-102.webp'))).toBe(false)
  })

  test('refuses a redirect of the image host to another host', async () => {
    const net = pexels(103, apiPhoto(103), { status: 302, headers: { location: 'https://evil.test/photo.jpg' } })
    const error = await failure(pickPhoto({ id: 103, size: 'large2x' }, { key: KEY, transport: net.transport, lookup, dir }))
    expect(error.message).toBe('Cannot download the photo (blocked host)')
    expect(net.to('evil.test')).toHaveLength(0)
    expect(existsSync(join(dir, 'pexels-103.webp'))).toBe(false)
  })

  test('refuses a fake jpeg by its magic bytes, a gif, and bytes sharp cannot decode', async () => {
    const cases: [number, Buffer][] = [
      [104, Buffer.from('<html><script>alert(1)</script></html>')],
      [105, Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64)])],
      [106, Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.from('not really a jpeg at all')])],
    ]
    for (const [id, body] of cases) {
      const net = pexels(id, apiPhoto(id), { headers: { 'content-type': 'image/jpeg' }, body })
      const error = await failure(pickPhoto({ id, size: 'large2x' }, { key: KEY, transport: net.transport, lookup, dir }))
      expect(error.status, String(id)).toBe(415)
      expect(existsSync(join(dir, `pexels-${id}.webp`))).toBe(false)
    }
    expect(readdirSync(dir).filter(name => name.endsWith('.tmp'))).toEqual([])
  })

  test('refuses a file over 15 MB while it is read', async () => {
    const net = pexels(107, apiPhoto(107), { body: Buffer.alloc(15 * 1024 * 1024 + 1, 1) })
    const error = await failure(pickPhoto({ id: 107, size: 'large2x' }, { key: KEY, transport: net.transport, lookup, dir }))
    expect(error.status).toBe(413)
  })

  test('an API answer for another id, a 404 and a 429 are errors', async () => {
    const other = pexels(108, apiPhoto(999), { body: bigJpeg })
    expect((await failure(pickPhoto({ id: 108, size: 'large2x' }, { key: KEY, transport: other.transport, lookup, dir }))).status).toBe(502)
    const missing = mock(() => ({ status: 404 }))
    expect((await failure(pickPhoto({ id: 109, size: 'large2x' }, { key: KEY, transport: missing.transport, lookup, dir }))).status).toBe(404)
    const limited = mock(() => ({ status: 429 }))
    expect((await failure(pickPhoto({ id: 110, size: 'large2x' }, { key: KEY, transport: limited.transport, lookup, dir }))).status).toBe(429)
  })

  test('without a photographer the alt and the source still fit', async () => {
    const small = await sharp({ create: { width: 300, height: 600, channels: 3, background: '#aa3311' } }).png().toBuffer()
    const net = pexels(111, apiPhoto(111, { alt: '', photographer: null, photographer_url: null }), { body: small })
    const result = await pickPhoto({ id: 111, size: 'large' }, { key: KEY, transport: net.transport, lookup, dir })
    expect(result).toEqual({
      src: '/blocks/pexels-111.webp',
      width: 300,
      height: 600,
      alt: 'Photo from Pexels',
      source: { provider: 'pexels', id: '111', url: 'https://www.pexels.com/photo/a-desk-111/' },
    })
    expect(net.to('images.pexels.com')[0]!.url.searchParams.get('dpr')).toBeNull()
  })
})

test('fetch:links housekeeping never touches public/blocks', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tilebox-prune-'))
  try {
    for (const name of ['icons', 'thumbs', 'blocks']) mkdirSync(join(root, name))
    writeFileSync(join(root, 'icons/orphan.png'), 'x')
    writeFileSync(join(root, 'blocks/pexels-1.webp'), 'x')
    const removed = await pruneLinkFiles(readProfile(), { dirs: { icons: join(root, 'icons'), thumbs: join(root, 'thumbs'), cache: join(root, 'cache.json') } })
    expect(removed).toEqual(['/icons/orphan.png'])
    expect(existsSync(join(root, 'blocks/pexels-1.webp'))).toBe(true)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test.describe('the credit line (imageCredit)', () => {
  test('pexels: the author and the provider, each with its link', () => {
    expect(imageCredit({ provider: 'pexels', url: 'https://www.pexels.com/photo/desk-1/', author: 'Ada Example', authorUrl: 'https://www.pexels.com/@ada' }))
      .toEqual({ author: 'Ada Example', authorUrl: 'https://www.pexels.com/@ada', provider: 'Pexels', providerUrl: 'https://www.pexels.com/photo/desk-1/' })
  })

  test('pexels is always credited: no author, no photo URL, or a URL that is not http(s)', () => {
    expect(imageCredit({ provider: 'pexels' })).toEqual({ author: null, authorUrl: null, provider: 'Pexels', providerUrl: 'https://www.pexels.com' })
    expect(imageCredit({ provider: 'pexels', url: 'javascript:alert(1)', author: ' Ada ', authorUrl: 'javascript:alert(2)' }))
      .toEqual({ author: 'Ada', authorUrl: null, provider: 'Pexels', providerUrl: 'https://www.pexels.com' })
  })

  test('the URLs stay as they are: no tracking parameters are added', () => {
    const credit = imageCredit({ provider: 'pexels', url: 'https://www.pexels.com/photo/desk-1/', author: 'Ada', authorUrl: 'https://www.pexels.com/@ada' })
    expect(`${credit?.authorUrl}${credit?.providerUrl}`).not.toMatch(/[?&]utm_/)
  })

  test('no source, or an own file without an author: no line', () => {
    expect(imageCredit(null)).toBeNull()
    expect(imageCredit(undefined)).toBeNull()
    expect(imageCredit({ provider: 'r2' })).toBeNull()
    expect(imageCredit({ provider: 'r2', author: 'Me' })).toEqual({ author: 'Me', authorUrl: null, provider: null, providerUrl: null })
  })
})

/**
 * The key canary. To make the VALUE check real, build with the dummy key:
 * `PEXELS_API_KEY=tilebox-canary-pexels-key-0f3a9c npm run generate`. A key in `.env` or in the
 * environment of this run is looked for too. Only file names are printed, never a key.
 */
test.describe('the Pexels key stays on the server', () => {
  const NAME = ['PEXELS', 'API', 'KEY'].join('_')
  const CANARY = 'tilebox-canary-pexels-key-0f3a9c'
  const TEXT = /\.(html|json|js|mjs|css|txt|xml|svg|map|webmanifest|vue|ts)$/

  function textFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : textFiles(path)
      return TEXT.test(entry.name) ? [path] : []
    })
  }

  function filesWith(dir: string, needle: string): string[] {
    return textFiles(dir).filter(file => readFileSync(file, 'utf8').includes(needle)).map(file => relative(ROOT, file))
  }

  /** The dummy key, plus the owner's real key when this machine has one. */
  function keyValues(): string[] {
    const values = new Set([CANARY])
    const fromEnv = (process.env[NAME] ?? '').trim()
    if (fromEnv.length >= 8) values.add(fromEnv)
    const envFile = resolve(ROOT, '.env')
    if (existsSync(envFile)) {
      const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find(item => item.trim().startsWith(`${NAME}=`)) ?? ''
      const value = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
      if (value.length >= 8) values.add(value)
    }
    return [...values]
  }

  /** `dist/` always. `.nuxt/dist/client` and `.output/server` only when a build left them. */
  const builtDirs = () => ['dist', '.nuxt/dist/client', '.output/server'].map(dir => resolve(ROOT, dir)).filter(dir => existsSync(dir)).map(dir => realpathSync(dir))

  test('no built file holds the name of the variable, a key value or the engine', () => {
    const dirs = builtDirs()
    expect(dirs.some(dir => existsSync(join(dir, 'index.html')))).toBe(true)
    for (const dir of dirs) {
      const where = relative(ROOT, dir) || dir
      expect(filesWith(dir, NAME), `${where}: the variable name`).toEqual([])
      for (const value of keyValues()) expect(filesWith(dir, value), `${where}: a key value`).toEqual([])
      // The engine is dev only: a build has no copy of it.
      expect(filesWith(dir, 'api.pexels.com'), `${where}: the engine`).toEqual([])
    }
  })

  test('no client source reads the key, and the config does not publish it', () => {
    expect(filesWith(resolve(ROOT, 'app'), NAME)).toEqual([])
    const config = readFileSync(resolve(ROOT, 'nuxt.config.ts'), 'utf8')
    expect(config).not.toContain(NAME)
    expect(config.toLowerCase()).not.toContain('pexels')
  })

  test('.env is ignored, and the tracked example has no value', () => {
    expect(execFileSync('git', ['check-ignore', '-v', '.env'], { cwd: ROOT, encoding: 'utf8' })).toContain('.env')
    expect(execFileSync('git', ['ls-files', '.env'], { cwd: ROOT, encoding: 'utf8' }).trim()).toBe('')
    expect(readFileSync(resolve(ROOT, '.env.example'), 'utf8')).toMatch(new RegExp(`^${NAME}=$`, 'm'))
  })
})
