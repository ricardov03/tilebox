/**
 * Email privacy. No browser.
 * 1. The built site: with `showEmail: false` the email is in no text file of
 *    `dist/` (HTML, payload JSON, JS chunks, CSS). Run `npm run generate` first.
 * 2. The sanitizer itself (`toPublicProfile` in types/profile.ts), unit-checked.
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { profileIsPersonal, readProfile, ROOT } from './helpers'
import { toPublicProfile, type Profile } from '../../types/profile'

const EXAMPLE_EMAIL = 'hello@example.com'
const TEXT_EXTENSIONS = new Set(['.html', '.json', '.js', '.mjs', '.css', '.txt', '.xml', '.svg', '.map', '.webmanifest'])

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
    expect(filesContaining(distDir(), profile.profile.email)).toEqual([])
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
    expect(toPublicProfile(withInfo({ avatar: '/avatar.png' }), '/avatar.gravatar.jpg').profile.avatar).toBe('/avatar.png')
    expect(toPublicProfile(withInfo({ avatar: null }), '/avatar.gravatar.jpg').profile.avatar).toBe('/avatar.gravatar.jpg')
    expect(toPublicProfile(base, '/avatar.gravatar.jpg').profile.avatar).toBe('/avatar.gravatar.jpg')
    expect('avatar' in toPublicProfile(withInfo({ avatar: null })).profile).toBe(false)
  })

  test('does not change its input', () => {
    const input = withInfo({ showEmail: false })
    const before = JSON.stringify(input)
    toPublicProfile(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})
