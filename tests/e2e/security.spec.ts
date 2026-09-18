/**
 * The WP10 security round (NOTES.md `## WP10 security round`), the parts that
 * need no browser and no dev server. Runs in the `static` project, after
 * `npm run generate`. The engine's own cases are in unfurl.spec.ts.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { buildSiteAssets } from '../../content/site-assets'
import { SITE_FILES } from '../../content/site-files'
import { storeSiteUpload, SiteUploadError } from '../../content/site-upload'
import { FRESH_MS, MAX_CACHE_ENTRIES, pruneLinkFiles, readCacheSync, updateCache, withLocalLinkFiles, type UnfurlDirs } from '../../content/unfurl-cache'
import { parseProfile, ProfileSchema, type Profile } from '../../types/profile'
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

test.describe('S4: the cache file is checked like any other input', () => {
  let dir = ''
  let dirs: UnfurlDirs

  const entry = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    data: { url: 'https://a.example/', finalUrl: 'https://a.example/', source: 'html', fetchedAt: '2026-09-18T00:00:00.000Z', ...data },
    imageTried: true,
    ...extra,
  })

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tilebox-cache-'))
    dirs = { icons: join(dir, 'icons'), thumbs: join(dir, 'thumbs'), cache: join(dir, 'cache.json') }
    mkdirSync(dirs.icons)
    mkdirSync(dirs.thumbs)
    // Every file the poisoned entries name is really on disk, so only the checks can stop them.
    for (const file of ['evil.html', 'evil.svg', 'good.png']) writeFileSync(join(dirs.icons, file), 'x')
    for (const file of ['manifest.json', 'good.webp']) writeFileSync(join(dirs.thumbs, file), 'x')
  })

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('a poisoned cache never reaches the profile: bad paths and a bad imageAlt are dropped, the result passes ProfileSchema', () => {
    writeFileSync(dirs.cache, JSON.stringify({
      version: 1,
      entries: {
        'https://poison.example/': entry({ url: 'https://poison.example/', favicon: '/icons/evil.html', image: '/thumbs/manifest.json', imageAlt: {} }),
        'https://svg.example/': entry({ url: 'https://svg.example/', favicon: '/icons/evil.svg' }),
        'https://alt.example/': entry({ url: 'https://alt.example/', favicon: '/icons/good.png', image: '/thumbs/good.webp', imageAlt: {} }),
        'https://long-alt.example/': entry({ url: 'https://long-alt.example/', image: '/thumbs/good.webp', imageAlt: 'x'.repeat(201) }),
        'https://extra.example/': entry({ url: 'https://extra.example/', favicon: '/icons/good.png' }, { unknownKey: 1 }),
        'https://good.example/': entry({ url: 'https://good.example/', favicon: '/icons/good.png', image: '/thumbs/good.webp', imageAlt: 'A good picture' }),
      },
    }))
    // Invalid entries are dropped silently, the good one stays.
    expect(Object.keys(readCacheSync(dirs))).toEqual(['https://good.example/'])

    const example = parseProfile(JSON.parse(readFileSync(resolve(ROOT, 'content/profile.example.json'), 'utf8')))
    const hosts = ['poison', 'svg', 'alt', 'long-alt', 'extra', 'good']
    const blocks: Profile['blocks'] = hosts.map(host => ({ id: host, type: 'link', size: '2x1', url: `https://${host}.example/`, title: host, enrich: true, showImage: true }))
    const profile: Profile = { ...example, blocks, layout: { desktop: hosts } }
    const result = withLocalLinkFiles(profile, dirs)
    expect(ProfileSchema.safeParse(result).success).toBe(true)
    for (const block of result.blocks) {
      if (block.type !== 'link') continue
      if (block.id === 'good') {
        expect(block).toMatchObject({ favicon: '/icons/good.png', image: '/thumbs/good.webp', imageAlt: 'A good picture' })
        continue
      }
      expect(block.favicon, block.id).toBeUndefined()
      expect(block.image, block.id).toBeUndefined()
      expect(block.imageAlt, block.id).toBeUndefined()
    }
    expect(JSON.stringify(result)).not.toMatch(/evil|manifest\.json/)
  })

  test('a cache file that is not the expected shape is an empty cache', () => {
    for (const text of ['not json', '[]', '{"version":2,"entries":{}}', '{"version":1,"entries":[]}', '{"version":1,"entries":{"https://a.example/":"text"}}']) {
      writeFileSync(dirs.cache, text)
      expect(readCacheSync(dirs), text).toEqual({})
    }
  })
})

test.describe('S3: unused fetched files are removed', () => {
  let dir = ''
  let dirs: UnfurlDirs
  const NOW = Date.parse('2026-09-18T00:00:00.000Z')

  const cacheEntry = (url: string, fetchedAt: string, files: { favicon?: string, image?: string }) => ({
    data: { url, finalUrl: url, source: 'html', fetchedAt, ...files },
    imageTried: true,
  })

  function profileWith(blocks: Profile['blocks']): Profile {
    const example = parseProfile(JSON.parse(readFileSync(resolve(ROOT, 'content/profile.example.json'), 'utf8')))
    return { ...example, blocks, layout: { desktop: blocks.map(block => block.id) } }
  }

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tilebox-prune-'))
    dirs = { icons: join(dir, 'public/icons'), thumbs: join(dir, 'public/thumbs'), cache: join(dir, '.tilebox/cache.json') }
    mkdirSync(dirs.icons, { recursive: true })
    mkdirSync(dirs.thumbs, { recursive: true })
    mkdirSync(join(dir, '.tilebox'))
  })

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('only files that no block and no fresh cache entry uses are removed', async () => {
    for (const name of ['.gitkeep', 'used.png', 'hidden.png', 'fresh.png', 'stale.png', 'orphan.png', 'old.svg', 'note.html']) writeFileSync(join(dirs.icons, name), 'x')
    for (const name of ['.gitkeep', 'manifest.json', 'used.webp', 'fresh.webp', 'orphan.webp', 'video1video.jpg', 'gone2video.jpg']) writeFileSync(join(dirs.thumbs, name), 'x')
    writeFileSync(dirs.cache, JSON.stringify({
      version: 1,
      entries: {
        'https://fresh.example/': cacheEntry('https://fresh.example/', new Date(NOW - FRESH_MS + 60_000).toISOString(), { favicon: '/icons/fresh.png', image: '/thumbs/fresh.webp' }),
        'https://stale.example/': cacheEntry('https://stale.example/', new Date(NOW - FRESH_MS - 60_000).toISOString(), { favicon: '/icons/stale.png' }),
      },
    }))
    const profile = profileWith([
      { id: 'a', type: 'link', size: '2x1', url: 'https://a.example/', title: 'A', enrich: true, showImage: true, favicon: '/icons/used.png', image: '/thumbs/used.webp' },
      { id: 'h', type: 'link', size: '1x1', url: 'https://h.example/', title: 'H', hidden: true, enrich: true, favicon: '/icons/hidden.png' },
    ])

    const removed = await pruneLinkFiles(profile, { dirs, now: NOW, keepThumbs: ['video1video.jpg'] })
    expect(removed).toEqual(['/icons/note.html', '/icons/old.svg', '/icons/orphan.png', '/icons/stale.png', '/thumbs/gone2video.jpg', '/thumbs/orphan.webp'])
    expect(readdirSync(dirs.icons).sort()).toEqual(['.gitkeep', 'fresh.png', 'hidden.png', 'used.png'])
    expect(readdirSync(dirs.thumbs).sort()).toEqual(['.gitkeep', 'fresh.webp', 'manifest.json', 'used.webp', 'video1video.jpg'])
    // A second run has nothing to do.
    expect(await pruneLinkFiles(profile, { dirs, now: NOW, keepThumbs: ['video1video.jpg'] })).toEqual([])
  })

  test('symlinks and sub-folders are never followed or removed, and nothing outside the two folders is touched', async () => {
    const outside = join(dir, 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'secret.png'), 'keep me')
    writeFileSync(join(dir, 'public/keep.png'), 'keep me')
    symlinkSync(join(outside, 'secret.png'), join(dirs.icons, 'link.png'))
    symlinkSync(outside, join(dirs.icons, 'linkdir'))
    mkdirSync(join(dirs.icons, 'sub'))
    writeFileSync(join(dirs.icons, 'sub/inner.png'), 'x')
    writeFileSync(join(dirs.icons, 'orphan.png'), 'x')

    expect(await pruneLinkFiles(profileWith([]), { dirs, now: NOW })).toEqual(['/icons/orphan.png'])
    expect(readFileSync(join(outside, 'secret.png'), 'utf8')).toBe('keep me')
    expect(existsSync(join(dir, 'public/keep.png'))).toBe(true)
    expect(readdirSync(dirs.icons).sort()).toEqual(['link.png', 'linkdir', 'sub'])
    expect(existsSync(join(dirs.icons, 'sub/inner.png'))).toBe(true)
  })

  test('a folder that is itself a symlink is left alone, a missing folder is fine', async () => {
    const real = join(dir, 'elsewhere')
    mkdirSync(real)
    writeFileSync(join(real, 'orphan.png'), 'x')
    const linked: UnfurlDirs = { icons: join(dir, 'icons-link'), thumbs: join(dir, 'no-such-folder'), cache: dirs.cache }
    symlinkSync(real, linked.icons)
    expect(await pruneLinkFiles(profileWith([]), { dirs: linked, now: NOW })).toEqual([])
    expect(existsSync(join(real, 'orphan.png'))).toBe(true)
  })
})

test.describe('S3: the cache file has a size limit', () => {
  test('500 entries at most: the oldest `fetchedAt` goes first', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tilebox-cap-'))
    try {
      const dirs: UnfurlDirs = { icons: join(dir, 'icons'), thumbs: join(dir, 'thumbs'), cache: join(dir, 'cache.json') }
      const start = Date.parse('2026-01-01T00:00:00.000Z')
      const entryAt = (index: number) => {
        const url = `https://site-${index}.example/`
        return [url, { data: { url, finalUrl: url, source: 'html' as const, fetchedAt: new Date(start + index * 60_000).toISOString() }, imageTried: false }] as const
      }
      expect(MAX_CACHE_ENTRIES).toBe(500)
      // 520 entries on file, in a mixed order. The next write brings the file back under the limit.
      const entries = Object.fromEntries(Array.from({ length: 520 }, (_, index) => entryAt((index * 7) % 520)))
      writeFileSync(dirs.cache, JSON.stringify({ version: 1, entries }))
      const [newestUrl, newest] = entryAt(1000)
      await updateCache(newestUrl, newest, dirs)

      const kept = readCacheSync(dirs)
      expect(Object.keys(kept)).toHaveLength(500)
      expect(kept[newestUrl]).toBeDefined()
      // 521 entries, 500 stay: site-0 to site-20 (the 21 oldest) are gone, site-21 is the oldest left.
      expect(kept['https://site-20.example/']).toBeUndefined()
      expect(kept['https://site-21.example/']).toBeDefined()
      expect(kept['https://site-519.example/']).toBeDefined()
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
