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
