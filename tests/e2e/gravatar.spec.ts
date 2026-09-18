/**
 * The Gravatar download (`fetchGravatar` in content/gravatar-fetch.ts). No browser, no internet: a mocked
 * `transport` plays gravatar.com through the guarded request of content/unfurl.ts, a mocked `lookup`
 * answers with a public address, and the target file lives in a temp folder (`targetFile`), never in `public/`.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { GRAVATAR_HOSTS, gravatarHash } from '../../content/gravatar'
import { fetchGravatar, type FetchGravatarOptions } from '../../content/gravatar-fetch'
import { sniffImage, type Transport } from '../../content/unfurl'
import { GRAVATAR_PUBLIC_PATH } from '../../types/profile'

const EMAIL = 'someone@tilebox.test'
const OLD_BYTES = 'old picture'
const FILE_NAME = GRAVATAR_PUBLIC_PATH.slice(1)
const LEGACY_NAME = 'avatar.gravatar.jpg'

interface Reply {
  status: number
  type?: string
  location?: string
  body?: Buffer
}

let dir = ''
let target = ''
let calls: URL[] = []

/** A transport that records every call and answers from `handler`. */
function net(handler: (url: URL) => Reply): Pick<FetchGravatarOptions, 'transport' | 'lookup'> {
  const transport: Transport = async (url) => {
    calls.push(url)
    const reply = handler(url)
    const headers = new Map<string, string>()
    if (reply.type) headers.set('content-type', reply.type)
    if (reply.location) headers.set('location', reply.location)
    const body = reply.body
    return {
      status: reply.status,
      headers: { get: name => headers.get(name.toLowerCase()) ?? null },
      body: body
        ? (async function* () {
            yield new Uint8Array(body)
          })()
        : null,
    }
  }
  return { transport, lookup: async () => [{ address: '151.101.1.10', family: 4 }] }
}

const notFound = (): Reply => ({ status: 404, type: 'text/html; charset=utf-8', body: Buffer.from('404 Not Found') })

/** A real picture with metadata, as Gravatar could send it. */
async function realPng(side = 600): Promise<Buffer> {
  return sharp({ create: { width: side, height: side, channels: 4, background: { r: 30, g: 90, b: 200, alpha: 0.5 } } })
    .withExif({ IFD0: { Copyright: 'tilebox-test-marker' } })
    .png()
    .toBuffer()
}

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tilebox-gravatar-'))
  target = join(dir, FILE_NAME)
  writeFileSync(target, OLD_BYTES)
  calls = []
})

test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

test('the file is a WebP, and the request goes to gravatar.com over https with the sha256 of the email', async () => {
  expect(GRAVATAR_PUBLIC_PATH).toBe('/avatar.gravatar.webp')
  await fetchGravatar(` ${EMAIL.toUpperCase()} `, { allowDelete: false, targetFile: target, ...net(notFound) })
  expect(calls).toHaveLength(1)
  expect(calls[0]!.protocol).toBe('https:')
  expect(GRAVATAR_HOSTS).toContain(calls[0]!.hostname)
  expect(calls[0]!.pathname).toBe(`/avatar/${gravatarHash(EMAIL)}`)
  expect(calls[0]!.searchParams.get('d')).toBe('404')
})

test('404 without allowDelete keeps the old file', async () => {
  const result = await fetchGravatar(EMAIL, { allowDelete: false, targetFile: target, ...net(notFound) })
  expect(result).toEqual({ status: 'none', message: 'avatar: no gravatar for this email' })
  expect(readFileSync(target, 'utf8')).toBe(OLD_BYTES)
})

test('404 with allowDelete removes the stale file, and the file with the old name', async () => {
  writeFileSync(join(dir, LEGACY_NAME), OLD_BYTES)
  const result = await fetchGravatar(EMAIL, { allowDelete: true, targetFile: target, ...net(notFound) })
  expect(result.status).toBe('none')
  expect(readdirSync(dir)).toEqual([])
})

test('an SVG body with an image/jpeg header is refused and the old file stays', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  const result = await fetchGravatar(EMAIL, { allowDelete: true, targetFile: target, ...net(() => ({ status: 200, type: 'image/jpeg', body: svg })) })
  expect(result).toEqual({ status: 'offline', message: 'avatar: offline, kept the old file' })
  expect(readFileSync(target, 'utf8')).toBe(OLD_BYTES)
  expect(readdirSync(dir)).toEqual([FILE_NAME])
})

test('a fake jpeg (the magic bytes, then no picture) is refused and the old file stays', async () => {
  const fake = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.from('<script>alert(1)</script>'.repeat(40))])
  expect(sniffImage(fake)).toBe('jpeg')
  const result = await fetchGravatar(EMAIL, { allowDelete: true, targetFile: target, ...net(() => ({ status: 200, type: 'image/jpeg', body: fake })) })
  expect(result.status).toBe('offline')
  expect(readFileSync(target, 'utf8')).toBe(OLD_BYTES)
  expect(readdirSync(dir)).toEqual([FILE_NAME])
})

test('text with an image/jpeg header is refused before any decode', async () => {
  const result = await fetchGravatar(EMAIL, { allowDelete: false, targetFile: target, ...net(() => ({ status: 200, type: 'image/jpeg', body: Buffer.from('new picture') })) })
  expect(result.status).toBe('offline')
  expect(readFileSync(target, 'utf8')).toBe(OLD_BYTES)
})

test('a good picture is decoded and written again: other bytes, WebP, 512 px at most, no metadata, no tmp file', async () => {
  const input = await realPng(600)
  writeFileSync(join(dir, LEGACY_NAME), OLD_BYTES)
  const result = await fetchGravatar(EMAIL, { allowDelete: false, targetFile: target, ...net(() => ({ status: 200, type: 'image/png', body: input })) })
  expect(result).toEqual({ status: 'saved', message: 'avatar: gravatar saved' })
  const stored = readFileSync(target)
  expect(stored.equals(input)).toBe(false)
  expect(sniffImage(stored)).toBe('webp')
  const meta = await sharp(stored).metadata()
  expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(512)
  expect(meta.exif).toBeUndefined()
  expect(stored.includes(Buffer.from('tilebox-test-marker'))).toBe(false)
  // The tmp file is gone, and so is the file with the old name (`.jpg`, before WP15).
  expect(readdirSync(dir)).toEqual([FILE_NAME])
})

test('a small picture is not enlarged', async () => {
  const result = await fetchGravatar(EMAIL, { allowDelete: false, targetFile: target, ...net(() => ({ status: 200, type: 'image/png', body: Buffer.alloc(0) })) })
  expect(result.status).toBe('offline')
  const small = await realPng(80)
  await fetchGravatar(EMAIL, { allowDelete: false, targetFile: target, ...net(() => ({ status: 200, type: 'image/png', body: small })) })
  expect((await sharp(readFileSync(target)).metadata()).width).toBe(80)
})

test('a picture of more than 4096x4096 pixels is refused', async () => {
  const huge = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer()
  expect(huge.byteLength).toBeLessThan(2 * 1024 * 1024)
  const result = await fetchGravatar(EMAIL, { allowDelete: false, targetFile: target, ...net(() => ({ status: 200, type: 'image/png', body: huge })) })
  expect(result.status).toBe('offline')
  expect(readFileSync(target, 'utf8')).toBe(OLD_BYTES)
})

test('more than 2 MB is refused while it is read', async () => {
  const big = Buffer.concat([await realPng(64), Buffer.alloc(2 * 1024 * 1024)])
  const result = await fetchGravatar(EMAIL, { allowDelete: false, targetFile: target, ...net(() => ({ status: 200, type: 'image/png', body: big })) })
  expect(result.status).toBe('offline')
  expect(readFileSync(target, 'utf8')).toBe(OLD_BYTES)
})

test('a redirect to another host, or to http, is refused: no request leaves the gravatar hosts', async () => {
  const picture = await realPng(64)
  for (const location of ['https://evil.example/avatar.png', 'http://gravatar.com/avatar/x', 'https://169.254.169.254/latest/meta-data']) {
    calls = []
    const result = await fetchGravatar(EMAIL, {
      allowDelete: true,
      targetFile: target,
      ...net(url => GRAVATAR_HOSTS.includes(url.hostname) && url.protocol === 'https:' && url.pathname !== '/avatar/x' ? { status: 302, location } : { status: 200, type: 'image/png', body: picture }),
    })
    expect(result.status, location).toBe('offline')
    expect(calls, location).toHaveLength(1)
    expect(readFileSync(target, 'utf8')).toBe(OLD_BYTES)
  }
  // A redirect inside the allow-list is followed.
  calls = []
  const ok = await fetchGravatar(EMAIL, {
    allowDelete: false,
    targetFile: target,
    ...net(url => url.hostname === 'gravatar.com' ? { status: 302, location: `https://secure.gravatar.com${url.pathname}` } : { status: 200, type: 'image/png', body: picture }),
  })
  expect(ok.status).toBe('saved')
  expect(calls.map(url => url.hostname)).toEqual(['gravatar.com', 'secure.gravatar.com'])
})

test('a server error or a network error keeps the old file, and never throws', async () => {
  const down = await fetchGravatar(EMAIL, { allowDelete: true, targetFile: target, ...net(() => ({ status: 503 })) })
  expect(down.status).toBe('offline')
  const broken = await fetchGravatar(EMAIL, {
    allowDelete: true,
    targetFile: target,
    lookup: async () => [{ address: '151.101.1.10', family: 4 }],
    transport: async () => {
      throw new Error('socket hang up')
    },
  })
  expect(broken.status).toBe('offline')
  expect(readFileSync(target, 'utf8')).toBe(OLD_BYTES)
})

test('a failed write removes the tmp file and keeps the result "offline"', async () => {
  const picture = await realPng(64)
  // The folder of the target does not exist: the write fails.
  const result = await fetchGravatar(EMAIL, { allowDelete: false, targetFile: join(dir, 'missing', FILE_NAME), ...net(() => ({ status: 200, type: 'image/png', body: picture })) })
  expect(result.status).toBe('offline')
  expect(readdirSync(dir)).toEqual([FILE_NAME])
  expect(existsSync(join(dir, 'missing'))).toBe(false)
})
