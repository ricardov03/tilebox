/**
 * The WP10 security round, the parts that need `nuxt dev` (the `dev` project).
 * No browser: Playwright's APIRequestContext talks to the dev server.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { ROOT } from './helpers'

const ASSET_CSP = 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox'

test.describe('S1b: the dev server sends the asset headers too', () => {
  for (const path of ['/icons/x.png', '/thumbs/x.webp', '/blocks/sample.jpg', '/site/og.png', '/site-uploads/x.png']) {
    test(`${path} has the sandbox CSP and nosniff`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.headers()['content-security-policy']).toBe(ASSET_CSP)
      expect(response.headers()['x-content-type-options']).toBe('nosniff')
    })
  }

  test('a missing file keeps the sandbox CSP whatever the client accepts (the dev error handler must not write its own)', async ({ request }) => {
    for (const accept of ['*/*', 'application/json', 'text/html', 'image/png']) {
      const response = await request.get('/icons/missing.png', { headers: { accept } })
      expect(response.status(), accept).toBe(404)
      expect(response.headers()['content-security-policy'], accept).toBe(ASSET_CSP)
      expect(response.headers()['x-content-type-options'], accept).toBe('nosniff')
    }
    const traversal = await request.get('/icons/..%2F..%2Fpackage.json')
    expect(traversal.status()).toBe(404)
    expect(await traversal.text()).not.toContain('"name"')
  })

  test('the page and the editor have no sandbox CSP', async ({ request }) => {
    for (const path of ['/', '/edit']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
      expect(response.headers()['content-security-policy'] ?? '', path).not.toContain('sandbox')
    }
  })
})

test.describe('S1c: the upload route never stores an SVG', () => {
  const SCRIPT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(document.domain)</script><rect width="10" height="10" fill="#ff00ff"/></svg>'
  const svgFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter(file => file.endsWith('.svg') && file !== 'icon.svg') : [])

  test('an SVG with a script comes back as a .png path, and no .svg lands in public/site-uploads or public/site', async ({ request }) => {
    const before = new Set(svgFiles(resolve(ROOT, 'public/site-uploads')))
    const upload = await request.post('/api/site/upload?kind=favicon', {
      multipart: { file: { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SCRIPT_SVG) } },
    })
    expect(upload.status()).toBe(200)
    const { src } = await upload.json() as { src: string }
    expect(src).toMatch(/^\/site-uploads\/favicon-[0-9a-f]{6}\.png$/)
    const file = resolve(ROOT, `public${src}`)
    try {
      const bytes = readFileSync(file)
      expect(bytes.subarray(0, 8).toString('latin1')).toBe('\x89PNG\r\n\x1A\n')
      expect(bytes.toString('latin1')).not.toMatch(/<svg|script/i)
      expect(svgFiles(resolve(ROOT, 'public/site-uploads')).filter(name => !before.has(name))).toEqual([])
      expect(svgFiles(resolve(ROOT, 'public/site'))).toEqual([])
      // Served with the sandbox CSP, like every file of that folder.
      const served = await request.get(src)
      expect(served.headers()['content-type']).toContain('image/png')
      expect(served.headers()['content-security-policy']).toContain('sandbox')
    }
    finally {
      rmSync(file, { force: true })
    }
  })

  test('a text file named .png is refused', async ({ request }) => {
    const fake = await request.post('/api/site/upload?kind=favicon', {
      multipart: { file: { name: 'icon.png', mimeType: 'image/png', buffer: Buffer.from(SCRIPT_SVG) } },
    })
    expect(fake.status()).toBe(415)
  })
})

test.describe('S6: the dev write routes take only what the editor sends', () => {
  const JSON_ROUTES = ['/api/unfurl', '/api/save', '/api/avatar/gravatar', '/api/site/assets', '/api/links/check']
  const MULTIPART_ROUTES = ['/api/upload', '/api/site/upload?kind=favicon']
  const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

  for (const route of JSON_ROUTES) {
    test(`${route}: a form-encoded or text/plain body is refused with 415`, async ({ request }) => {
      // What an HTML form on another website can send without a CORS preflight.
      // The URL is a loopback address on purpose: if this gate ever breaks, the engine still refuses it and no test reaches the network.
      const form = await request.post(route, { form: { url: 'http://127.0.0.1/' } })
      expect(form.status()).toBe(415)
      const plain = await request.post(route, { headers: { 'content-type': 'text/plain' }, data: '{"url":"http://127.0.0.1/"}' })
      expect(plain.status()).toBe(415)
      const none = await request.post(route, { headers: { 'content-type': '' }, data: Buffer.from('{"url":"http://127.0.0.1/"}') })
      expect(none.status()).toBe(415)
    })
  }

  for (const route of MULTIPART_ROUTES) {
    test(`${route}: a body that is not multipart/form-data is refused with 415`, async ({ request }) => {
      expect((await request.post(route, { data: { file: 'x' } })).status()).toBe(415)
      expect((await request.post(route, { form: { file: 'x' } })).status()).toBe(415)
    })
  }

  for (const route of [...JSON_ROUTES, ...MULTIPART_ROUTES]) {
    test(`${route}: cross-site, same-site, a foreign Origin and a foreign Host are refused with 403`, async ({ request }) => {
      const multipart = MULTIPART_ROUTES.includes(route)
      const send = (headers: Record<string, string>) => multipart
        ? request.post(route, { headers, multipart: { file: { name: 'a.png', mimeType: 'image/png', buffer: TINY_PNG } } })
        : request.post(route, { headers, data: { url: 'http://127.0.0.1/' } })
      expect((await send({ 'sec-fetch-site': 'cross-site' })).status(), 'cross-site').toBe(403)
      expect((await send({ 'sec-fetch-site': 'same-site' })).status(), 'same-site').toBe(403)
      expect((await send({ origin: 'https://evil.example' })).status(), 'origin').toBe(403)
      expect((await send({ host: 'evil.example' })).status(), 'host').toBe(403)
    })
  }

  test('what the editor sends still works: JSON with same-origin, multipart with same-origin', async ({ request, baseURL }) => {
    const sameOrigin = { 'origin': baseURL ?? '', 'sec-fetch-site': 'same-origin' }
    // The engine refuses a loopback target without any request: a real answer, and no network.
    const unfurl = await request.post('/api/unfurl', { headers: sameOrigin, data: { url: 'http://127.0.0.1/' } })
    expect(unfurl.status()).toBe(200)
    expect(await unfurl.json()).toEqual({ ok: false, reason: 'blocked address' })
    const charset = await request.post('/api/unfurl', { headers: { 'content-type': 'application/json; charset=utf-8' }, data: JSON.stringify({ url: 'http://127.0.0.1/' }) })
    expect(charset.status()).toBe(200)
    // Past the guard, the routes answer as before: 400 for a body that is not a profile or has no file.
    expect((await request.post('/api/save', { headers: sameOrigin, data: { nope: true } })).status()).toBe(400)
    expect((await request.post('/api/site/assets', { headers: sameOrigin, data: { nope: true } })).status()).toBe(400)
    expect((await request.post('/api/avatar/gravatar', { headers: sameOrigin, data: { email: 'not an email' } })).status()).toBe(400)
    expect((await request.post('/api/upload', { headers: sameOrigin, multipart: { other: 'x' } })).status()).toBe(400)
    expect((await request.post('/api/site/upload?kind=favicon', { headers: sameOrigin, multipart: { other: 'x' } })).status()).toBe(400)
  })

  test('the read routes refuse a foreign Host too (DNS rebinding), and answer the editor', async ({ request }) => {
    // The icon search is local (WP18): an empty `q` answers with the default list.
    for (const route of ['/api/profile', '/api/avatar/gravatar', '/api/icons/search?q=']) {
      expect((await request.get(route, { headers: { host: 'evil.example' } })).status(), route).toBe(403)
      expect((await request.get(route, { headers: { 'sec-fetch-site': 'cross-site' } })).status(), route).toBe(403)
      expect((await request.get(route)).status(), route).toBe(200)
    }
  })
})
