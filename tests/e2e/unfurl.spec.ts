/**
 * The link preview engine (content/unfurl.ts). No browser, no internet.
 * A local `node:http` server on 127.0.0.1 plays the websites. The SSRF guard
 * blocks loopback, so these tests pass `allowHosts: ['127.0.0.1']`, the option
 * that exists only for them. Every other host fails its DNS lookup here
 * (`lookup` throws), so a fallback such as the Google favicon service can never
 * reach the network. Files go to a temp folder (`dirs`), never to `public/`.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import {
  checkTarget,
  cleanText,
  decodeHtml,
  githubAvatarFor,
  isPublicAddress,
  MAX_SUB_REQUESTS,
  MAX_TOTAL_REDIRECTS,
  largestPngFromIco,
  normalizeUrl,
  oembedUrlFor,
  parseHead,
  pickBySize,
  rasterizeIcon,
  safeRequest,
  sniffImage,
  TOTAL_TIMEOUT_MS,
  unfurl,
  USER_AGENT,
  type Transport,
  type UnfurlDirs,
  type UnfurlOptions,
} from '../../content/unfurl'
import { FRESH_MS, NEGATIVE_MS, readCacheSync, readFailuresSync } from '../../content/unfurl-cache'

/** 1x1 transparent PNG. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

/** An ICO with two entries: a 16 px BMP (skipped) and a 64 px PNG. */
function makeIco(entries: { size: number, data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const directory = Buffer.alloc(16 * entries.length)
  let offset = 6 + directory.length
  entries.forEach((entry, i) => {
    const at = i * 16
    directory[at] = entry.size
    directory[at + 1] = entry.size
    directory.writeUInt16LE(1, at + 4)
    directory.writeUInt16LE(32, at + 6)
    directory.writeUInt32LE(entry.data.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += entry.data.length
  })
  return Buffer.concat([header, directory, ...entries.map(entry => entry.data)])
}

/** A BMP entry starts with its 40-byte header size, not with the PNG signature. */
const BMP_ENTRY = Buffer.concat([Buffer.from([0x28, 0, 0, 0]), Buffer.alloc(60)])
const ICO = makeIco([{ size: 16, data: BMP_ENTRY }, { size: 64, data: TINY_PNG }])

const PAGE = `<!doctype html><html><head>
<meta charset="utf-8">
<title>  Plain   title </title>
<meta property="og:title" content="OG title">
<meta name="twitter:title" content="Twitter title">
<meta name="description" content="Plain description">
<meta property="og:description" content="OG   description">
<meta property="og:site_name" content="Test Site">
<meta property="og:image" content="/real.png">
<meta property="og:image:alt" content="A red square">
<meta name="theme-color" content="#123456">
<link rel="icon" href="/favicon.ico">
</head><body><meta property="og:title" content="Body title"></body></html>`

/** The six payloads of the 2026-09-18 security review (each one passed the old regex check), plus a plain file. */
const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_PAYLOADS: Record<string, string> = {
  'prefixed-script': `<svg xmlns="${SVG_NS}" viewBox="0 0 10 10"><x:script xmlns:x="${SVG_NS}">alert(document.domain)</x:script><rect width="10" height="10" fill="#f00"/></svg>`,
  'dtd-entity': `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "&#60;script xmlns='${SVG_NS}'>alert(1)&#60;/script>">]><svg xmlns="${SVG_NS}" viewBox="0 0 10 10">&x;<rect width="10" height="10" fill="#0f0"/></svg>`,
  'entity-href': `<svg xmlns="${SVG_NS}" viewBox="0 0 10 10"><a href="java&#115;cript:alert(1)"><rect width="10" height="10" fill="#00f"/></a></svg>`,
  'data-href-script': `<svg xmlns="${SVG_NS}" viewBox="0 0 10 10"><x:script xmlns:x="${SVG_NS}" href="data:text/javascript,alert(1)"/><rect width="10" height="10" fill="#ff0"/></svg>`,
  'external-use': `<svg xmlns="${SVG_NS}" viewBox="0 0 10 10"><use href="https://evil.test/sprite.svg#a"/><image href="https://evil.test/pixel.png" width="10" height="10"/><rect width="10" height="10" fill="#0ff"/></svg>`,
  'large-96kb': `<svg xmlns="${SVG_NS}" viewBox="0 0 10 10"><!--${'x'.repeat(96 * 1024)}--><x:script xmlns:x="${SVG_NS}">alert(1)</x:script><rect width="10" height="10" fill="#f0f"/></svg>`,
  'huge-viewbox': `<svg xmlns="${SVG_NS}" width="1000000" height="1000000"><rect width="1000000" height="1000000" fill="#333"/></svg>`,
  'over-100kb': `<svg xmlns="${SVG_NS}" viewBox="0 0 10 10"><!--${'x'.repeat(101 * 1024)}--><rect width="10" height="10" fill="#999"/></svg>`,
  'plain': `<svg xmlns="${SVG_NS}" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#0c4a6e"/></svg>`,
}
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

let server: Server
let base = ''
let realPng: Buffer
const hits = new Map<string, number>()
const seenHeaders = new Map<string, IncomingMessage['headers']>()

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', base)
  const path = url.pathname
  hits.set(path, (hits.get(path) ?? 0) + 1)
  seenHeaders.set(path, req.headers)
  const html = (body: string, headers: Record<string, string> = {}) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers })
    res.end(body)
  }
  // S2. `/slow-hop/N`: 7 s (under the 8 s limit of one hop), then a redirect. 3 of them pass the 20 s of one unfurl.
  const slowHop = path.match(/^\/slow-hop\/(\d+)$/)
  if (slowHop) {
    const left = Number(slowHop[1])
    const timer = setTimeout(() => {
      res.writeHead(302, { location: left > 0 ? `/slow-hop/${left - 1}` : '/page' })
      res.end()
    }, 7000)
    res.on('close', () => clearTimeout(timer))
    return
  }
  // S2. `/ihop/N`: an icon behind N + 1 redirects.
  const iconHop = path.match(/^\/ihop\/(\d+)$/)
  if (iconHop) {
    const left = Number(iconHop[1])
    res.writeHead(302, { location: left > 0 ? `/ihop/${left - 1}` : '/real.png' })
    res.end()
    return
  }
  const pageHop = path.match(/^\/phop\/(\d+)$/)
  if (pageHop) {
    const left = Number(pageHop[1])
    res.writeHead(302, { location: left > 0 ? `/phop/${left - 1}` : '/page-ihop' })
    res.end()
    return
  }
  const hop = path.match(/^\/hop\/(\d+)$/)
  if (hop) {
    const left = Number(hop[1])
    res.writeHead(302, { location: left > 0 ? `/hop/${left - 1}` : '/page' })
    res.end()
    return
  }
  const svgPage = path.match(/^\/svg-page\/([\w-]+)$/)
  if (svgPage) return html(`<html><head><title>SVG icon</title><link rel="icon" type="image/svg+xml" href="/svg-icon/${svgPage[1]}.svg"></head></html>`)
  const svgIcon = path.match(/^\/svg-icon\/([\w-]+)\.svg$/)
  if (svgIcon) {
    res.writeHead(200, { 'content-type': 'image/svg+xml' })
    res.end(SVG_PAYLOADS[svgIcon[1] ?? ''] ?? '')
    return
  }
  switch (path) {
    case '/page':
      return html(PAGE)
    case '/page-ihop':
      return html('<html><head><title>Icon behind redirects</title><link rel="icon" type="image/png" sizes="96x96" href="/ihop/3"></head></html>')
    case '/many-requests':
      return html(`<html><head><title>Many requests</title>
        <meta property="og:image" content="/fake.png">
        <meta name="twitter:image" content="/real.png">
        <link rel="icon" type="image/svg+xml" href="/missing-a.svg">
        <link rel="apple-touch-icon" href="/missing-b.png">
        <link rel="icon" type="image/png" href="/missing-c.png">
        <link rel="manifest" href="/many.webmanifest"></head></html>`)
    case '/many.webmanifest':
      res.writeHead(200, { 'content-type': 'application/manifest+json' })
      res.end(JSON.stringify({ icons: [{ src: '/missing-d.png', sizes: '192x192' }] }))
      return
    case '/broken-icon-page':
      return html('<html><head><title>Broken icon</title><link rel="icon" type="image/png" sizes="96x96" href="/broken.png"></head></html>')
    case '/broken.png':
      // The PNG signature, then garbage: the magic bytes pass, the decoder does not.
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from('not a real png body')]))
      return
    case '/fake-image':
      return html(PAGE.replace('/real.png', '/fake.png'))
    case '/big':
      // The description comes after 600 KB of padding and there is no </head> before it.
      return html(`<html><head><title>Big page</title><!--${'x'.repeat(600 * 1024)}--><meta name="description" content="too far"></head></html>`)
    case '/etag':
      if (req.headers['if-none-match'] === '"v1"') {
        res.writeHead(304)
        res.end()
        return
      }
      return html('<html><head><title>Etag page</title></head></html>', { etag: '"v1"' })
    case '/pdf':
      res.writeHead(200, { 'content-type': 'application/pdf' })
      res.end('%PDF-1.4')
      return
    case '/to-private':
      res.writeHead(302, { location: 'http://10.0.0.1/' })
      res.end()
      return
    case '/favicon.ico':
      res.writeHead(200, { 'content-type': 'image/x-icon' })
      res.end(ICO)
      return
    case '/real.png':
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(realPng)
      return
    case '/fake.png':
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end('<html>this is not a png</html>')
      return
    default:
      res.writeHead(404)
      res.end()
  }
}

let root = ''
let dirs: UnfurlDirs
let options: UnfurlOptions

test.beforeAll(async () => {
  realPng = await sharp({ create: { width: 300, height: 240, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer()
  server = createServer(handle)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()))
})

test.beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tilebox-unfurl-'))
  dirs = { icons: join(root, 'icons'), thumbs: join(root, 'thumbs'), cache: join(root, 'cache.json') }
  options = {
    allowHosts: ['127.0.0.1'],
    dirs,
    lookup: () => Promise.reject(new Error('no DNS in tests')),
  }
  hits.clear()
  seenHeaders.clear()
})

test.afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

test.describe('pure helpers', () => {
  test('normalizeUrl: http(s) only, no credentials, no fragment, 2048 characters at most', () => {
    expect(normalizeUrl('https://user:pass@example.com/a?b=1#frag')).toBe('https://example.com/a?b=1')
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com/')
    expect(normalizeUrl('ftp://example.com')).toBeNull()
    expect(normalizeUrl('mailto:a@b.c')).toBeNull()
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('not a url')).toBeNull()
    expect(normalizeUrl(`https://example.com/${'a'.repeat(2048)}`)).toBeNull()
  })

  test('parseHead: og beats twitter beats <title>, og:description beats description, the body is ignored', () => {
    const head = parseHead(PAGE, 'https://site.test/dir/page.html')
    expect(head.title).toBe('OG title')
    expect(head.description).toBe('OG description')
    expect(head.siteName).toBe('Test Site')
    expect(head.themeColor).toBe('#123456')

    const twitter = parseHead('<head><title>T</title><meta name="twitter:title" content="Tw"></head>', 'https://site.test/')
    expect(twitter.title).toBe('Tw')
    const plain = parseHead('<head><title> Just \n a   title </title><meta name="description" content="Desc"><meta property="og:title" content="  "></head>', 'https://site.test/')
    expect(plain.title).toBe('Just a title')
    expect(plain.description).toBe('Desc')
  })

  test('parseHead: relative URLs resolve against the final URL', () => {
    const head = parseHead(`<head>
      <meta property="og:image" content="../img/cover.png">
      <meta name="twitter:image" content="//cdn.site.test/tw.png">
      <link rel="icon" type="image/svg+xml" href="icon.svg">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
      <link rel="icon" sizes="32x32 192x192" href="/fav.png">
      <link rel="manifest" href="/site.webmanifest">
      <link rel="icon" href="javascript:alert(1)">
    </head>`, 'https://site.test/blog/post/')
    expect(head.image?.url).toBe('https://site.test/blog/img/cover.png')
    expect(head.twitterImage).toBe('https://cdn.site.test/tw.png')
    expect(head.manifest).toBe('https://site.test/site.webmanifest')
    expect(head.icons).toEqual([
      { url: 'https://site.test/blog/post/icon.svg', rel: 'icon', size: 0, svg: true },
      { url: 'https://site.test/apple.png', rel: 'apple-touch-icon', size: 180, svg: false },
      { url: 'https://site.test/fav.png', rel: 'icon', size: 192, svg: false },
    ])
  })

  test('cleanText caps the length, pickBySize takes the smallest icon of 96 px or more', () => {
    expect(cleanText('a'.repeat(300), 120)).toHaveLength(120)
    expect(cleanText('   ', 120)).toBeUndefined()
    expect(pickBySize([{ size: 32 }, { size: 512 }, { size: 180 }, { size: 96 }])?.size).toBe(96)
    expect(pickBySize([{ size: 16 }, { size: 48 }])?.size).toBe(48)
  })

  test('decodeHtml: the header charset first, then <meta charset>, then utf-8', () => {
    const latin1 = Buffer.from('<meta charset="iso-8859-1"><title>caf\xE9</title>', 'latin1')
    expect(decodeHtml(latin1, 'text/html')).toContain('café')
    expect(decodeHtml(latin1, 'text/html; charset=windows-1252')).toContain('café')
    expect(decodeHtml(Buffer.from('<title>café</title>', 'utf8'), 'text/html')).toContain('café')
  })

  test('sniffImage reads the magic bytes and refuses a fake png', () => {
    expect(sniffImage(TINY_PNG)).toBe('png')
    expect(sniffImage(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]))).toBe('jpeg')
    expect(sniffImage(Buffer.from('GIF89a......'))).toBe('gif')
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp')
    expect(sniffImage(Buffer.from('\0\0\0\x1Cftypavif\0\0\0\0', 'latin1'))).toBe('avif')
    expect(sniffImage(ICO)).toBe('ico')
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg')
    expect(sniffImage(Buffer.from('<html>this is not a png</html>'))).toBeNull()
  })

  test('largestPngFromIco takes the PNG entry and skips BMP entries', () => {
    expect(largestPngFromIco(ICO)?.equals(TINY_PNG)).toBe(true)
    const two = makeIco([{ size: 32, data: TINY_PNG }, { size: 128, data: Buffer.concat([TINY_PNG, Buffer.from([1])]) }])
    expect(largestPngFromIco(two)?.length).toBe(TINY_PNG.length + 1)
    expect(largestPngFromIco(makeIco([{ size: 16, data: BMP_ENTRY }]))).toBeNull()
    expect(largestPngFromIco(TINY_PNG)).toBeNull()
  })

  test('oembedUrlFor and githubAvatarFor know their URLs', () => {
    expect(oembedUrlFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.url)
      .toBe('https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ')
    expect(oembedUrlFor('https://youtu.be/dQw4w9WgXcQ')?.provider).toBe('YouTube')
    expect(oembedUrlFor('https://x.com/nuxt_js/status/1234567890')?.provider).toBe('X')
    expect(oembedUrlFor('https://x.com/nuxt_js')).toBeNull()
    expect(oembedUrlFor('https://bsky.app/profile/nuxt.com/post/abc')?.provider).toBe('Bluesky')
    expect(oembedUrlFor('https://nuxt.com/')).toBeNull()
    expect(githubAvatarFor('https://github.com/nuxt')).toBe('https://github.com/nuxt.png?size=200')
    expect(githubAvatarFor('https://github.com/nuxt/nuxt')).toBeNull()
    expect(githubAvatarFor('https://gitlab.com/nuxt')).toBeNull()
  })
})

test.describe('the SSRF guard (no allowHosts)', () => {
  const blocked = [
    '10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.10', '172.16.0.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1',
    // S5: `::/96` (the old "IPv4-compatible" form, some stacks route it to the IPv4 address), `::`, and the mapped forms in hex.
    '::127.0.0.1', '::7f00:1', '::10.0.0.1', '::a00:1', '::169.254.169.254', '::8.8.8.8', '::', '0:0:0:0:0:0:0:0', '::ffff:0:0', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:0:7f00:1', '64:ff9b::7f00:1',
  ]

  test('private, loopback, link-local, CGNAT, unique-local and IPv4-mapped addresses are not public', () => {
    for (const address of blocked) expect(isPublicAddress(address), address).toBe(false)
    expect(isPublicAddress('93.184.216.34')).toBe(true)
    expect(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true)
    expect(isPublicAddress('not an ip')).toBe(false)
  })

  test('an IP literal in the URL is refused before any connection', async () => {
    for (const address of blocked) {
      const host = address.includes(':') ? `[${address}]` : address
      await expect(checkTarget(new URL(`http://${host}/`)), address).rejects.toMatchObject({ reason: 'blocked address' })
    }
  })

  test('a host name that resolves to a private address is refused, also when only one answer is private', async () => {
    const privateOnly = () => Promise.resolve([{ address: '192.168.1.5', family: 4 }])
    await expect(checkTarget(new URL('https://intranet.test/'), { lookup: privateOnly })).rejects.toMatchObject({ reason: 'blocked address' })
    const mixed = () => Promise.resolve([{ address: '93.184.216.34', family: 4 }, { address: '::ffff:10.0.0.1', family: 6 }])
    await expect(checkTarget(new URL('https://rebind.test/'), { lookup: mixed })).rejects.toMatchObject({ reason: 'blocked address' })
    const open = () => Promise.resolve([{ address: '93.184.216.34', family: 4 }])
    await expect(checkTarget(new URL('https://public.test/'), { lookup: open })).resolves.toEqual({ address: '93.184.216.34', family: 4 })
  })

  test('only ports 80 and 443, only http and https', async () => {
    const open = () => Promise.resolve([{ address: '93.184.216.34', family: 4 }])
    await expect(checkTarget(new URL('https://public.test:8443/'), { lookup: open })).rejects.toMatchObject({ reason: 'blocked port' })
    await expect(checkTarget(new URL('http://public.test:443/'), { lookup: open })).resolves.toBeTruthy()
    await expect(checkTarget(new URL('ftp://public.test/'), { lookup: open })).rejects.toMatchObject({ reason: 'not a web address' })
  })

  test('unfurl answers { ok: false } for a loopback URL and never connects', async () => {
    const result = await unfurl(`${base}/page`, { dirs })
    expect(result).toEqual({ ok: false, reason: 'blocked port' })
    expect(await unfurl('http://127.0.0.1/page', { dirs })).toEqual({ ok: false, reason: 'blocked address' })
    expect(await unfurl('http://169.254.169.254/latest/meta-data/', { dirs })).toEqual({ ok: false, reason: 'blocked address' })
    expect(hits.size).toBe(0)
  })

  test('a redirect to a private address is refused at that hop', async () => {
    const result = await unfurl(`${base}/to-private`, options)
    expect(result).toEqual({ ok: false, reason: 'blocked address' })
  })
})

test.describe('fetching (local server, allowHosts)', () => {
  test('reads the head, saves the PNG from favicon.ico, sends the honest user agent', async () => {
    const result = await unfurl(`${base}/page#section`, options)
    expect(result).toMatchObject({ ok: true, cached: false, title: 'OG title', description: 'OG description', siteName: 'Test Site', themeColor: '#123456', source: 'html' })
    if (!result.ok) return
    expect(result.url).toBe(`${base}/page`)
    expect(result.favicon).toMatch(/^\/icons\/[0-9a-f]{16}\.png$/)
    expect(sniffImage(readFileSync(join(dirs.icons, result.favicon!.slice('/icons/'.length))))).toBe('png')
    // The image is the second switch: not asked for, not downloaded.
    expect(result.image).toBeUndefined()
    expect(hits.get('/real.png')).toBeUndefined()

    const headers = seenHeaders.get('/page')
    expect(headers?.['user-agent']).toBe(USER_AGENT)
    expect(USER_AGENT).toMatch(/^tilebox-unfurl\/\d+\.\d+\.\d+\S* \(\+https:\/\/github\.com\/ricardov03\/tilebox\)$/)
    expect(USER_AGENT).not.toMatch(/mozilla|chrome|safari|bot/i)
    expect(headers?.accept).toBe('text/html,application/xhtml+xml')
  })

  test('showImage: the og:image becomes a local webp, and a fake png is refused by its bytes', async () => {
    const result = await unfurl(`${base}/page`, { ...options, showImage: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.image).toMatch(/^\/thumbs\/[0-9a-f]{16}\.webp$/)
    expect(result.imageAlt).toBe('A red square')
    const file = readFileSync(join(dirs.thumbs, result.image!.slice('/thumbs/'.length)))
    expect(sniffImage(file)).toBe('webp')
    expect((await sharp(file).metadata()).width).toBe(300)

    const fake = await unfurl(`${base}/fake-image`, { ...options, showImage: true })
    expect(fake.ok).toBe(true)
    if (!fake.ok) return
    expect(hits.get('/fake.png')).toBe(1)
    expect(fake.image).toBeUndefined()
    expect(readdirSync(dirs.thumbs)).toHaveLength(1)
  })

  test('follows 5 redirects and stops at 6', async () => {
    const five = await unfurl(`${base}/hop/4`, options)
    expect(five).toMatchObject({ ok: true, title: 'OG title', finalUrl: `${base}/page` })
    const six = await unfurl(`${base}/hop/5`, options)
    expect(six).toEqual({ ok: false, reason: 'too many redirects' })
  })

  test('stops reading at 512 KB', async () => {
    const response = await safeRequest(`${base}/big`, { accept: 'text/html', maxBytes: 512 * 1024, overflow: 'cut', stopAtHeadEnd: true }, options)
    expect(response.body.byteLength).toBe(512 * 1024)
    const result = await unfurl(`${base}/big`, options)
    expect(result).toMatchObject({ ok: true, title: 'Big page' })
    if (result.ok) expect(result.description).toBeUndefined()
  })

  test('stops reading at </head>', async () => {
    const response = await safeRequest(`${base}/page`, { accept: 'text/html', maxBytes: 512 * 1024, overflow: 'cut', stopAtHeadEnd: true }, options)
    expect(response.body.toString('utf8')).toContain('</head>')
  })

  test('a body over the limit fails when it must not be cut', async () => {
    await expect(safeRequest(`${base}/big`, { accept: 'image/*', maxBytes: 1024, overflow: 'fail' }, options)).rejects.toMatchObject({ reason: 'file too large' })
  })

  test('a page that is not html gives a reason, an error status too', async () => {
    expect(await unfurl(`${base}/pdf`, options)).toEqual({ ok: false, reason: 'not html' })
    expect(await unfurl(`${base}/missing`, options)).toEqual({ ok: false, reason: 'http 404' })
    expect(await unfurl('not a url', options)).toMatchObject({ ok: false })
    // Failed reads are remembered (S2), but never as data.
    expect(readCacheSync(dirs)).toEqual({})
  })

  test('the cache is fresh for 30 days, then a 304 keeps the data, and force asks again', async () => {
    let now = Date.parse('2026-01-01T00:00:00Z')
    const timed: UnfurlOptions = { ...options, now: () => now }
    const url = `${base}/etag`

    const first = await unfurl(url, timed)
    expect(first).toMatchObject({ ok: true, cached: false, title: 'Etag page' })
    expect(hits.get('/etag')).toBe(1)
    expect(readCacheSync(dirs)[url]).toMatchObject({ etag: '"v1"', imageTried: false })

    now += FRESH_MS - 1000
    expect(await unfurl(url, timed)).toMatchObject({ ok: true, cached: true, title: 'Etag page' })
    expect(hits.get('/etag')).toBe(1)

    now += 2000
    const stale = await unfurl(url, timed)
    expect(stale).toMatchObject({ ok: true, cached: true, title: 'Etag page' })
    expect(hits.get('/etag')).toBe(2)
    expect(seenHeaders.get('/etag')?.['if-none-match']).toBe('"v1"')
    expect(readCacheSync(dirs)[url]?.data.fetchedAt).toBe(new Date(now).toISOString())

    // Fresh again after the 304.
    expect(await unfurl(url, timed)).toMatchObject({ cached: true })
    expect(hits.get('/etag')).toBe(2)

    await unfurl(url, { ...timed, force: true })
    expect(hits.get('/etag')).toBe(3)
  })
})

test.describe('S1: a remote SVG is never stored', () => {
  for (const name of Object.keys(SVG_PAYLOADS)) {
    test(`svg favicon "${name}": only PNG files land in the icons folder`, async () => {
      const result = await unfurl(`${base}/svg-page/${name}`, options)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(hits.get(`/svg-icon/${name}.svg`)).toBe(1)
      const files = existsSync(dirs.icons) ? readdirSync(dirs.icons) : []
      expect(files.filter(file => !file.endsWith('.png'))).toEqual([])
      for (const file of files) {
        const bytes = readFileSync(join(dirs.icons, file))
        expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE), file).toBe(true)
        expect(bytes.toString('latin1')).not.toMatch(/<svg|script/i)
      }
      if (result.favicon !== undefined) expect(result.favicon).toMatch(/^\/icons\/[0-9a-f]{16}\.png$/)
    })
  }

  test('a plain valid SVG becomes a PNG of 128 px at most, named after the OUTPUT bytes', async () => {
    const result = await unfurl(`${base}/svg-page/plain`, options)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The SVG was good, so no other icon source was asked.
    expect(hits.get('/favicon.ico')).toBeUndefined()
    expect(result.favicon).toMatch(/^\/icons\/[0-9a-f]{16}\.png$/)
    const name = result.favicon!.slice('/icons/'.length)
    const bytes = readFileSync(join(dirs.icons, name))
    expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
    expect(name).toBe(`${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}.png`)
    const meta = await sharp(bytes).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(128)
    expect(meta.height).toBe(128)
    expect(meta.hasAlpha).toBe(true)
  })

  test('icon bytes are never stored as they came: a PNG is decoded and written again', async () => {
    const result = await unfurl(`${base}/page`, options)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const bytes = readFileSync(join(dirs.icons, result.favicon!.slice('/icons/'.length)))
    expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
    expect(result.favicon).toBe(`/icons/${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}.png`)
  })

  test('an SVG over 100 KB is not decoded at all: the next source gives the icon', async () => {
    const result = await unfurl(`${base}/svg-page/over-100kb`, options)
    expect(result).toMatchObject({ ok: true })
    expect(hits.get('/favicon.ico')).toBe(1)
    expect(await rasterizeIcon(Buffer.from(SVG_PAYLOADS['over-100kb'] ?? ''), 'svg')).toBeNull()
    expect(await rasterizeIcon(Buffer.from(SVG_PAYLOADS.plain ?? ''), 'svg')).not.toBeNull()
  })

  test('an icon sharp cannot decode is "no icon": the next source is tried', async () => {
    const result = await unfurl(`${base}/broken-icon-page`, options)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(hits.get('/broken.png')).toBe(1)
    expect(hits.get('/favicon.ico')).toBe(1)
    expect(result.favicon).toMatch(/\.png$/)
    expect(readdirSync(dirs.icons)).toHaveLength(1)
  })
})

test.describe('S2: one budget for the whole unfurl', () => {
  test('a slow website ends after 20 s in total, and the failure is remembered: the second call is instant', async () => {
    test.setTimeout(40_000)
    const url = `${base}/slow-hop/5`
    const started = Date.now()
    const result = await unfurl(url, options)
    const took = Date.now() - started
    expect(result).toEqual({ ok: false, reason: 'timeout' })
    expect(took).toBeLessThanOrEqual(21_000)
    expect(took).toBeGreaterThanOrEqual(19_000)
    // Two hops of 7 s ended, the third was cut at 20 s. Without the total limit all six would run (42 s).
    expect([...hits.keys()].filter(path => path.startsWith('/slow-hop/')).length).toBe(3)

    const again = Date.now()
    expect(await unfurl(url, options)).toEqual({ ok: false, reason: 'timeout', cached: true })
    expect(Date.now() - again).toBeLessThan(200)
    expect([...hits.keys()].filter(path => path.startsWith('/slow-hop/')).length).toBe(3)
    expect(TOTAL_TIMEOUT_MS).toBe(20_000)
  })

  test('a failure is remembered for 10 minutes, `force` asks again, and a good read forgets it', async () => {
    let now = Date.parse('2026-01-01T00:00:00Z')
    const timed: UnfurlOptions = { ...options, now: () => now }
    const url = `${base}/pdf`
    expect(await unfurl(url, timed)).toEqual({ ok: false, reason: 'not html' })
    expect(readFailuresSync(dirs)[url]).toEqual({ reason: 'not html', at: new Date(now).toISOString() })
    expect(await unfurl(url, timed)).toEqual({ ok: false, reason: 'not html', cached: true })
    expect(hits.get('/pdf')).toBe(1)

    await unfurl(url, { ...timed, force: true })
    expect(hits.get('/pdf')).toBe(2)

    now += NEGATIVE_MS - 1000
    await unfurl(url, timed)
    expect(hits.get('/pdf')).toBe(2)
    now += 2000
    expect(await unfurl(url, timed)).toEqual({ ok: false, reason: 'not html' })
    expect(hits.get('/pdf')).toBe(3)

    // Refusals of the local guard cost nothing and are not remembered.
    await unfurl('http://127.0.0.1/x', { dirs, now: () => now })
    expect(Object.keys(readFailuresSync(dirs))).toEqual([url])
    // A good read forgets the failure of its key.
    await unfurl(`${base}/page`, timed)
    expect(Object.keys(readFailuresSync(dirs))).toEqual([url])
    expect(Object.keys(readCacheSync(dirs))).toEqual([`${base}/page`])
  })

  test('redirects are counted over ALL requests of one unfurl: 8 in total', async () => {
    // 5 redirects to the page, so 3 are left. The icon sits behind 4: that request stops, the next source gives the icon.
    const result = await unfurl(`${base}/phop/4`, options)
    expect(result).toMatchObject({ ok: true, title: 'Icon behind redirects' })
    const redirects = [...hits.entries()].filter(([path]) => /^\/(phop|ihop)\//.test(path)).reduce((sum, [, count]) => sum + count, 0)
    expect(redirects).toBe(5 + 4)
    expect(MAX_TOTAL_REDIRECTS).toBe(8)
    // /ihop/0 answered with the 9th redirect, which was not followed.
    expect(hits.get('/real.png')).toBeUndefined()
    expect(hits.get('/favicon.ico')).toBe(1)
    if (result.ok) expect(result.favicon).toMatch(/\.png$/)
  })

  test('one unfurl makes 8 requests at most', async () => {
    const result = await unfurl(`${base}/many-requests`, { ...options, showImage: true })
    expect(result).toMatchObject({ ok: true, title: 'Many requests' })
    const total = [...hits.values()].reduce((sum, count) => sum + count, 0)
    expect(total).toBeLessThanOrEqual(MAX_SUB_REQUESTS)
    // page, 3 icons, manifest, its icon, /favicon.ico, the first image (not a picture) = 8. The second image was the 9th.
    expect(total).toBe(8)
    expect(hits.get('/fake.png')).toBe(1)
    expect(hits.get('/real.png')).toBeUndefined()
    if (result.ok) expect(result.image).toBeUndefined()
  })

  test('a DNS lookup that never answers ends after 3 s', async () => {
    test.setTimeout(15_000)
    const started = Date.now()
    await expect(checkTarget(new URL('https://never.test/'), { lookup: () => new Promise(() => undefined) })).rejects.toMatchObject({ reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(4000)
  })

  test('the caller can stop the job: it ends at once with "cancelled" and nothing is cached', async () => {
    test.setTimeout(15_000)
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 300)
    const started = Date.now()
    const result = await unfurl(`${base}/slow-hop/2`, { ...options, signal: controller.signal })
    expect(result).toEqual({ ok: false, reason: 'cancelled' })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(readFailuresSync(dirs)).toEqual({})
    expect(readCacheSync(dirs)).toEqual({})
    // A job that starts after the stop makes no request at all.
    hits.clear()
    expect(await unfurl(`${base}/page`, { ...options, signal: controller.signal })).toEqual({ ok: false, reason: 'cancelled' })
    expect(hits.size).toBe(0)
  })
})

test.describe('oEmbed (mocked transport, no network)', () => {
  test('a YouTube link asks the oEmbed endpoint on the pinned address and never loads the page', async () => {
    const calls: { url: string, pinned: string | undefined, agent: string | undefined }[] = []
    const transport: Transport = (url, init) => {
      calls.push({ url: url.href, pinned: init.pinned?.address, agent: init.headers['user-agent'] })
      if (url.href.startsWith('https://www.youtube.com/oembed?')) {
        return Promise.resolve(Response.json({
          title: 'Never Gonna Give You Up',
          author_name: 'Rick Astley',
          provider_name: 'YouTube',
          thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        }))
      }
      return Promise.resolve(new Response('', { status: 404 }))
    }
    const result = await unfurl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      dirs,
      transport,
      lookup: () => Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
    })
    expect(result).toMatchObject({
      ok: true,
      source: 'oembed',
      title: 'Never Gonna Give You Up',
      description: 'By Rick Astley',
      siteName: 'YouTube',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toContain(encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
    expect(calls[0]?.pinned).toBe('93.184.216.34')
    expect(calls[0]?.agent).toBe(USER_AGENT)
  })

  test('a website that blocks the request still gives the brand icon answer', async () => {
    const transport: Transport = () => Promise.resolve(new Response('', { status: 403 }))
    const lookup = () => Promise.resolve([{ address: '93.184.216.34', family: 4 }])
    const brand = await unfurl('https://x.com/nuxt_js', { dirs, transport, lookup })
    expect(brand).toMatchObject({ ok: true, source: 'brand', siteName: 'x.com' })
    if (brand.ok) expect(brand.note).toContain('http 403')
    // Not cached as data. Only the failure is remembered, for 10 minutes (S2).
    expect(readCacheSync(dirs)).toEqual({})
    expect(readFailuresSync(dirs)['https://x.com/nuxt_js']?.reason).toBe('http 403')
    expect(await unfurl('https://unknown-site.test/', { dirs, transport, lookup })).toEqual({ ok: false, reason: 'http 403' })
  })
})
