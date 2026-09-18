/**
 * WP11, "Linktree second wave". `static` project.
 * 1. Unit-style checks, no browser, a FIXED `now`: the schedule matrix, the UTM
 *    matrix, the vCard text, the QR file, the link checker with a mocked transport.
 * 2. The built page (`dist/`, run `npm run generate` first): the end-date script,
 *    the share button, the contact tile, no foreign request.
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { brandIconFor } from '../../app/utils/brand-icons'
import { ENDS_AT_SCRIPT, isoToLocalInput, localInputToIso, scheduleState } from '../../app/utils/schedule'
import { buildHead } from '../../app/utils/site-head'
import { withoutUtm, withUtm } from '../../app/utils/utm'
import { buildVCard, escapeVCardText, foldVCardLine } from '../../app/utils/vcard'
import { checkLink, checkLinks, classifyStatus, LINK_CHECK_CONCURRENCY, linkTargets, MAX_LINKS } from '../../content/link-check'
import { buildSiteExtras } from '../../content/site-extras'
import { siteAssetsIfPresent } from '../../content/site-files'
import type { Transport, TransportResponse } from '../../content/unfurl'
import { USER_AGENT } from '../../content/unfurl'
import { normalizeUrl, withLocalLinkFiles, type UnfurlDirs } from '../../content/unfurl-cache'
import { BlockSchema, blockDropReason, contactFileName, ProfileSchema, PublicProfileSchema, toPublicProfile, type Block, type Profile } from '../../types/profile'
import { profileIsPersonal, readProfile, settle } from './helpers'

const NOW = new Date('2026-09-18T12:00:00Z')
const PAST = '2026-01-01T00:00:00Z'
const SOON = '2026-12-01T09:00:00-05:00'
const LATER = '2027-06-01T00:00:00+02:00'
const PRIVATE_EMAIL = 'private.owner@secret.example'

const link = (id: string, extra: Partial<Extract<Block, { type: 'link' }>> = {}): Block =>
  ({ id, type: 'link', size: '1x1', title: `Title of ${id}`, url: `https://${id}.example/page`, ...extra })

function profileOf(blocks: Block[], extra: Partial<Profile> = {}): Profile {
  const ids = blocks.map(block => block.id)
  return ProfileSchema.parse({
    profile: {
      name: 'Ada Lovelace',
      handle: 'ada',
      bio: 'Bio',
      highlights: [],
      email: PRIVATE_EMAIL,
      showEmail: false,
      theme: { colors: 'condomera', fonts: 'geist', mode: 'system' },
    },
    blocks,
    layout: { desktop: ids, mobile: [...ids].reverse() },
    ...extra,
  })
}

/* ---------- schema ---------- */

test.describe('schema', () => {
  test('all new keys are optional: an old profile is still valid', () => {
    const old = profileOf([link('a')])
    expect(old.contact).toBeUndefined()
    expect(old.site).toBeUndefined()
    expect(ProfileSchema.safeParse(old).success).toBe(true)
  })

  test('startsAt and endsAt need an offset, and endsAt must be after startsAt', () => {
    expect(BlockSchema.safeParse(link('a', { startsAt: SOON, endsAt: LATER })).success).toBe(true)
    expect(BlockSchema.safeParse(link('a', { startsAt: '2026-12-01T09:00:00Z' })).success).toBe(true)
    expect(BlockSchema.safeParse(link('a', { startsAt: '2026-12-01T09:00:00' })).success).toBe(false)
    expect(BlockSchema.safeParse(link('a', { startsAt: '2026-12-01' })).success).toBe(false)
    const swapped = BlockSchema.safeParse(link('a', { startsAt: LATER, endsAt: SOON }))
    expect(swapped.success).toBe(false)
    expect(JSON.stringify(swapped.error?.issues)).toContain('endsAt must be after startsAt')
    expect(BlockSchema.safeParse(link('a', { startsAt: SOON, endsAt: SOON })).success).toBe(false)
  })

  test('the schedule is accepted on every block type', () => {
    const blocks: unknown[] = [
      link('l'),
      { id: 's', type: 'social', size: '1x1', network: 'github', url: 'https://github.com/x' },
      { id: 'i', type: 'image', size: '1x1', src: '/blocks/sample.jpg', alt: 'a', source: null },
      { id: 't', type: 'text', size: '1x1', body: 'b' },
      { id: 'h', type: 'section', title: 'S' },
      { id: 'm', type: 'map', size: '1x1', label: 'City', url: 'https://maps.google.com/?q=City' },
      { id: 'v', type: 'video', size: '1x1', url: 'https://youtu.be/dQw4w9WgXcQ' },
      { id: 'c', type: 'contact', size: '2x1' },
      { id: 'q', type: 'qr', size: '2x2' },
    ]
    for (const block of blocks) {
      expect(BlockSchema.safeParse({ ...(block as object), startsAt: SOON, endsAt: LATER }).success, JSON.stringify(block)).toBe(true)
    }
  })

  test('a qr tile is 1x1 or 2x2; utm values are lowercase slugs; contact and site are strict', () => {
    expect(BlockSchema.safeParse({ id: 'q', type: 'qr', size: '2x1' }).success).toBe(false)
    expect(BlockSchema.safeParse({ id: 'i', type: 'image', size: '1x1', src: '/a.jpg', alt: 'a', source: null, noUtm: true }).success).toBe(false)
    const withSite = (site: unknown) => ProfileSchema.safeParse({ ...profileOf([link('a')]), site }).success
    expect(withSite({ utm: { source: 'tilebox', medium: 'profile' } })).toBe(true)
    expect(withSite({ utm: { source: 'tilebox', medium: 'profile', campaign: 'spring_2027' } })).toBe(true)
    expect(withSite({ utm: { source: 'Tilebox', medium: 'profile' } })).toBe(false)
    expect(withSite({ utm: { source: 'a b', medium: 'profile' } })).toBe(false)
    expect(withSite({ utm: { source: 'a'.repeat(41), medium: 'profile' } })).toBe(false)
    expect(withSite({ utm: { source: 'tilebox' } })).toBe(false)
    expect(withSite({ utm: { source: 'a', medium: 'b', term: 'c' } })).toBe(false)
    expect(withSite({ share: false })).toBe(true)
    const withContact = (contact: unknown) => ProfileSchema.safeParse({ ...profileOf([link('a')]), contact }).success
    expect(withContact({ enabled: true })).toBe(true)
    expect(withContact({ enabled: true, photo: '/avatar.jpg' })).toBe(false)
    expect(withContact({ email: 'not-an-email' })).toBe(false)
    expect(withContact({ url: 'javascript:alert(1)' })).toBe(false)
    expect(withContact({ phone: '+57 300 123 4567' })).toBe(true)
    expect(withContact({ phone: 'call me\r\nBEGIN:VCARD' })).toBe(false)
  })
})

/* ---------- schedule ---------- */

test.describe('schedule (fixed now)', () => {
  test('scheduleState', () => {
    expect(scheduleState({}, NOW)).toBe('live')
    expect(scheduleState({ startsAt: PAST }, NOW)).toBe('live')
    expect(scheduleState({ startsAt: SOON }, NOW)).toBe('scheduled')
    expect(scheduleState({ endsAt: SOON }, NOW)).toBe('ends')
    expect(scheduleState({ endsAt: PAST }, NOW)).toBe('expired')
    expect(scheduleState({ endsAt: NOW.toISOString() }, NOW)).toBe('expired')
    expect(scheduleState({ startsAt: PAST, endsAt: SOON }, NOW)).toBe('ends')
  })

  test('a future start and a past end are removed like a hidden block, from both layouts', () => {
    const input = profileOf([
      link('live'),
      link('future', { startsAt: SOON, title: 'Secret launch title' }),
      link('expired', { startsAt: '2025-01-01T00:00:00Z', endsAt: PAST, title: 'Old campaign title' }),
      link('ending', { startsAt: PAST, endsAt: SOON }),
      link('off', { hidden: true }),
    ])
    const before = JSON.stringify(input)
    const out = toPublicProfile(input, undefined, undefined, { now: NOW })
    expect(out.blocks.map(block => block.id)).toEqual(['live', 'ending'])
    expect(out.layout.desktop).toEqual(['live', 'ending'])
    expect(out.layout.mobile).toEqual(['ending', 'live'])
    const text = JSON.stringify(out)
    expect(text).not.toContain('Secret launch title')
    expect(text).not.toContain('Old campaign title')
    expect(text).not.toContain('future.example')
    // The block that stays keeps ONLY `endsAt`: the start date never ships.
    const ending = out.blocks.find(block => block.id === 'ending')
    expect(ending?.endsAt).toBe(SOON)
    expect(text).not.toContain('startsAt')
    expect(PublicProfileSchema.safeParse(out).success).toBe(true)
    expect(JSON.stringify(input)).toBe(before)
  })

  test('the same profile later: the started block shows, the ended one is gone', () => {
    const input = profileOf([link('future', { startsAt: SOON }), link('ending', { endsAt: SOON })])
    const later = toPublicProfile(input, undefined, undefined, { now: new Date('2027-01-01T00:00:00Z') })
    expect(later.blocks.map(block => block.id)).toEqual(['future'])
  })

  test('blockDropReason names the reason (check:profile prints it)', () => {
    expect(blockDropReason(link('a', { startsAt: SOON }), NOW)).toBe('scheduled')
    expect(blockDropReason(link('a', { endsAt: PAST }), NOW)).toBe('expired')
    expect(blockDropReason(link('a', { hidden: true, endsAt: PAST }), NOW)).toBe('hidden')
    expect(blockDropReason({ id: 'c', type: 'contact', size: '1x1' }, NOW, {})).toBe('no-contact-file')
    expect(blockDropReason({ id: 'c', type: 'contact', size: '1x1' }, NOW, { contactCard: '/site/contact.vcf' })).toBeNull()
    expect(blockDropReason({ id: 'q', type: 'qr', size: '1x1' }, NOW, {})).toBe('no-qr-file')
    expect(blockDropReason({ id: 'q', type: 'qr', size: '1x1' }, NOW, { qrCode: '/site/qr.svg' })).toBeNull()
  })

  test('datetime-local <-> ISO with the offset of this machine', () => {
    const iso = localInputToIso('2026-12-01T09:30')
    expect(iso).toMatch(/^2026-12-01T09:30:00[+-]\d{2}:\d{2}$/)
    expect(BlockSchema.safeParse(link('a', { startsAt: iso })).success).toBe(true)
    expect(isoToLocalInput(iso)).toBe('2026-12-01T09:30')
    expect(new Date(iso ?? '').getTime()).toBe(new Date(2026, 11, 1, 9, 30).getTime())
    expect(localInputToIso('')).toBeUndefined()
    expect(localInputToIso('nonsense')).toBeUndefined()
    expect(isoToLocalInput(undefined)).toBe('')
  })

  test('the inline script is small and makes no request', () => {
    expect(Buffer.byteLength(ENDS_AT_SCRIPT)).toBeLessThan(400)
    expect(ENDS_AT_SCRIPT).not.toMatch(/fetch|XMLHttpRequest|import|src=|https?:/)
  })
})

/* ---------- UTM ---------- */

test.describe('UTM tags (build time)', () => {
  const utm = { source: 'tilebox', medium: 'profile', campaign: 'spring-2027' }

  test('withUtm: the matrix', () => {
    expect(withUtm('https://a.example/page', utm)).toBe('https://a.example/page?utm_source=tilebox&utm_medium=profile&utm_campaign=spring-2027')
    // An existing query and the hash stay as typed.
    expect(withUtm('https://maps.google.com/?q=Bogot%C3%A1+DC#map', utm)).toBe('https://maps.google.com/?q=Bogot%C3%A1+DC&utm_source=tilebox&utm_medium=profile&utm_campaign=spring-2027#map')
    // An existing utm_* parameter is never replaced; the missing ones are added.
    expect(withUtm('https://a.example/?utm_source=newsletter', utm)).toBe('https://a.example/?utm_source=newsletter&utm_medium=profile&utm_campaign=spring-2027')
    expect(withUtm('https://a.example/?utm_source=x&utm_medium=y&utm_campaign=z', utm)).toBe('https://a.example/?utm_source=x&utm_medium=y&utm_campaign=z')
    // No campaign = two tags.
    expect(withUtm('https://a.example', { source: 'tilebox', medium: 'profile' })).toBe('https://a.example?utm_source=tilebox&utm_medium=profile')
    // Never: mail, phone, local paths, the site itself, no settings.
    expect(withUtm('mailto:ada@a.example?subject=Hi', utm)).toBe('mailto:ada@a.example?subject=Hi')
    expect(withUtm('tel:+573001234567', utm)).toBe('tel:+573001234567')
    expect(withUtm('/site/contact.vcf', utm)).toBe('/site/contact.vcf')
    expect(withUtm('https://ada.example/blog', utm, 'https://ada.example')).toBe('https://ada.example/blog')
    expect(withUtm('https://www.ada.example/blog', utm, 'https://ada.example')).toBe('https://www.ada.example/blog')
    expect(withUtm('https://a.example/', undefined)).toBe('https://a.example/')
  })

  test('withoutUtm puts the URL back', () => {
    for (const url of ['https://a.example/page', 'https://a.example/?q=1#x', 'https://a.example']) {
      expect(withoutUtm(withUtm(url, utm))).toBe(url)
    }
  })

  test('toPublicProfile tags link, social, map and video blocks; noUtm, hidden and same-site blocks stay as typed', () => {
    const input = profileOf([
      link('plain'),
      link('optout', { noUtm: true }),
      link('mail', { url: 'mailto:ada@a.example' }),
      link('own', { url: 'https://ada.example/blog' }),
      link('off', { hidden: true }),
      { id: 'soc', type: 'social', size: '1x1', network: 'github', url: 'https://github.com/ada' },
      { id: 'map', type: 'map', size: '1x1', label: 'City', url: 'https://maps.google.com/?q=City' },
      { id: 'vid', type: 'video', size: '2x1', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { id: 'img', type: 'image', size: '1x1', src: '/blocks/sample.jpg', alt: 'a', source: { provider: 'pexels', id: '1', url: 'https://www.pexels.com/photo/1' } },
    ], { site: { url: 'https://ada.example', utm } })
    const before = JSON.stringify(input)
    const out = toPublicProfile(input, undefined, undefined, { now: NOW })
    const urlOf = (id: string) => {
      const block = out.blocks.find(item => item.id === id)
      return block && 'url' in block ? block.url : undefined
    }
    const tags = 'utm_source=tilebox&utm_medium=profile&utm_campaign=spring-2027'
    expect(urlOf('plain')).toBe(`https://plain.example/page?${tags}`)
    expect(urlOf('soc')).toBe(`https://github.com/ada?${tags}`)
    expect(urlOf('map')).toBe(`https://maps.google.com/?q=City&${tags}`)
    expect(urlOf('vid')).toBe(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&${tags}`)
    expect(urlOf('optout')).toBe('https://optout.example/page')
    expect(urlOf('mail')).toBe('mailto:ada@a.example')
    expect(urlOf('own')).toBe('https://ada.example/blog')
    expect(urlOf('off')).toBeUndefined()
    const text = JSON.stringify(out)
    expect(text).not.toContain('noUtm')
    expect(text).toContain('https://www.pexels.com/photo/1"')
    // The settings themselves do not ship: they are inside the links already.
    expect(Object.keys(out.site ?? {})).not.toContain('utm')
    expect(PublicProfileSchema.safeParse(out).success).toBe(true)
    // The stored profile is untouched: its URLs stay clean.
    expect(JSON.stringify(input)).toBe(before)
  })

  test('the env site URL wins for "same site"', () => {
    const input = profileOf([link('own', { url: 'https://live.example/x' })], { site: { url: 'https://other.example', utm } })
    const out = toPublicProfile(input, undefined, undefined, { now: NOW, envSiteUrl: 'https://live.example' })
    expect(out.blocks[0]).toMatchObject({ url: 'https://live.example/x' })
  })

  test('JSON-LD sameAs carries no tracking', () => {
    const input = profileOf([{ id: 'soc', type: 'social', size: '1x1', network: 'github', url: 'https://github.com/ada' }], { site: { utm } })
    const head = buildHead(toPublicProfile(input, undefined, undefined, { now: NOW }), 'https://ada.example')
    const text = JSON.stringify(head)
    expect(text).toContain('https://github.com/ada')
    expect(text).not.toContain('utm_source')
  })

  test('the brand icon, the domain line and the unfurl cache key use the ORIGINAL url', () => {
    const original = 'https://github.com/nuxt'
    const tagged = withUtm(original, utm)
    expect(tagged).not.toBe(original)
    expect(brandIconFor(tagged)).toBe(brandIconFor(original))
    expect(new URL(tagged).hostname).toBe('github.com')
    expect(normalizeUrl(tagged)).not.toBe(normalizeUrl(original))

    // The cache is keyed by the original URL. The build reads it BEFORE the tags are added, so the local files still attach.
    const dir = mkdtempSync(join(tmpdir(), 'tilebox-utm-'))
    try {
      const dirs: UnfurlDirs = { icons: join(dir, 'icons'), thumbs: join(dir, 'thumbs'), cache: join(dir, 'cache.json') }
      mkdirSync(dirs.icons)
      mkdirSync(dirs.thumbs)
      writeFileSync(join(dirs.icons, 'abc123.png'), 'x')
      const key = normalizeUrl('https://blog.example/post') ?? ''
      writeFileSync(dirs.cache, JSON.stringify({
        version: 1,
        entries: { [key]: { data: { url: key, finalUrl: key, favicon: '/icons/abc123.png', source: 'html', fetchedAt: NOW.toISOString() }, imageTried: false } },
        failures: {},
      }))
      const input = profileOf([link('blog', { url: 'https://blog.example/post', enrich: true })], { site: { utm } })
      const out = toPublicProfile(withLocalLinkFiles(input, dirs), undefined, undefined, { now: NOW })
      expect(out.blocks[0]).toMatchObject({ favicon: '/icons/abc123.png', url: `https://blog.example/post?utm_source=tilebox&utm_medium=profile&utm_campaign=spring-2027` })
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/* ---------- vCard ---------- */

test.describe('contact card (vCard 3.0)', () => {
  test('escaping, CRLF, folding, no PHOTO', () => {
    expect(escapeVCardText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    const card = buildVCard({
      enabled: true,
      fullName: 'Ada King, Countess; of Lovelace',
      org: 'Analytical Engines, Ltd.',
      title: 'Mathematician; writer',
      phone: '+44 20 7946 0000',
      email: 'ada.public@a.example',
      url: 'https://ada.example/?a=1,2;b',
      note: `Line one\nLine two with a very long text ${'x'.repeat(120)} and an accent: Bogotá ñ`,
    }, 'Ignored Name')
    // CRLF only: no bare LF, no bare CR.
    expect(card.endsWith('\r\n')).toBe(true)
    expect(card.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    const lines = card.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCARD')
    expect(lines[1]).toBe('VERSION:3.0')
    expect(lines.at(-2)).toBe('END:VCARD')
    // Every physical line is 75 octets at most; a continuation starts with a space.
    for (const line of lines) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    const unfolded = card.replace(/\r\n /g, '').split('\r\n')
    expect(unfolded).toContain('N:King\\, Countess\\; of Lovelace;Ada;;;')
    expect(unfolded).toContain('FN:Ada King\\, Countess\\; of Lovelace')
    expect(unfolded).toContain('ORG:Analytical Engines\\, Ltd.')
    expect(unfolded).toContain('TITLE:Mathematician\\; writer')
    expect(unfolded).toContain('TEL;TYPE=CELL:+44 20 7946 0000')
    expect(unfolded).toContain('EMAIL;TYPE=INTERNET:ada.public@a.example')
    expect(unfolded).toContain('URL:https://ada.example/?a=1,2;b')
    expect(unfolded.find(line => line.startsWith('NOTE:'))).toContain('Line one\\nLine two')
    expect(unfolded.find(line => line.startsWith('NOTE:'))).toContain('Bogotá ñ')
    expect(card).not.toMatch(/PHOTO/i)
    expect(card).not.toContain('Ignored Name')
  })

  test('folding never cuts a character', () => {
    const folded = foldVCardLine(`NOTE:${'ñ'.repeat(100)}`)
    for (const line of folded.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(`NOTE:${'ñ'.repeat(100)}`)
  })

  test('the name defaults to the profile name; a single word is the given name', () => {
    expect(buildVCard({ enabled: true }, 'Ada Lovelace')).toContain('N:Lovelace;Ada;;;\r\nFN:Ada Lovelace\r\n')
    expect(buildVCard({ enabled: true }, 'Ada')).toContain('N:;Ada;;;\r\nFN:Ada\r\n')
    expect(contactFileName('Ada Lovelace')).toBe('ada-lovelace.vcf')
    expect(contactFileName('José Ñandú')).toBe('jose-nandu.vcf')
    expect(contactFileName('***')).toBe('contact.vcf')
  })

  test('the PROFILE email never leaks: not in the card, not in the public profile', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tilebox-vcf-'))
    try {
      const input = profileOf([{ id: 'c', type: 'contact', size: '1x1' }], { contact: { enabled: true, org: 'Engines' } })
      const result = await buildSiteExtras({ profile: input, outDir: dir })
      expect(result.files).toEqual(['contact.vcf'])
      const card = readFileSync(join(dir, 'contact.vcf'), 'utf8')
      expect(card).toContain('FN:Ada Lovelace')
      expect(card).not.toContain(PRIVATE_EMAIL)
      expect(card).not.toMatch(/^EMAIL/m)

      const out = toPublicProfile(input, undefined, { assets: siteAssetsIfPresent(dir) }, { now: NOW })
      expect(out.blocks.map(block => block.id)).toEqual(['c'])
      expect(out.contact).toEqual({ fileName: 'ada-lovelace.vcf' })
      expect(JSON.stringify(out)).not.toContain(PRIVATE_EMAIL)
      expect(JSON.stringify(out)).not.toContain('Engines')
      expect(PublicProfileSchema.safeParse(out).success).toBe(true)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('contact off: the old file is removed and the build drops the tile', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tilebox-vcf-'))
    try {
      writeFileSync(join(dir, 'contact.vcf'), 'stale')
      const input = profileOf([link('a'), { id: 'c', type: 'contact', size: '1x1' }], { contact: { enabled: false, org: 'Engines' } })
      const result = await buildSiteExtras({ profile: input, outDir: dir })
      expect(result.files).toEqual([])
      expect(existsSync(join(dir, 'contact.vcf'))).toBe(false)
      expect(result.messages.join('\n')).toContain('left out')
      const out = toPublicProfile(input, undefined, { assets: siteAssetsIfPresent(dir) }, { now: NOW })
      expect(out.blocks.map(block => block.id)).toEqual(['a'])
      expect(out.layout.desktop).toEqual(['a'])
      expect(out.layout.mobile).toEqual(['a'])
      expect(out.contact).toBeUndefined()
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/* ---------- QR code ---------- */

test.describe('QR code', () => {
  let dir = ''
  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tilebox-qr-'))
  })
  test.afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const qrBlock: Block = { id: 'q', type: 'qr', size: '1x1' }

  test('no site URL: no file, a stale file is removed, the tile is dropped', async () => {
    writeFileSync(join(dir, 'qr.svg'), '<svg/>')
    const input = profileOf([link('a'), qrBlock])
    const result = await buildSiteExtras({ profile: input, outDir: dir })
    expect(result.qrUrl).toBe('')
    expect(existsSync(join(dir, 'qr.svg'))).toBe(false)
    expect(result.messages.join('\n')).toContain('no site URL')
    const out = toPublicProfile(input, undefined, { assets: siteAssetsIfPresent(dir) }, { now: NOW })
    expect(out.blocks.map(block => block.id)).toEqual(['a'])
  })

  test('site.url: an SVG our code drew, in the light preset colors, no script, no link', async () => {
    const input = profileOf([qrBlock], { site: { url: 'https://ada.example' } })
    const result = await buildSiteExtras({ profile: input, outDir: dir })
    expect(result.qrUrl).toBe('https://ada.example/')
    const svg = readFileSync(join(dir, 'qr.svg'), 'utf8')
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('#0B1F33')
    expect(svg).toContain('#EEF4F8')
    expect(svg).not.toMatch(/<script|href|onload|<image|<foreignObject/i)
    const out = toPublicProfile(input, undefined, { assets: siteAssetsIfPresent(dir) }, { now: NOW })
    expect(out.blocks.map(block => block.id)).toEqual(['q'])
    expect(out.site?.assets?.qrCode).toBe('/site/qr.svg')
  })

  test('the env URL wins; http is refused', async () => {
    const input = profileOf([qrBlock], { site: { url: 'https://ada.example' } })
    expect((await buildSiteExtras({ profile: input, outDir: dir, envSiteUrl: 'https://live.example/me' })).qrUrl).toBe('https://live.example/me/')
    const refused = await buildSiteExtras({ profile: input, outDir: dir, envSiteUrl: 'http://live.example' })
    expect(refused.qrUrl).toBe('')
    expect(existsSync(join(dir, 'qr.svg'))).toBe(false)
    expect(refused.messages.join('\n')).toContain('not https')
  })
})

/* ---------- link check ---------- */

test.describe('dead-link check (mocked transport, no network)', () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }]
  const answer = (status: number, headers: Record<string, string> = {}, body: AsyncIterable<Uint8Array> | null = null): TransportResponse =>
    ({ status, headers: { get: name => headers[name.toLowerCase()] ?? null }, body })

  test('classifyStatus', () => {
    for (const status of [200, 204, 304]) expect(classifyStatus(status).status).toBe('ok')
    for (const status of [401, 403, 429, 400, 451]) expect(classifyStatus(status).status).toBe('blocked')
    for (const status of [404, 410, 500, 502, 503]) expect(classifyStatus(status).status).toBe('broken')
    expect(classifyStatus(403).reason).toContain('probably fine')
    expect(classifyStatus(404).reason).toBe('http 404')
  })

  test('HEAD first with the honest user agent; 405 / 403 / 501 retry with a GET that reads 1 KB at most', async () => {
    const calls: { method: string, url: string, agent: string, pinned: string | null }[] = []
    let chunksRead = 0
    async function* bigBody() {
      for (let i = 0; i < 50; i++) {
        chunksRead++
        yield new Uint8Array(1024)
      }
    }
    const transport: Transport = async (url, init) => {
      calls.push({ method: init.method ?? 'GET', url: url.href, agent: init.headers['user-agent'] ?? '', pinned: init.pinned?.address ?? null })
      if (url.hostname === 'nohead.example') return init.method === 'HEAD' ? answer(405) : answer(200, {}, bigBody())
      if (url.hostname === 'wall.example') return answer(403)
      if (url.hostname === 'moved.example') return answer(301, { location: 'https://target.example/new' })
      if (url.hostname === 'gone.example') return answer(404)
      return answer(200)
    }
    const options = { transport, lookup }

    expect(await checkLink('https://fine.example/', options)).toEqual({ status: 'ok', reason: 'http 200' })
    expect(calls.map(call => call.method)).toEqual(['HEAD'])
    expect(calls[0]?.agent).toBe(USER_AGENT)
    expect(calls[0]?.pinned).toBe('93.184.216.34')

    calls.length = 0
    expect((await checkLink('https://nohead.example/', options)).status).toBe('ok')
    expect(calls.map(call => call.method)).toEqual(['HEAD', 'GET'])
    expect(chunksRead).toBeLessThanOrEqual(2)

    calls.length = 0
    expect(await checkLink('https://wall.example/', options)).toEqual({ status: 'blocked', reason: 'http 403: site blocks checks, probably fine' })
    expect(calls.map(call => call.method)).toEqual(['HEAD', 'GET'])

    calls.length = 0
    expect((await checkLink('https://moved.example/old', options)).status).toBe('ok')
    expect(calls.map(call => call.url)).toEqual(['https://moved.example/old', 'https://target.example/new'])

    expect(await checkLink('https://gone.example/', options)).toEqual({ status: 'broken', reason: 'http 404' })
  })

  test('network failures are broken, with the reason of the engine; the SSRF guard still applies', async () => {
    const failing = (code: string): Transport => async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('x'), { code }) })
    }
    expect(await checkLink('https://a.example/', { transport: failing('ENOTFOUND'), lookup })).toEqual({ status: 'broken', reason: 'offline or unknown host' })
    expect(await checkLink('https://a.example/', { transport: failing('CERT_HAS_EXPIRED'), lookup })).toEqual({ status: 'broken', reason: 'bad certificate' })
    expect(await checkLink('https://a.example/', { transport: failing('UND_ERR_CONNECT_TIMEOUT'), lookup })).toEqual({ status: 'broken', reason: 'timeout' })

    // No `allowHosts`, a real private address: refused before any connection.
    let connected = false
    const transport: Transport = async () => {
      connected = true
      return answer(200)
    }
    expect(await checkLink('http://127.0.0.1/admin', { transport })).toEqual({ status: 'broken', reason: 'blocked address' })
    expect(await checkLink('https://intranet.example/', { transport, lookup: async () => [{ address: '10.0.0.5', family: 4 }] })).toEqual({ status: 'broken', reason: 'blocked address' })
    expect(connected).toBe(false)
  })

  test('linkTargets: external http(s) only, unique, original URLs, 60 at most', () => {
    const input = profileOf([
      link('a', { url: 'https://same.example/' }),
      link('b', { url: 'https://same.example/' }),
      link('mail', { url: 'mailto:ada@a.example' }),
      link('off', { hidden: true }),
      { id: 'c', type: 'contact', size: '1x1' },
    ], { site: { utm: { source: 'tilebox', medium: 'profile' } }, contact: { enabled: true, url: 'https://card.example' } })
    expect(linkTargets(input)).toEqual([
      { url: 'https://same.example/', blockIds: ['a', 'b'] },
      { url: 'https://off.example/page', blockIds: ['off'] },
      { url: 'https://card.example', blockIds: ['contact'] },
    ])
    const many = profileOf(Array.from({ length: 80 }, (_, i) => link(`n${i}`)))
    expect(linkTargets(many)).toHaveLength(MAX_LINKS)
  })

  test('checkLinks: 4 at a time, one host at a time, results in order', async () => {
    let active = 0
    let maxActive = 0
    const activeByHost = new Map<string, number>()
    let sameHostOverlap = false
    const transport: Transport = async (url) => {
      active++
      maxActive = Math.max(maxActive, active)
      const onHost = (activeByHost.get(url.host) ?? 0) + 1
      activeByHost.set(url.host, onHost)
      if (onHost > 1) sameHostOverlap = true
      await new Promise(resolve => setTimeout(resolve, 20))
      active--
      activeByHost.set(url.host, onHost - 1)
      return answer(url.pathname === '/missing' ? 404 : 200)
    }
    const targets = [
      ...Array.from({ length: 9 }, (_, i) => ({ url: `https://h${i}.example/`, blockIds: [`b${i}`] })),
      { url: 'https://h0.example/missing', blockIds: ['x'] },
      { url: 'https://h0.example/other', blockIds: ['y'] },
    ]
    const seen: string[] = []
    const results = await checkLinks(targets, { transport, lookup }, result => seen.push(result.url))
    expect(results.map(result => result.url)).toEqual(targets.map(target => target.url))
    expect(results.find(result => result.url.endsWith('/missing'))?.status).toBe('broken')
    expect(results.filter(result => result.status === 'ok')).toHaveLength(10)
    expect(maxActive).toBeLessThanOrEqual(LINK_CHECK_CONCURRENCY)
    expect(maxActive).toBeGreaterThan(1)
    expect(sameHostOverlap).toBe(false)
    expect(seen).toHaveLength(targets.length)
    expect(await checkLinks([], { transport, lookup })).toEqual([])
  })
})

/* ---------- the built page ---------- */

test.describe('the built page', () => {
  const profile = readProfile()
  const TOGGLE = 'button[aria-label^="Theme:"]'
  const SHARE = '[data-share-button]'

  test('a tile with an end date carries data-ends-at, and the inline script hides it when the time has passed', async ({ page }) => {
    const ending = profile.blocks.filter(block => block.endsAt && blockDropReason(block, new Date(), { contactCard: 'x', qrCode: 'x' }) === null)
    if (!profileIsPersonal()) expect(ending.map(block => block.id)).toEqual(['b7'])
    test.skip(ending.length === 0, 'this profile has no block with an end date')

    await page.goto('/')
    const tiles = page.locator('li[data-ends-at]')
    await expect(tiles).toHaveCount(ending.length)
    await expect(tiles.first()).toBeVisible()
    expect(await page.locator('script').evaluateAll(list => list.filter(el => el.textContent?.includes('data-ends-at')).length)).toBe(1)
    // The start date never ships.
    expect(await page.content()).not.toContain('startsAt":"')

    // A visitor who opens the page after the end date: hidden at load, before and after hydration.
    await page.clock.install({ time: new Date('2100-01-01T00:00:00Z') })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('li[data-ends-at]').first()).toBeHidden()
    expect(await page.locator('li[data-ends-at]').first().getAttribute('hidden')).not.toBeNull()
  })

  test('a tab that stays open: the 60 s check hides a tile whose time passes', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-18T12:00:00Z') })
    await page.goto('/')
    test.skip(await page.locator('li[data-ends-at]').count() === 0, 'this profile has no block with an end date')
    const tile = page.locator('li[data-ends-at]').first()
    await tile.evaluate(el => el.setAttribute('data-ends-at', '2026-09-18T12:00:30Z'))
    await expect(tile).toBeVisible()
    await page.clock.runFor(61_000)
    await expect(tile).toBeHidden()
  })

  test('the share button copies the address and says so, with no foreign or /api/ request', async ({ page, context, baseURL }) => {
    test.skip(profile.site?.share === false, 'this profile turned the share button off')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    // Desktop browsers without the share sheet. Forced, so the test is the same on every machine.
    await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Nuxt may still read its own build manifest (same origin). Anything else is a failure.
    const origin = new URL(baseURL ?? '').host
    const requests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.host !== origin || url.pathname.startsWith('/api/')) requests.push(request.url())
    })

    const button = page.locator(SHARE)
    await expect(button).toHaveAttribute('aria-label', 'Share this page')
    expect(await button.evaluate(el => el.tagName)).toBe('BUTTON')
    const status = page.locator('[data-share-status]')
    await expect(status).toHaveAttribute('aria-live', 'polite')
    await expect(status).toHaveText('')

    await button.click()
    await expect(status).toHaveText('Link copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/`)
    // Gone after 2 s.
    await expect(status).toHaveText('', { timeout: 4000 })
    expect(requests).toEqual([])
  })

  test('with the share sheet, the button calls navigator.share with the title and the address', async ({ page, baseURL }) => {
    test.skip(profile.site?.share === false, 'this profile turned the share button off')
    await page.addInitScript(() => {
      const calls: unknown[] = []
      Object.defineProperty(window, '__shared', { value: calls })
      Object.defineProperty(navigator, 'share', { value: async (data: unknown) => void calls.push(data), configurable: true })
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.locator(SHARE).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)).toEqual([{ title: await page.title(), url: `${baseURL}/` }])
    await expect(page.locator('[data-share-status]')).toHaveText('')
  })

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`the share button is a 44 px target inside the profile tile and clear of the theme toggle at ${viewport.width}`, async ({ page }) => {
      test.skip(profile.site?.share === false, 'this profile turned the share button off')
      await page.setViewportSize(viewport)
      await page.goto('/')
      await settle(page)
      const share = await page.locator(SHARE).boundingBox()
      const toggle = await page.locator(TOGGLE).boundingBox()
      const tile = await page.locator('ul[aria-label="Tiles"] > li').first().boundingBox()
      if (!share || !toggle || !tile) throw new Error('missing box')
      expect(share.width).toBeGreaterThanOrEqual(44)
      expect(share.height).toBeGreaterThanOrEqual(44)
      const overlap = share.x < toggle.x + toggle.width && toggle.x < share.x + share.width && share.y < toggle.y + toggle.height && toggle.y < share.y + share.height
      expect(overlap).toBe(false)
      // At least 8 px between the two targets.
      const gapX = Math.max(toggle.x - (share.x + share.width), share.x - (toggle.x + toggle.width))
      const gapY = Math.max(toggle.y - (share.y + share.height), share.y - (toggle.y + toggle.height))
      expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(8)
      expect(share.x).toBeGreaterThanOrEqual(tile.x)
      expect(share.x + share.width).toBeLessThanOrEqual(tile.x + tile.width)
      expect(share.y).toBeGreaterThanOrEqual(tile.y)
      // It covers neither the avatar nor the name.
      const header = 'ul[aria-label="Tiles"] > li:first-child > div'
      for (const selector of ['h1', `${header} > img, ${header} > div[aria-hidden="true"]`]) {
        const box = await page.locator(selector).first().boundingBox()
        if (!box) continue
        const hit = share.x < box.x + box.width && box.x < share.x + share.width && share.y < box.y + box.height && box.y < share.y + share.height
        expect(hit, selector).toBe(false)
      }
    })
  }

  test('the contact tile downloads the local vCard', async ({ page, request }) => {
    const contactBlocks = profile.blocks.filter(block => block.type === 'contact' && !block.hidden)
    if (!profileIsPersonal()) expect(contactBlocks.map(block => block.id)).toEqual(['b12'])
    test.skip(contactBlocks.length === 0 || profile.contact?.enabled !== true, 'this profile has no contact tile')
    await page.goto('/')
    const tile = page.locator('a[data-contact-tile]')
    await expect(tile).toHaveAttribute('href', '/site/contact.vcf')
    await expect(tile).toHaveAttribute('download', contactFileName(profile.contact?.fullName ?? profile.profile.name))
    await expect(tile).not.toHaveAttribute('target', '_blank')

    const response = await request.get('/site/contact.vcf')
    expect(response.status()).toBe(200)
    const card = await response.text()
    expect(card.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true)
    expect(card).not.toMatch(/PHOTO/i)
    if (!profile.profile.showEmail && profile.contact?.email !== profile.profile.email) expect(card).not.toContain(profile.profile.email)

    const [download] = await Promise.all([page.waitForEvent('download'), tile.click()])
    expect(download.suggestedFilename()).toBe(contactFileName(profile.contact?.fullName ?? profile.profile.name))
  })

  test('no qr tile and no qr file without a site URL (the example has none)', async ({ page, request }) => {
    test.skip(profileIsPersonal(), 'a personal profile may have a site URL')
    await page.goto('/')
    await expect(page.locator('[data-qr-tile]')).toHaveCount(0)
    expect((await request.get('/site/qr.svg')).status()).toBe(404)
  })
})
