/**
 * Privacy of the built site. No browser.
 * 1. The built site: with `showEmail: false` the email is in no text file of
 *    `dist/` (HTML, payload JSON, JS chunks, CSS). Run `npm run generate` first.
 *    Same for a hidden block (`hidden: true`, WP10a) and for a block that has not started yet
 *    (`startsAt`, WP11): none of its text is in `dist/`. The contact card (`.vcf`) is a text file too.
 * 2. The sanitizer itself (`toPublicProfile` in types/profile.ts), unit-checked.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { profileIsPersonal, readProfile, ROOT } from './helpers'
import { ProfileSchema, PublicProfileSchema, toPublicProfile, type Profile } from '../../types/profile'

const EXAMPLE_EMAIL = 'hello@example.com'
const TEXT_EXTENSIONS = new Set(['.html', '.json', '.js', '.mjs', '.css', '.txt', '.xml', '.svg', '.map', '.webmanifest', '.vcf'])

/** Every text file under `dir`, recursive. `dist` is a symlink to `.output/public`, so it is resolved first. */
function textFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return textFiles(path)
    return TEXT_EXTENSIONS.has(extname(entry.name)) ? [path] : []
  })
}

function filesContaining(dir: string, needle: string): string[] {
  const lower = needle.toLowerCase()
  return textFiles(dir)
    .filter(file => readFileSync(file, 'utf8').toLowerCase().includes(lower))
    .map(file => relative(dir, file))
}

test.describe('the built site', () => {
  /** Resolved inside the tests: a missing `dist/` fails a test, not the file load. */
  const distDir = () => realpathSync(resolve(ROOT, 'dist'))
  const profile = readProfile()

  test('has text files to check', () => {
    const files = textFiles(distDir())
    expect(files.some(file => file.endsWith('index.html'))).toBe(true)
    expect(files.some(file => file.endsWith('.js'))).toBe(true)
  })

  test('a hidden email is in no file of dist/', () => {
    test.skip(profile.profile.showEmail, 'this profile shows its email on purpose')
    // A block that links to the same address (a mailto tile) publishes it on purpose.
    const inBlocks = JSON.stringify(profile.blocks).toLowerCase().includes(profile.profile.email.toLowerCase())
    test.skip(inBlocks, 'a block of this profile uses the same address')
    // WP11: `contact.email` is public by intent. Typing the same address there publishes it on purpose.
    const inCard = profile.contact?.enabled === true && profile.contact.email?.toLowerCase() === profile.profile.email.toLowerCase()
    test.skip(inCard, 'the contact card of this profile uses the same address')
    expect(filesContaining(distDir(), profile.profile.email)).toEqual([])
  })

  test('a hidden block is in no file of dist/', () => {
    const hidden = profile.blocks.filter(block => block.hidden)
    // The tracked example ships one hidden link block on purpose.
    if (!profileIsPersonal()) expect(hidden.map(block => block.id)).toEqual(['b11'])
    test.skip(hidden.length === 0, 'this profile has no hidden block')
    const visible = JSON.stringify(profile.blocks.filter(block => !block.hidden))
    for (const block of hidden) {
      const texts = Object.entries(block)
        .filter(([key, value]) => typeof value === 'string' && value.length >= 8 && !['id', 'type', 'size', 'icon', 'network'].includes(key))
        .map(([, value]) => String(value))
        // A text that a visible block shows too is public on purpose.
        .filter(value => !visible.includes(value))
      expect(texts.length, `hidden block ${block.id} has no text to look for`).toBeGreaterThan(0)
      for (const value of texts) expect(filesContaining(distDir(), value), `"${value}" of hidden block ${block.id}`).toEqual([])
    }
  })

  test('a block that has not started yet is in no file of dist/ (WP11 schedule)', () => {
    const now = Date.now()
    const waiting = profile.blocks.filter(block => !block.hidden && block.startsAt && Date.parse(block.startsAt) > now)
    // The tracked example ships one link that starts in 2099 on purpose.
    if (!profileIsPersonal()) expect(waiting.map(block => block.id)).toEqual(['b13'])
    test.skip(waiting.length === 0, 'this profile has no block that starts later')
    const onPage = JSON.stringify(profile.blocks.filter(block => !waiting.includes(block) && !block.hidden))
    for (const block of waiting) {
      const texts = Object.entries(block)
        .filter(([key, value]) => typeof value === 'string' && value.length >= 8 && !['id', 'type', 'size', 'icon', 'network'].includes(key))
        .map(([, value]) => String(value))
        .filter(value => !onPage.includes(value))
      expect(texts.length, `block ${block.id} has no text to look for`).toBeGreaterThan(0)
      for (const value of texts) expect(filesContaining(distDir(), value), `"${value}" of block ${block.id}`).toEqual([])
    }
  })

  test('the contact card is in dist/ only when it is turned on, and the profile email is not in it', () => {
    const card = resolve(distDir(), 'site/contact.vcf')
    expect(existsSync(card)).toBe(profile.contact?.enabled === true)
    if (!existsSync(card)) return
    const text = readFileSync(card, 'utf8')
    expect(text).not.toMatch(/PHOTO/i)
    const sameOnPurpose = profile.contact?.email?.toLowerCase() === profile.profile.email.toLowerCase()
    if (!profile.profile.showEmail && !sameOnPurpose) expect(text.toLowerCase()).not.toContain(profile.profile.email.toLowerCase())
  })

  test('the example email is in no file of dist/', () => {
    test.skip(profileIsPersonal(), 'dist/ was built from content/profile.json, not from the example')
    expect(profile.profile.email).toBe(EXAMPLE_EMAIL)
    expect(filesContaining(distDir(), EXAMPLE_EMAIL)).toEqual([])
  })
})

test.describe('toPublicProfile', () => {
  const base: Profile = {
    profile: {
      name: 'Test Person',
      handle: 'test',
      bio: 'Bio.',
      highlights: ['One', 'Two'],
      email: 'private@tilebox.test',
      showEmail: false,
      theme: { colors: 'condomera', fonts: 'geist', mode: 'system' },
    },
    blocks: [{ id: 'b1', type: 'section', title: 'Projects' }],
    layout: { desktop: ['b1'] },
  }
  const withInfo = (patch: Partial<Profile['profile']>): Profile => ({ ...base, profile: { ...base.profile, ...patch } })

  test('removes the email when showEmail is false', () => {
    const result = toPublicProfile(base)
    expect('email' in result.profile).toBe(false)
    expect('showEmail' in result.profile).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private@tilebox.test')
    expect(result.profile.highlights).toEqual(['One', 'Two'])
    expect(result.blocks).toEqual(base.blocks)
  })

  test('keeps the email when showEmail is true', () => {
    const result = toPublicProfile(withInfo({ showEmail: true }))
    expect(result.profile.email).toBe('private@tilebox.test')
    expect('showEmail' in result.profile).toBe(false)
  })

  test('avatar: the uploaded one wins, then the Gravatar file, then none', () => {
    expect(toPublicProfile(withInfo({ avatar: '/avatar.png' }), '/avatar.gravatar.webp').profile.avatar).toBe('/avatar.png')
    expect(toPublicProfile(withInfo({ avatar: null }), '/avatar.gravatar.webp').profile.avatar).toBe('/avatar.gravatar.webp')
    expect(toPublicProfile(base, '/avatar.gravatar.webp').profile.avatar).toBe('/avatar.gravatar.webp')
    expect('avatar' in toPublicProfile(withInfo({ avatar: null })).profile).toBe(false)
  })

  test('removes hidden blocks and their ids from both layouts', () => {
    const input: Profile = {
      ...base,
      blocks: [
        { id: 'b1', type: 'section', title: 'Projects' },
        { id: 'b2', type: 'link', size: '1x1', title: 'Secret draft', url: 'https://example.com/secret', hidden: true },
        { id: 'b3', type: 'text', size: '1x1', body: 'Shown', hidden: false },
      ],
      layout: { desktop: ['b1', 'b2', 'b3'], mobile: ['b2', 'b3', 'b1'] },
    }
    const result = toPublicProfile(input)
    expect(result.blocks.map(block => block.id)).toEqual(['b1', 'b3'])
    expect(result.layout).toEqual({ desktop: ['b1', 'b3'], mobile: ['b3', 'b1'] })
    expect(JSON.stringify(result)).not.toContain('Secret draft')
    expect(JSON.stringify(result)).not.toContain('example.com/secret')
    // No mobile layout in, no mobile layout out.
    expect('mobile' in toPublicProfile({ ...input, layout: { desktop: ['b1', 'b2', 'b3'] } }).layout).toBe(false)
  })

  test('drops the editor-only link fields, and the image when showImage is off', () => {
    const meta = { title: 'Fetched title', description: 'Fetched text', source: 'html' as const, fetchedAt: '2026-09-18T00:00:00.000Z' }
    const image = '/thumbs/0123456789abcdef.webp'
    const favicon = '/icons/0123456789abcdef.png'
    const link = { id: 'b2', type: 'link' as const, size: '2x1' as const, title: 'Mine', url: 'https://example.com/', enrich: true, favicon, image, imageAlt: 'Alt', meta }
    const input: Profile = { ...base, blocks: [...base.blocks, link], layout: { desktop: ['b1', 'b2'] } }

    const off = toPublicProfile(input).blocks[1]
    expect(off).toEqual({ id: 'b2', type: 'link', size: '2x1', title: 'Mine', url: 'https://example.com/', favicon })
    expect(JSON.stringify(off)).not.toContain('Fetched')

    const on = toPublicProfile({ ...input, blocks: [...base.blocks, { ...link, showImage: true }] }).blocks[1]
    expect(on).toEqual({ id: 'b2', type: 'link', size: '2x1', title: 'Mine', url: 'https://example.com/', favicon, showImage: true, image, imageAlt: 'Alt' })
  })

  test('one call: a hidden block title and the hidden email are gone, and `site` passes through', () => {
    const input: Profile = {
      ...base,
      blocks: [
        { id: 'b1', type: 'section', title: 'Projects' },
        { id: 'b2', type: 'social', size: '1x1', network: 'github', url: 'https://github.com/secret-account', label: 'Secret account', hidden: true },
        { id: 'b3', type: 'link', size: '1x1', title: 'Secret draft', url: 'https://example.com/secret', hidden: true },
        { id: 'b4', type: 'social', size: '1x1', network: 'github', url: 'https://github.com/shown' },
      ],
      layout: { desktop: ['b1', 'b2', 'b3', 'b4'], mobile: ['b4', 'b3', 'b2', 'b1'] },
      site: { title: 'My page', lang: 'en', favicon: '/site-uploads/favicon-1a2b3c.png', ogImage: '/site-uploads/og-4d5e6f.jpg' },
    }
    const extras = { assets: { ogImage: '/site/og.png' }, builtAt: '2026-09-18T00:00:00.000Z' }
    const result = toPublicProfile(input, undefined, extras)
    const text = JSON.stringify(result)
    for (const secret of ['private@tilebox.test', 'Secret draft', 'example.com/secret', 'Secret account', 'secret-account', 'site-uploads']) {
      expect(text, secret).not.toContain(secret)
    }
    expect(result.layout).toEqual({ desktop: ['b1', 'b4'], mobile: ['b4', 'b1'] })
    expect(result.site).toEqual({ title: 'My page', lang: 'en', ...extras })
    // The public shape is strict: a key that is not public fails here.
    expect(PublicProfileSchema.safeParse(result).success).toBe(true)
    expect(PublicProfileSchema.safeParse({ ...result, profile: { ...result.profile, showEmail: false } }).success).toBe(false)
  })

  test('an old profile (no site, no hidden, no link extras) is still valid and keeps its blocks', () => {
    expect(ProfileSchema.safeParse(base).success).toBe(true)
    const result = toPublicProfile(base)
    expect(result.blocks).toEqual(base.blocks)
    expect(result.layout).toEqual(base.layout)
    expect(result.site).toEqual({})
    expect(PublicProfileSchema.safeParse(result).success).toBe(true)
  })

  test('does not change its input', () => {
    const input = withInfo({ showEmail: false })
    const before = JSON.stringify(input)
    toPublicProfile(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})
