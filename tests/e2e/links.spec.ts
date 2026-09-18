/**
 * Smart links (WP10a), the pure parts. No browser, no network.
 * - the brand icon map (app/utils/brand-icons.ts) against the installed packs;
 * - which icon a link tile shows and when it gets the featured look (blocks/media.ts);
 * - the schema rules (one spotlight, local file paths only);
 * - which local files reach the build (content/unfurl-cache.ts).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { allBrandIcons, BRAND_ICONS, brandIconFor } from '../../app/utils/brand-icons'
import { isSafeHref, linkImageLayout, resolveLinkIcon } from '../../app/components/blocks/media'
import { linkNeedsFetch, withLocalLinkFiles, type CacheEntry, type UnfurlDirs } from '../../content/unfurl-cache'
import { ProfileSchema, type LinkBlock, type Profile } from '../../types/profile'

const require = createRequire(import.meta.url)

interface Pack {
  icons: Record<string, { hidden?: boolean }>
  aliases?: Record<string, { hidden?: boolean }>
}

function pack(prefix: string): Pack {
  return JSON.parse(readFileSync(require.resolve(`@iconify-json/${prefix}/icons.json`), 'utf8')) as Pack
}

test.describe('brandIconFor', () => {
  test('matches the host, without www, then each parent domain', () => {
    expect(brandIconFor('https://github.com/nuxt')).toBe('line-md:github')
    expect(brandIconFor('https://WWW.GitHub.com/nuxt')).toBe('line-md:github')
    expect(brandIconFor('https://gist.github.com/x')).toBe('line-md:github')
    expect(brandIconFor('https://open.spotify.com/track/1')).toBe('line-md:spotify')
    expect(brandIconFor('https://music.apple.com/us/album/1')).toBe('simple-icons:applemusic')
    expect(brandIconFor('https://ricardo.substack.com')).toBe('simple-icons:substack')
  })

  test('short hosts and both X domains', () => {
    expect(brandIconFor('https://x.com/nuxt_js')).toBe('line-md:twitter-x')
    expect(brandIconFor('https://twitter.com/nuxt_js')).toBe('line-md:twitter-x')
    expect(brandIconFor('https://youtu.be/dQw4w9WgXcQ')).toBe('line-md:youtube')
    expect(brandIconFor('https://t.me/someone')).toBe('line-md:telegram')
    expect(brandIconFor('https://bsky.app/profile/nuxt.com')).toBe('line-md:bluesky')
    expect(brandIconFor('https://wa.me/15551234567')).toBe('simple-icons:whatsapp')
    expect(brandIconFor('https://www.linkedin.com/in/someone')).toBe('line-md:linkedin')
  })

  test('mailto: and tel: have their own icon, anything else has none', () => {
    expect(brandIconFor('mailto:me@example.com')).toBe('line-md:email')
    expect(brandIconFor('tel:+15551234567')).toBe('line-md:phone')
    expect(brandIconFor('https://example.com')).toBeUndefined()
    expect(brandIconFor('https://notgithub.com')).toBeUndefined()
    expect(brandIconFor('https://com')).toBeUndefined()
    expect(brandIconFor('javascript:alert(1)')).toBeUndefined()
    expect(brandIconFor('not a url')).toBeUndefined()
  })

  test('every icon of the map exists in its installed pack and is not hidden', () => {
    const packs = new Map<string, Pack>()
    const icons = allBrandIcons()
    expect(icons.length).toBeGreaterThanOrEqual(45)
    expect(Object.keys(BRAND_ICONS).length).toBeGreaterThanOrEqual(60)
    for (const name of icons) {
      const [prefix = '', icon = ''] = name.split(':')
      expect(['line-md', 'simple-icons'], name).toContain(prefix)
      if (!packs.has(prefix)) packs.set(prefix, pack(prefix))
      const entry = packs.get(prefix)?.icons[icon] ?? packs.get(prefix)?.aliases?.[icon]
      expect(entry, `${name} is missing`).toBeDefined()
      expect(entry?.hidden === true, `${name} is hidden`).toBe(false)
    }
  })

  test('the brands simple-icons removed are never used', () => {
    const banned = ['simple-icons:linkedin', 'simple-icons:twitter', 'simple-icons:amazon', 'simple-icons:slack']
    for (const name of banned) expect(allBrandIcons()).not.toContain(name)
    expect(pack('simple-icons').icons.linkedin?.hidden).toBe(true)
  })
})

test.describe('link tile decisions', () => {
  test('icon order: your icon, the brand icon, the local favicon, the link icon', () => {
    const favicon = '/icons/0123456789abcdef.png'
    expect(resolveLinkIcon({ url: 'https://github.com/nuxt', icon: 'line-md:star', favicon }))
      .toEqual({ kind: 'icon', name: 'line-md:star', source: 'manual' })
    expect(resolveLinkIcon({ url: 'https://github.com/nuxt', favicon }))
      .toEqual({ kind: 'icon', name: 'line-md:github', source: 'brand' })
    expect(resolveLinkIcon({ url: 'https://nuxt.com', favicon })).toEqual({ kind: 'favicon', src: favicon })
    expect(resolveLinkIcon({ url: 'https://nuxt.com' })).toEqual({ kind: 'icon', name: 'line-md:link', source: 'fallback' })
  })

  test('a favicon that is not a local file is never used', () => {
    for (const favicon of ['https://nuxt.com/icon.png', '//nuxt.com/icon.png', '/icons/../secret.png', '/blocks/x.png']) {
      expect(resolveLinkIcon({ url: 'https://nuxt.com', favicon })).toMatchObject({ kind: 'icon', source: 'fallback' })
    }
  })

  test('the featured look needs showImage, a local image and a tile larger than 1x1', () => {
    const image = '/thumbs/0123456789abcdef.webp'
    expect(linkImageLayout({ size: '2x2', showImage: true, image })).toBe('top')
    expect(linkImageLayout({ size: '1x2', showImage: true, image })).toBe('top')
    expect(linkImageLayout({ size: '2x1', showImage: true, image })).toBe('side')
    expect(linkImageLayout({ size: '1x1', showImage: true, image })).toBeNull()
    expect(linkImageLayout({ size: '2x2', showImage: false, image })).toBeNull()
    expect(linkImageLayout({ size: '2x2', image })).toBeNull()
    expect(linkImageLayout({ size: '2x2', showImage: true })).toBeNull()
    expect(linkImageLayout({ size: '2x2', showImage: true, image: 'https://nuxt.com/og.png' })).toBeNull()
  })

  test('tel: is a safe href next to http(s) and mailto:', () => {
    expect(isSafeHref('tel:+15551234567')).toBe(true)
    expect(isSafeHref('mailto:a@b.c')).toBe(true)
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
  })
})

const link = (id: string, extra: Partial<LinkBlock> = {}): LinkBlock => ({ id, type: 'link', size: '1x1', title: id, url: 'https://nuxt.com/', ...extra })

function profileWith(blocks: Profile['blocks']): Profile {
  return {
    profile: {
      name: 'Test Person',
      handle: 'test',
      bio: '',
      highlights: [],
      email: 'private@tilebox.test',
      showEmail: false,
      theme: { colors: 'condomera', fonts: 'geist', mode: 'system' },
    },
    blocks,
    layout: { desktop: blocks.map(block => block.id) },
  }
}

test.describe('schema', () => {
  test('an old profile without the new keys is still valid', () => {
    expect(ProfileSchema.safeParse(profileWith([link('a')])).success).toBe(true)
  })

  test('only one block may have a spotlight', () => {
    expect(ProfileSchema.safeParse(profileWith([link('a', { spotlight: 'pop' }), link('b')])).success).toBe(true)
    const two = ProfileSchema.safeParse(profileWith([link('a', { spotlight: 'pop' }), link('b', { spotlight: 'buzz' })]))
    expect(two.success).toBe(false)
    if (!two.success) expect(two.error.issues.map(issue => issue.path.join('.'))).toEqual(['blocks.1.spotlight'])
  })

  test('favicon and image must be local files, unknown keys and spotlights are refused', () => {
    const ok = link('a', { enrich: true, showImage: true, favicon: '/icons/0123456789abcdef.svg', image: '/thumbs/0123456789abcdef.webp', imageAlt: 'x', meta: { title: 'T', source: 'html', fetchedAt: '2026-09-18T00:00:00.000Z' } })
    expect(ProfileSchema.safeParse(profileWith([ok])).success).toBe(true)
    const bad: unknown[] = [
      { ...link('a'), favicon: 'https://nuxt.com/icon.png' },
      { ...link('a'), image: '/thumbs/x.png' },
      { ...link('a'), image: 'https://nuxt.com/og.png' },
      { ...link('a'), spotlight: 'spin' },
      { ...link('a'), meta: { source: 'html', fetchedAt: 'now', extra: true } },
      { ...link('a'), hidden: 'yes' },
    ]
    for (const block of bad) {
      expect(ProfileSchema.safeParse({ ...profileWith([]), blocks: [block], layout: { desktop: ['a'] } }).success, JSON.stringify(block)).toBe(false)
    }
  })

  test('`hidden` is accepted on every block type', () => {
    const blocks: Profile['blocks'] = [
      link('l', { hidden: true }),
      { id: 's', type: 'social', size: '1x1', network: 'github', url: 'https://github.com/x', hidden: true },
      { id: 'i', type: 'image', size: '1x1', src: '/blocks/sample.jpg', alt: 'a', source: null, hidden: true },
      { id: 't', type: 'text', size: '1x1', body: 'b', hidden: true },
      { id: 'h', type: 'section', title: 'S', hidden: true },
      { id: 'm', type: 'map', size: '1x1', label: 'City', url: 'https://maps.google.com/?q=City', hidden: true },
      { id: 'v', type: 'video', size: '1x1', url: 'https://youtu.be/dQw4w9WgXcQ', hidden: true },
    ]
    expect(ProfileSchema.safeParse(profileWith(blocks)).success).toBe(true)
  })
})

test.describe('local link files for the build', () => {
  let root = ''
  let dirs: UnfurlDirs
  const ownIcon = '/icons/aaaaaaaaaaaaaaaa.png'
  const cachedIcon = '/icons/bbbbbbbbbbbbbbbb.png'
  const cachedImage = '/thumbs/cccccccccccccccc.webp'

  test.beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tilebox-links-'))
    dirs = { icons: join(root, 'icons'), thumbs: join(root, 'thumbs'), cache: join(root, 'cache.json') }
    mkdirSync(dirs.icons)
    mkdirSync(dirs.thumbs)
    const entry: CacheEntry = {
      imageTried: true,
      data: { url: 'https://nuxt.com/', finalUrl: 'https://nuxt.com/', favicon: cachedIcon, image: cachedImage, imageAlt: 'Cached alt', source: 'html', fetchedAt: '2026-09-18T00:00:00.000Z' },
    }
    writeFileSync(dirs.cache, JSON.stringify({ version: 1, entries: { 'https://nuxt.com/': entry } }))
  })

  test.afterEach(() => rmSync(root, { recursive: true, force: true }))

  const first = (profile: Profile) => profile.blocks[0] as LinkBlock

  test('a path whose file is missing is dropped, a file from the cache is used instead', () => {
    writeFileSync(join(dirs.icons, 'bbbbbbbbbbbbbbbb.png'), 'x')
    writeFileSync(join(dirs.thumbs, 'cccccccccccccccc.webp'), 'x')
    const block = first(withLocalLinkFiles(profileWith([link('a', { enrich: true, showImage: true, favicon: ownIcon })]), dirs))
    expect(block.favicon).toBe(cachedIcon)
    expect(block.image).toBe(cachedImage)
    expect(block.imageAlt).toBe('Cached alt')
  })

  test('the block\'s own file wins when it is on disk, and no file at all means no key', () => {
    writeFileSync(join(dirs.icons, 'aaaaaaaaaaaaaaaa.png'), 'x')
    const own = first(withLocalLinkFiles(profileWith([link('a', { enrich: true, favicon: ownIcon })]), dirs))
    expect(own.favicon).toBe(ownIcon)
    expect('image' in own).toBe(false)

    rmSync(join(dirs.icons, 'aaaaaaaaaaaaaaaa.png'))
    const none = first(withLocalLinkFiles(profileWith([link('a', { enrich: true, showImage: true, favicon: ownIcon })]), dirs))
    expect('favicon' in none).toBe(false)
    expect('image' in none).toBe(false)
  })

  test('with enrich off nothing from the website is used, and the input is not changed', () => {
    writeFileSync(join(dirs.icons, 'aaaaaaaaaaaaaaaa.png'), 'x')
    const input = profileWith([link('a', { favicon: ownIcon })])
    const before = JSON.stringify(input)
    expect('favicon' in first(withLocalLinkFiles(input, dirs))).toBe(false)
    expect(JSON.stringify(input)).toBe(before)
  })

  test('linkNeedsFetch: only enriched links with a missing file', () => {
    expect(linkNeedsFetch(link('a'), dirs)).toBe(false)
    expect(linkNeedsFetch(link('a', { enrich: true }), dirs)).toBe(true)
    expect(linkNeedsFetch(link('a', { enrich: true, icon: 'line-md:star' }), dirs)).toBe(false)
    expect(linkNeedsFetch(link('a', { enrich: true, url: 'https://github.com/nuxt' }), dirs)).toBe(false)
    expect(linkNeedsFetch(link('a', { enrich: true, showImage: true, url: 'https://github.com/nuxt' }), dirs)).toBe(true)
    writeFileSync(join(dirs.icons, 'aaaaaaaaaaaaaaaa.png'), 'x')
    expect(linkNeedsFetch(link('a', { enrich: true, favicon: ownIcon }), dirs)).toBe(false)
  })
})
