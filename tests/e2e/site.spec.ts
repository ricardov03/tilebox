/**
 * Site metadata (WP10b). Three parts:
 * 1. The built page: the head of `dist/index.html` and the files of `dist/site/`.
 *    Run `npm run generate` first. Expectations come from the profile the build read.
 * 2. `buildHead()` (app/utils/site-head.ts), unit-checked. No browser.
 * 3. `buildSiteAssets()` (content/site-assets.ts) in a temp folder. No browser, no network.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { buildSiteAssets, icoFromPng } from '../../content/site-assets'
import { SITE_FILES, siteAssetsIfPresent } from '../../content/site-files'
import { buildHead, sameAsOf, siteDescription, siteTitle } from '../../app/utils/site-head'
import { ProfileSchema, toPublicProfile, type Profile, type PublicProfile } from '../../types/profile'
import { SiteSchema } from '../../types/site'
import { readProfile, ROOT } from './helpers'

const ALL_FILES = Object.values(SITE_FILES).sort()

test.describe('the built page', () => {
  const profile = readProfile()
  const envUrl = process.env.NUXT_PUBLIC_SITE_URL ?? ''

  test('title, description, Open Graph and X card', async ({ page }) => {
    await page.goto('/')
    const meta = (selector: string) => page.locator(`head meta[${selector}]`)
    await expect(page).toHaveTitle(siteTitle(profile.profile, profile.site))
    await expect(page.locator('html')).toHaveAttribute('lang', profile.site?.lang ?? 'en')
    await expect(meta('name="description"')).toHaveAttribute('content', siteDescription(profile.profile, profile.site))
    await expect(meta('property="og:type"')).toHaveAttribute('content', 'profile')
    await expect(meta('property="og:title"')).toHaveAttribute('content', siteTitle(profile.profile, profile.site))
    await expect(meta('property="og:image"')).toHaveAttribute('content', /\/site\/og\.png$/)
    await expect(meta('property="og:image:width"')).toHaveAttribute('content', '1200')
    await expect(meta('property="og:image:height"')).toHaveAttribute('content', '630')
    await expect(meta('property="og:image:alt"')).toHaveAttribute('content', /.+/)
    await expect(meta('property="profile:username"')).toHaveCount(1)
    await expect(meta('name="twitter:card"')).toHaveAttribute('content', 'summary_large_image')
  })

  test('useTheme still owns the theme-color metas: the prerendered HTML has them once', async ({ request }) => {
    // The raw HTML, not the DOM: after hydration unhead adds a second identical pair (older than WP10b, see NOTES.md).
    const html = await (await request.get('/')).text()
    const count = (needle: string) => html.split(needle).length - 1
    expect(count('name="theme-color"')).toBeGreaterThan(0)
    expect(count('name="theme-color"')).toBeLessThanOrEqual(2)
    expect(count('name="color-scheme"')).toBe(1)
    expect(count('rel="manifest"')).toBe(1)
    expect(count('application/ld+json')).toBe(1)
  })

  test('no canonical and no og:url without a site URL', async ({ page }) => {
    test.skip(Boolean(profile.site?.url) || envUrl !== '', 'this build knows its site URL')
    await page.goto('/')
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0)
    await expect(page.locator('head meta[property="og:url"]')).toHaveCount(0)
    await expect(page.locator('head meta[property="og:image"]')).toHaveAttribute('content', '/site/og.png')
  })

  test('robots meta only with noindex', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('head meta[name="robots"]')).toHaveCount(profile.site?.noindex ? 1 : 0)
  })

  test('JSON-LD parses: a ProfilePage with the Person and the social URLs', async ({ page }) => {
    await page.goto('/')
    const scripts = page.locator('script[type="application/ld+json"]')
    await expect(scripts).toHaveCount(1)
    const data = JSON.parse((await scripts.textContent()) ?? '') as {
      '@type': string
      'dateModified': string
      'mainEntity': { '@type': string, 'name': string, 'alternateName': string, 'sameAs'?: string[] }
    }
    expect(data['@type']).toBe('ProfilePage')
    expect(Number.isNaN(Date.parse(data.dateModified))).toBe(false)
    expect(data.mainEntity['@type']).toBe('Person')
    expect(data.mainEntity.name).toBe(profile.profile.name)
    const social = sameAsOf(toPublicProfile(profile))
    expect(social.length).toBeGreaterThan(0)
    expect(data.mainEntity.sameAs).toEqual(social)
  })

  test('four favicon links and a manifest, every file is served', async ({ page, request }) => {
    await page.goto('/')
    const hrefs = await page.locator('head link[rel="icon"], head link[rel="apple-touch-icon"]').evaluateAll(
      links => links.map(link => link.getAttribute('href') ?? ''),
    )
    // ico + png 192 + apple-touch-icon always, plus icon.svg when the source is the initials or an SVG upload.
    const expected = existsSync(resolve(ROOT, 'dist/site/icon.svg')) ? 4 : 3
    expect(hrefs).toHaveLength(expected)
    expect(hrefs).toContain('/site/favicon.ico')
    expect(hrefs).toContain('/site/apple-touch-icon.png')
    for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200)

    const manifestHref = await page.locator('head link[rel="manifest"]').getAttribute('href')
    expect(manifestHref).toBe('/site/manifest.webmanifest')
    const manifest = await (await request.get(manifestHref ?? '')).json() as { name: string, display: string, icons: { src: string, purpose: string }[] }
    expect(manifest.name).toBe(siteTitle(profile.profile, profile.site))
    expect(manifest.display).toBe('browser')
    expect(manifest.icons.map(icon => icon.purpose).sort()).toEqual(['any', 'any', 'maskable'])
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200)
  })

  test('dist/site has the favicon set and a 1200x630 social image under 1 MB', async () => {
    const dir = realpathSync(resolve(ROOT, 'dist/site'))
    const files = readdirSync(dir)
    for (const name of ALL_FILES.filter(name => name !== SITE_FILES.iconSvg)) expect(files, name).toContain(name)
    const og = readFileSync(join(dir, SITE_FILES.ogImage))
    const { width, height, format } = await sharp(og).metadata()
    expect({ width, height, format }).toEqual({ width: 1200, height: 630, format: 'png' })
    expect(og.byteLength).toBeLessThan(1024 * 1024)
  })

  test('social tiles say rel="me" and stay noopener noreferrer', async ({ page }) => {
    await page.goto('/')
    const social = sameAsOf(toPublicProfile(profile))
    for (const url of social) {
      const rel = (await page.locator(`a[href="${url}"]`).first().getAttribute('rel')) ?? ''
      expect(rel.split(' ').sort()).toEqual(['me', 'noopener', 'noreferrer'])
    }
  })
})

const BASE: Profile = ProfileSchema.parse({
  profile: {
    name: 'Ada King Lovelace',
    handle: '@ada',
    bio: 'Writes </script><script>alert(1)</script> notes.',
    email: 'private@tilebox.test',
    theme: { colors: 'condomera', fonts: 'geist', mode: 'system' },
  },
  blocks: [
    { id: 'b1', type: 'social', size: '1x1', network: 'github', url: 'https://github.com/ada' },
    { id: 'b2', type: 'social', size: '1x1', network: 'email', url: 'mailto:ada@tilebox.test' },
    { id: 'b3', type: 'link', size: '1x1', title: 'Blog', url: 'https://ada.example/blog' },
    { id: 'b4', type: 'social', size: '1x1', network: 'mastodon', url: 'https://mastodon.social/@ada' },
  ],
  layout: { desktop: ['b1', 'b2', 'b3', 'b4'] },
})

const publicOf = (site?: Profile['site'], avatar?: string): PublicProfile =>
  toPublicProfile({ ...BASE, site }, avatar, { assets: { ogImage: '/site/og.png', faviconIco: '/site/favicon.ico' }, builtAt: '2026-09-18T00:00:00.000Z' })

const metaOf = (head: ReturnType<typeof buildHead>, key: string) =>
  head.meta.filter(m => m.name === key || m.property === key).map(m => m.content)

test.describe('buildHead', () => {
  test('defaults: title from name and handle, description from the bio, no canonical, relative image', () => {
    const head = buildHead(publicOf())
    expect(head.title).toBe('Ada King Lovelace (@ada)')
    expect(head.htmlAttrs.lang).toBe('en')
    expect(metaOf(head, 'description')).toEqual([BASE.profile.bio])
    expect(metaOf(head, 'og:image')).toEqual(['/site/og.png'])
    expect(metaOf(head, 'og:url')).toEqual([])
    expect(metaOf(head, 'robots')).toEqual([])
    expect(metaOf(head, 'twitter:site')).toEqual([])
    expect(head.link.some(link => link.rel === 'canonical')).toBe(false)
  })

  test('a site URL gives a canonical link and absolute URLs', () => {
    const head = buildHead(publicOf({ url: 'https://ada.example' }, '/avatar.jpg'))
    expect(head.link.find(link => link.rel === 'canonical')?.href).toBe('https://ada.example/')
    expect(metaOf(head, 'og:url')).toEqual(['https://ada.example/'])
    expect(metaOf(head, 'og:image')).toEqual(['https://ada.example/site/og.png'])
    const ld = JSON.parse(head.script[0]?.innerHTML ?? '') as { mainEntity: { image: string, url: string } }
    expect(ld.mainEntity.image).toBe('https://ada.example/avatar.jpg')
    expect(ld.mainEntity.url).toBe('https://ada.example/')
  })

  test('NUXT_PUBLIC_SITE_URL wins over site.url, and a trailing slash is dropped', () => {
    const head = buildHead(publicOf({ url: 'https://ada.example' }), 'https://ada.pages.dev/')
    expect(head.link.find(link => link.rel === 'canonical')?.href).toBe('https://ada.pages.dev/')
    expect(metaOf(head, 'og:image')).toEqual(['https://ada.pages.dev/site/og.png'])
  })

  test('noindex, xHandle, title, description and lang', () => {
    const head = buildHead(publicOf({ noindex: true, xHandle: 'ada', title: 'Ada', description: 'Short.', lang: 'pt-BR' }))
    expect(metaOf(head, 'robots')).toEqual(['noindex, nofollow'])
    expect(metaOf(head, 'twitter:site')).toEqual(['@ada'])
    expect(metaOf(head, 'twitter:creator')).toEqual(['@ada'])
    expect(head.title).toBe('Ada')
    expect(metaOf(head, 'og:title')).toEqual(['Ada'])
    expect(metaOf(head, 'description')).toEqual(['Short.'])
    expect(head.htmlAttrs.lang).toBe('pt-BR')
    expect(metaOf(head, 'og:locale')).toEqual(['pt_BR'])
  })

  test('the name is split only when it has 2 or more words', () => {
    const head = buildHead(publicOf())
    expect(metaOf(head, 'profile:username')).toEqual(['ada'])
    expect(metaOf(head, 'profile:first_name')).toEqual(['Ada'])
    expect(metaOf(head, 'profile:last_name')).toEqual(['King Lovelace'])
    const single = publicOf()
    single.profile.name = 'Ada'
    expect(metaOf(buildHead(single), 'profile:first_name')).toEqual([])
  })

  test('JSON-LD: no raw "<", the Person, job, location, sameAs = http social URLs only', () => {
    const head = buildHead(publicOf({ jobTitle: 'Engineer', location: 'London' }))
    const raw = head.script[0]?.innerHTML ?? ''
    expect(raw).not.toContain('<')
    expect(raw).toContain('\\u003c/script>')
    const ld = JSON.parse(raw) as { dateModified: string, mainEntity: Record<string, unknown> }
    expect(ld.dateModified).toBe('2026-09-18T00:00:00.000Z')
    expect(ld.mainEntity.description).toBe(BASE.profile.bio)
    expect(ld.mainEntity.alternateName).toBe('ada')
    expect(ld.mainEntity.jobTitle).toBe('Engineer')
    expect(ld.mainEntity.address).toEqual({ '@type': 'PostalAddress', 'addressLocality': 'London' })
    expect(ld.mainEntity.sameAs).toEqual(['https://github.com/ada', 'https://mastodon.social/@ada'])
    expect('image' in ld.mainEntity).toBe(false)
  })

  test('JSON-LD sameAs leaves out a hidden social block: the head reads the sanitized profile', () => {
    const hiddenUrl = 'https://mastodon.social/@ada'
    const input: Profile = { ...BASE, blocks: BASE.blocks.map(block => (block.id === 'b4' ? { ...block, hidden: true } : block)) }
    const publicProfile = toPublicProfile(input, undefined, { builtAt: '2026-09-18T00:00:00.000Z' })
    expect(publicProfile.blocks.map(block => block.id)).toEqual(['b1', 'b2', 'b3'])
    expect(sameAsOf(publicProfile)).toEqual(['https://github.com/ada'])
    const head = buildHead(publicProfile)
    const ld = JSON.parse(head.script[0]?.innerHTML ?? '') as { mainEntity: { sameAs?: string[] } }
    expect(ld.mainEntity.sameAs).toEqual(['https://github.com/ada'])
    expect(JSON.stringify(head)).not.toContain(hiddenUrl)
  })

  test('favicon links fall back to the tracked /favicon.ico and /og.png', () => {
    const head = buildHead(toPublicProfile(BASE))
    expect(head.link).toEqual([{ rel: 'icon', href: '/favicon.ico', sizes: '32x32' }])
    expect(metaOf(head, 'og:image')).toEqual(['/og.png'])
  })

  test('the upload paths never reach the public profile', () => {
    const result = publicOf({ favicon: '/site-uploads/favicon-1.png', ogImage: '/site-uploads/og-1.png', title: 'Ada' })
    expect(result.site).toEqual({ title: 'Ada', assets: { ogImage: '/site/og.png', faviconIco: '/site/favicon.ico' }, builtAt: '2026-09-18T00:00:00.000Z' })
  })
})

test.describe('SiteSchema', () => {
  test('a profile without `site` stays valid, unknown keys are refused', () => {
    expect(ProfileSchema.safeParse(JSON.parse(JSON.stringify(BASE))).success).toBe(true)
    expect(SiteSchema.safeParse({}).success).toBe(true)
    expect(SiteSchema.safeParse({ nope: 1 }).success).toBe(false)
  })

  test('url: https only, no trailing slash', () => {
    for (const url of ['https://example.com', 'https://example.com/me']) expect(SiteSchema.safeParse({ url }).success, url).toBe(true)
    for (const url of ['http://example.com', 'https://example.com/', 'example.com', 'https://example.com/?a=1', 'https://']) {
      expect(SiteSchema.safeParse({ url }).success, url).toBe(false)
    }
  })

  test('limits and formats', () => {
    expect(SiteSchema.safeParse({ title: 'x'.repeat(71) }).success).toBe(false)
    expect(SiteSchema.safeParse({ description: 'x'.repeat(161) }).success).toBe(false)
    expect(SiteSchema.safeParse({ xHandle: '@ada' }).success).toBe(false)
    expect(SiteSchema.safeParse({ lang: 'english!' }).success).toBe(false)
    expect(SiteSchema.safeParse({ lang: 'es-CO', xHandle: 'ada_1' }).success).toBe(true)
    expect(SiteSchema.safeParse({ favicon: '/site-uploads/a.svg', ogImage: '/site-uploads/b.webp' }).success).toBe(true)
    expect(SiteSchema.safeParse({ favicon: '/site-uploads/../../a.png' }).success).toBe(false)
    expect(SiteSchema.safeParse({ ogImage: 'https://example.com/a.png' }).success).toBe(false)
  })
})

test.describe('buildSiteAssets', () => {
  let dir = ''
  let publicDir = ''
  let outDir = ''

  const build = (profile: Profile) =>
    buildSiteAssets({ profile, publicDir, outDir, gravatarFile: join(dir, 'no-gravatar.jpg') })

  const photo = (width: number, height: number, color: string) =>
    sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer()

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tilebox-site-'))
    publicDir = join(dir, 'public')
    outDir = join(publicDir, 'site')
    mkdirSync(join(publicDir, 'site-uploads'), { recursive: true })
  })

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('initials: all 8 files, a valid ICO with a 32x32 PNG, an SVG with a dark mode', async () => {
    const result = await build(BASE)
    expect(result.messages).toEqual([])
    expect(result.faviconSource).toBe('initials')
    expect(result.ogSource).toBe('generated')
    expect(result.files).toEqual(ALL_FILES)
    expect(readdirSync(outDir).sort()).toEqual(ALL_FILES)

    const ico = readFileSync(join(outDir, SITE_FILES.faviconIco))
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 1])
    expect([ico.readUInt8(6), ico.readUInt8(7)]).toEqual([32, 32])
    expect(ico.readUInt16LE(12)).toBe(32)
    expect(ico.readUInt32LE(18)).toBe(22)
    expect(ico.readUInt32LE(14)).toBe(ico.byteLength - 22)
    const embedded = await sharp(ico.subarray(22)).metadata()
    expect({ width: embedded.width, height: embedded.height, format: embedded.format }).toEqual({ width: 32, height: 32, format: 'png' })

    const sizes: [string, number][] = [[SITE_FILES.appleTouchIcon, 180], [SITE_FILES.icon192, 192], [SITE_FILES.icon512, 512], [SITE_FILES.iconMask, 512]]
    for (const [name, size] of sizes) {
      const meta = await sharp(join(outDir, name)).metadata()
      expect({ name, width: meta.width, height: meta.height }).toEqual({ name, width: size, height: size })
    }
    // The Apple and the maskable icon are opaque: no alpha channel at all.
    for (const name of [SITE_FILES.appleTouchIcon, SITE_FILES.iconMask]) {
      expect((await sharp(join(outDir, name)).metadata()).hasAlpha, name).toBe(false)
    }
    expect((await sharp(join(outDir, SITE_FILES.icon512)).metadata()).hasAlpha).toBe(true)

    const svg = readFileSync(join(outDir, SITE_FILES.iconSvg), 'utf8')
    expect(svg).toContain('prefers-color-scheme:dark')
    expect(svg).toContain('#0C4A6E') // condomera accent, light
    expect(svg).toContain('#38BDF8') // condomera accent, dark
    expect(svg).not.toContain('<text') // outlines, so no font is needed

    const manifest = JSON.parse(readFileSync(join(outDir, SITE_FILES.manifest), 'utf8')) as Record<string, unknown>
    expect(manifest).toMatchObject({ name: 'Ada King Lovelace (@ada)', short_name: 'Ada', display: 'browser', theme_color: '#EEF4F8', background_color: '#EEF4F8' })

    expect(Object.keys(siteAssetsIfPresent(outDir)).sort()).toEqual(['appleTouchIcon', 'faviconIco', 'icon192', 'iconSvg', 'manifest', 'ogImage'])
  })

  test('the generated social image is 1200x630 and under 1 MB, with a long bio too', async () => {
    const long = { ...BASE, profile: { ...BASE.profile, bio: 'A very long bio that keeps going. '.repeat(20) } }
    await build(long)
    const og = readFileSync(join(outDir, SITE_FILES.ogImage))
    const meta = await sharp(og).metadata()
    expect({ width: meta.width, height: meta.height, format: meta.format }).toEqual({ width: 1200, height: 630, format: 'png' })
    expect(og.byteLength).toBeLessThan(1024 * 1024)
  })

  test('an avatar becomes a round favicon, and icon.svg of an older build is removed', async () => {
    await build(BASE)
    expect(existsSync(join(outDir, SITE_FILES.iconSvg))).toBe(true)
    writeFileSync(join(publicDir, 'avatar.jpg'), await photo(300, 200, '#cc0000'))
    const result = await build({ ...BASE, profile: { ...BASE.profile, avatar: '/avatar.jpg' } })
    expect(result.faviconSource).toBe('avatar')
    expect(existsSync(join(outDir, SITE_FILES.iconSvg))).toBe(false)
    const { data, info } = await sharp(join(outDir, SITE_FILES.icon512)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]
    expect(alphaAt(0, 0)).toBe(0) // the corner is cut away
    expect(alphaAt(256, 256)).toBe(255)
  })

  test('uploads win: the favicon and the social image come from site-uploads', async () => {
    writeFileSync(join(publicDir, 'site-uploads/og.jpg'), await photo(2000, 900, '#00aa55'))
    writeFileSync(join(publicDir, 'site-uploads/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff00ff"/></svg>')
    const result = await build({ ...BASE, site: { ogImage: '/site-uploads/og.jpg', favicon: '/site-uploads/icon.svg' } })
    expect(result.messages).toEqual([])
    expect(result.faviconSource).toBe('upload')
    expect(result.ogSource).toBe('upload')
    const og = sharp(join(outDir, SITE_FILES.ogImage))
    const meta = await og.metadata()
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 1200, height: 630 })
    const { dominant } = await og.stats()
    expect(dominant.g).toBeGreaterThan(dominant.r) // the green upload, not the generated card
    expect(readFileSync(join(outDir, SITE_FILES.iconSvg), 'utf8')).toContain('#ff00ff')
  })

  test('broken uploads fall back without throwing', async () => {
    writeFileSync(join(publicDir, 'site-uploads/broken.png'), 'this is not a picture')
    const result = await build({ ...BASE, site: { ogImage: '/site-uploads/broken.png', favicon: '/site-uploads/missing.png' } })
    expect(result.faviconSource).toBe('initials')
    expect(result.ogSource).toBe('generated')
    expect(result.messages).toHaveLength(2)
    expect(result.files).toEqual(ALL_FILES)
    const meta = await sharp(join(outDir, SITE_FILES.ogImage)).metadata()
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 1200, height: 630 })
  })

  test('a remote avatar and a missing fonts folder never throw', async () => {
    const remote = await build({ ...BASE, profile: { ...BASE.profile, avatar: 'https://example.com/me.jpg' } })
    expect(remote.faviconSource).toBe('initials')
    const noFonts = await buildSiteAssets({ profile: BASE, publicDir, outDir: join(dir, 'out2'), fontsDir: join(dir, 'no-fonts'), gravatarFile: join(dir, 'no-gravatar.jpg') })
    expect(noFonts.faviconSource).toBe('none')
    expect(noFonts.ogSource).toBe('none')
    expect(noFonts.files).toEqual([])
    expect(siteAssetsIfPresent(join(dir, 'out2'))).toEqual({})
  })

  test('icoFromPng writes the 22-byte header', () => {
    const ico = icoFromPng(Buffer.from([1, 2, 3]), 32)
    expect(ico.byteLength).toBe(25)
    expect([...ico.subarray(22)]).toEqual([1, 2, 3])
  })
})
