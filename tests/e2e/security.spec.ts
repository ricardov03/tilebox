/**
 * The WP10 security round (NOTES.md `## WP10 security round`), the parts that
 * need no browser and no dev server. Runs in the `static` project, after
 * `npm run generate`. The engine's own cases are in unfurl.spec.ts.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { buildSiteAssets } from '../../content/site-assets'
import { SITE_FILES } from '../../content/site-files'
import { storeSiteUpload, SiteUploadError } from '../../content/site-upload'
import { parseProfile } from '../../types/profile'
import { SiteSchema } from '../../types/site'
import { ROOT } from './helpers'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
const SCRIPT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(document.domain)</script><x:script xmlns:x="http://www.w3.org/2000/svg">alert(2)</x:script><rect width="10" height="10" fill="#ff00ff"/></svg>'

const UNTRUSTED_DIRS = ['icons', 'thumbs', 'blocks', 'site', 'site-uploads']
const ASSET_CSP = 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox'

/** `_headers` -> { path -> { header -> value } }. The format of Cloudflare Pages and Netlify. */
function parseHeadersFile(text: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>()
  let current: Record<string, string> | null = null
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      current = {}
      rules.set(line.trim(), current)
      continue
    }
    const at = line.indexOf(':')
    if (current && at > 0) current[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
  }
  return rules
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)])
}

test.describe('S1b: response headers for the static host', () => {
  test('public/_headers is tracked and lands in dist/ unchanged', () => {
    const tracked = execFileSync('git', ['ls-files', 'public/_headers'], { cwd: ROOT, encoding: 'utf8' }).trim()
    expect(tracked).toBe('public/_headers')
    expect(existsSync(resolve(ROOT, 'dist/_headers'))).toBe(true)
    expect(readFileSync(resolve(ROOT, 'dist/_headers'), 'utf8')).toBe(readFileSync(resolve(ROOT, 'public/_headers'), 'utf8'))
  })

  test('every folder with fetched or uploaded files gets the sandbox CSP and nosniff, every path gets nosniff and a referrer policy', () => {
    const rules = parseHeadersFile(readFileSync(resolve(ROOT, 'dist/_headers'), 'utf8'))
    for (const dir of UNTRUSTED_DIRS) {
      expect(rules.get(`/${dir}/*`), dir).toEqual({ 'content-security-policy': ASSET_CSP, 'x-content-type-options': 'nosniff' })
    }
    expect(rules.get('/*')).toEqual({ 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' })
  })

  test('netlify.toml keeps the cache headers and sets no header that _headers sets', () => {
    const toml = readFileSync(resolve(ROOT, 'netlify.toml'), 'utf8').split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
    expect(toml).toContain('for = "/_nuxt/*"')
    expect(toml).toContain('for = "/_fonts/*"')
    expect(toml).not.toMatch(/X-Content-Type-Options|Referrer-Policy|Content-Security-Policy/i)
  })

  test('nuxt.config.ts sets the same CSP for the same folders in dev', () => {
    const config = readFileSync(resolve(ROOT, 'nuxt.config.ts'), 'utf8')
    expect(config).toContain(`[${UNTRUSTED_DIRS.map(dir => `'${dir}'`).join(', ')}]`)
    expect(config.replaceAll('\\\'', '\'')).toContain(ASSET_CSP)
  })
})

test.describe('S1: the built site has no fetched SVG', () => {
  test('dist/icons holds no .svg file, and dist/site only the icon.svg this repo draws itself', () => {
    expect(filesUnder(resolve(ROOT, 'dist/icons')).filter(file => file.endsWith('.svg'))).toEqual([])
    expect(filesUnder(resolve(ROOT, 'dist/site-uploads')).filter(file => file.endsWith('.svg'))).toEqual([])
    const siteSvgs = filesUnder(resolve(ROOT, 'dist/site')).filter(file => file.endsWith('.svg'))
    for (const file of siteSvgs) {
      expect(file.endsWith('/icon.svg')).toBe(true)
      // The initials tile: outlines and one <style>, nothing that can run.
      expect(readFileSync(file, 'utf8')).not.toMatch(/script|href|foreignObject|\son\w+=/i)
    }
  })
})

test.describe('S1c: an uploaded SVG is never written to disk', () => {
  let dir = ''
  let uploads = ''

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tilebox-upload-'))
    uploads = join(dir, 'public/site-uploads')
  })

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('an SVG with a script becomes a 512x512 PNG, and no .svg file exists', async () => {
    const { src } = await storeSiteUpload({ kind: 'favicon', filename: 'logo.svg', data: Buffer.from(SCRIPT_SVG), dir: uploads })
    expect(src).toMatch(/^\/site-uploads\/favicon-[0-9a-f]{6}\.png$/)
    expect(filesUnder(dir).filter(file => file.endsWith('.svg'))).toEqual([])
    const files = readdirSync(uploads)
    expect(files).toEqual([src.slice('/site-uploads/'.length)])
    const bytes = readFileSync(join(uploads, files[0] ?? ''))
    expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
    expect(bytes.toString('latin1')).not.toMatch(/<svg|script/i)
    const meta = await sharp(bytes).metadata()
    expect({ width: meta.width, height: meta.height, format: meta.format }).toEqual({ width: 512, height: 512, format: 'png' })
  })

  test('the favicon set made from that upload has no icon.svg, and an older icon.svg goes away', async () => {
    const publicDir = join(dir, 'public')
    const outDir = join(publicDir, 'site')
    const base = parseProfile(JSON.parse(readFileSync(resolve(ROOT, 'content/profile.example.json'), 'utf8')))
    const first = await buildSiteAssets({ profile: base, publicDir, outDir, gravatarFile: join(dir, 'none.jpg') })
    expect(first.faviconSource).toBe('initials')
    expect(existsSync(join(outDir, SITE_FILES.iconSvg))).toBe(true)

    const { src } = await storeSiteUpload({ kind: 'favicon', filename: 'logo.svg', data: Buffer.from(SCRIPT_SVG), dir: uploads })
    const result = await buildSiteAssets({ profile: { ...base, site: { ...base.site, favicon: src } }, publicDir, outDir, gravatarFile: join(dir, 'none.jpg') })
    expect(result.messages).toEqual([])
    expect(result.faviconSource).toBe('upload')
    expect(result.files).not.toContain(SITE_FILES.iconSvg)
    expect(filesUnder(publicDir).filter(file => file.endsWith('.svg'))).toEqual([])
  })

  test('a hand-placed .svg source is not a valid site.favicon, and the builder never copies one', async () => {
    expect(SiteSchema.safeParse({ favicon: '/site-uploads/a.svg' }).success).toBe(false)
    expect(SiteSchema.safeParse({ favicon: '/site-uploads/a.png' }).success).toBe(true)
    // Even when a profile object gets past the schema, the SVG text never reaches public/site/.
    const publicDir = join(dir, 'public')
    const outDir = join(publicDir, 'site')
    mkdirSync(uploads, { recursive: true })
    writeFileSync(join(uploads, 'hand.svg'), SCRIPT_SVG)
    const base = parseProfile(JSON.parse(readFileSync(resolve(ROOT, 'content/profile.example.json'), 'utf8')))
    const result = await buildSiteAssets({ profile: { ...base, site: { favicon: '/site-uploads/hand.svg' } }, publicDir, outDir, gravatarFile: join(dir, 'none.jpg') })
    expect(result.files).not.toContain(SITE_FILES.iconSvg)
    expect(existsSync(join(outDir, SITE_FILES.iconSvg))).toBe(false)
  })

  test('a raster upload must really be that raster: fake files and wrong kinds are refused with 415', async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#0c4a6e' } }).png().toBuffer()
    const ok = await storeSiteUpload({ kind: 'og', filename: 'Card.PNG', data: png, dir: uploads })
    expect(ok.src).toMatch(/^\/site-uploads\/og-[0-9a-f]{6}\.png$/)
    const refused = [
      { kind: 'og' as const, filename: 'card.svg', data: Buffer.from(SCRIPT_SVG) },
      { kind: 'favicon' as const, filename: 'icon.png', data: Buffer.from(SCRIPT_SVG) },
      { kind: 'favicon' as const, filename: 'icon.png', data: Buffer.from('<html><script>alert(1)</script></html>') },
      { kind: 'favicon' as const, filename: 'icon.html', data: png },
      { kind: 'favicon' as const, filename: 'icon.svg', data: png },
    ]
    for (const upload of refused) {
      const error = await storeSiteUpload({ ...upload, dir: uploads }).catch((caught: unknown) => caught)
      expect(error, upload.filename).toBeInstanceOf(SiteUploadError)
      expect((error as SiteUploadError).statusCode, upload.filename).toBe(415)
    }
    expect(readdirSync(uploads)).toHaveLength(1)
  })
})
