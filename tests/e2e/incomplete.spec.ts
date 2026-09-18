/**
 * WP17, "empty fields never block". No browser, no server.
 * Every text of a block is optional in the file. A block without its ESSENTIAL value is
 * "incomplete": it is valid, it saves, and the build leaves it out like a hidden block.
 */
import { expect, test } from '@playwright/test'
import { linkTargets } from '../../content/link-check'
import { linkNeedsFetch } from '../../content/unfurl-cache'
import { buildHead, defaultSiteTitle, siteDescription } from '../../app/utils/site-head'
import { resolveLinkIcon } from '../../app/components/blocks/media'
import {
  BlockSchema,
  blockDropReason,
  incompleteMessage,
  incompleteReason,
  ProfileSchema,
  PublicProfileSchema,
  toPublicProfile,
  type Block,
  type Profile,
} from '../../types/profile'

const NOW = new Date('2026-09-18T12:00:00Z')
const theme = { colors: 'condomera', fonts: 'geist', mode: 'system' } as const

/** One row per block type: the block without its essential value, the reason, and the value that completes it. */
const MATRIX: { empty: Block, reason: string, complete: Block }[] = [
  { empty: { id: 'a', type: 'link', size: '1x1' }, reason: 'add a URL', complete: { id: 'a', type: 'link', size: '1x1', url: 'https://example.com' } },
  { empty: { id: 'a', type: 'link', size: '1x1', title: 'A title alone is not enough' }, reason: 'add a URL', complete: { id: 'a', type: 'link', size: '1x1', url: 'mailto:someone@tilebox.test' } },
  { empty: { id: 'a', type: 'social', size: '1x1', network: 'github' }, reason: 'add a URL', complete: { id: 'a', type: 'social', size: '1x1', network: 'github', url: 'https://github.com/x' } },
  { empty: { id: 'a', type: 'map', size: '1x1', label: 'Bogota' }, reason: 'add a map URL', complete: { id: 'a', type: 'map', size: '1x1', url: 'https://maps.google.com/?q=Bogota' } },
  { empty: { id: 'a', type: 'video', size: '2x1', title: 'A talk' }, reason: 'add a video URL', complete: { id: 'a', type: 'video', size: '2x1', url: 'https://youtu.be/dQw4w9WgXcQ' } },
  { empty: { id: 'a', type: 'image', size: '2x2', alt: 'An alt alone', source: null }, reason: 'add an image', complete: { id: 'a', type: 'image', size: '2x2', src: '/blocks/sample.jpg', source: null } },
  { empty: { id: 'a', type: 'text', size: '1x2', title: 'Now' }, reason: 'add some text', complete: { id: 'a', type: 'text', size: '1x2', body: 'Text.' } },
  { empty: { id: 'a', type: 'text', size: '1x2', body: '  \n ' }, reason: 'add some text', complete: { id: 'a', type: 'text', size: '1x2', body: 'x' } },
  { empty: { id: 'a', type: 'section' }, reason: 'add a title', complete: { id: 'a', type: 'section', title: 'Projects' } },
]

test('the matrix: every emptied block is VALID, is "incomplete" with a human reason, and is complete with its essential value alone', () => {
  for (const row of MATRIX) {
    const name = `${row.empty.type} ${JSON.stringify(row.empty)}`
    expect(BlockSchema.safeParse(row.empty).success, name).toBe(true)
    expect(incompleteReason(row.empty), name).toBe(row.reason)
    expect(incompleteMessage(row.empty), name).toBe(`Incomplete: ${row.reason}`)
    expect(blockDropReason(row.empty, NOW), name).toBe('incomplete')
    expect(BlockSchema.safeParse(row.complete).success, name).toBe(true)
    expect(incompleteReason(row.complete), name).toBeNull()
    expect(blockDropReason(row.complete, NOW), name).toBeNull()
  }
})

test('contact and qr tiles have no essential text; hidden wins over incomplete; the schedule comes after it', () => {
  expect(incompleteReason({ id: 'c', type: 'contact', size: '1x1' })).toBeNull()
  expect(incompleteReason({ id: 'q', type: 'qr', size: '1x1' })).toBeNull()
  expect(blockDropReason({ id: 'a', type: 'link', size: '1x1', hidden: true }, NOW)).toBe('hidden')
  expect(blockDropReason({ id: 'a', type: 'link', size: '1x1', startsAt: '2099-01-01T00:00:00Z' }, NOW)).toBe('incomplete')
})

test('an empty string is still refused where the file never had one: the editor REMOVES the key', () => {
  expect(BlockSchema.safeParse({ id: 'a', type: 'link', size: '1x1', title: '', url: 'https://example.com' }).success).toBe(false)
  expect(BlockSchema.safeParse({ id: 'a', type: 'link', size: '1x1', url: '' }).success).toBe(false)
  expect(BlockSchema.safeParse({ id: 'a', type: 'link', size: '1x1', url: 'not a url' }).success).toBe(false)
})

test('the profile: only `name` is needed; handle, bio and email may be absent; an empty name is refused', () => {
  const minimal = { profile: { name: 'Ada', theme }, blocks: [], layout: { desktop: [] } }
  const parsed = ProfileSchema.safeParse(minimal)
  expect(parsed.success).toBe(true)
  if (!parsed.success) return
  expect(parsed.data.profile).toEqual({ name: 'Ada', highlights: [], showEmail: false, theme })
  expect(ProfileSchema.safeParse({ ...minimal, profile: { name: '', theme } }).success).toBe(false)
  expect(ProfileSchema.safeParse({ ...minimal, profile: { name: 'Ada', email: 'nope', theme } }).success).toBe(false)
  // An old profile (every text there, an empty bio) is still valid.
  expect(ProfileSchema.safeParse({ ...minimal, profile: { name: 'Ada', handle: 'ada', bio: '', email: 'ada@tilebox.test', theme } }).success).toBe(true)
})

test('toPublicProfile of an all-empty profile does not throw and yields zero tiles', () => {
  const blocks = MATRIX.map((row, index): Block => ({ ...row.empty, id: `e${index}` }))
  const ids = blocks.map(block => block.id)
  const input: Profile = {
    profile: { name: 'Ada', highlights: [], showEmail: true, theme },
    blocks,
    layout: { desktop: ids, mobile: [...ids].reverse() },
  }
  expect(ProfileSchema.safeParse(input).success).toBe(true)
  const result = toPublicProfile(input, undefined, undefined, { now: NOW })
  expect(result.blocks).toEqual([])
  expect(result.layout).toEqual({ desktop: [], mobile: [] })
  // `showEmail` without an email is harmless: no email line.
  expect(JSON.stringify(result.profile)).not.toContain('mail')
  expect(PublicProfileSchema.safeParse(result).success).toBe(true)
  // The title of an incomplete block is not on the page either.
  expect(JSON.stringify(result)).not.toContain('A title alone is not enough')
})

test('the head, the icon, the link check and the link preview take a profile without handle, bio and URLs', () => {
  const input: Profile = {
    profile: { name: 'Ada Lovelace', highlights: [], showEmail: false, theme },
    blocks: [{ id: 'a', type: 'link', size: '1x1', enrich: true }, { id: 's', type: 'social', size: '1x1', network: 'github' }],
    layout: { desktop: ['a', 's'] },
  }
  expect(defaultSiteTitle(input.profile)).toBe('Ada Lovelace')
  expect(siteDescription(input.profile)).toBe('')
  const head = buildHead(toPublicProfile(input, undefined, undefined, { now: NOW }))
  expect(head.title).toBe('Ada Lovelace')
  expect(head.meta.some(meta => meta.name === 'description')).toBe(false)
  expect(head.script[0]?.innerHTML).not.toContain('alternateName')
  expect(resolveLinkIcon({})).toEqual({ kind: 'icon', name: 'line-md:link', source: 'fallback' })
  expect(linkTargets(input)).toEqual([])
  const [link] = input.blocks
  expect(link?.type === 'link' && linkNeedsFetch(link)).toBe(false)
})
