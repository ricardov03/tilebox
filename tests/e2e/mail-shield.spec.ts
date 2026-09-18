/**
 * WP17, the email spam shield. No browser, no server, no network.
 * Part 1: the token helpers (`app/utils/mail-shield.ts`).
 * Part 2: the sanitizer. A profile with a shown email, a `mailto:` link tile and
 *         a social `email` tile gives a PUBLIC profile with no address and no
 *         `mailto:` string anywhere in it.
 * Part 3: the built site. No file of `dist/` holds `mailto:` or a sample address.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { siteAssetsIfPresent } from '../../content/site-files'
import { distDir, EXAMPLE_PROFILE_PATH, filesContaining, readProfile, ROOT, settle } from './helpers'
import {
  decodeEmail,
  encodeEmail,
  encodeMailto,
  humanEmail,
  isMailToken,
  isMailtoUrl,
  mailHref,
  MAILTO_PREFIX,
  MailShieldError,
  RAW_EMAIL_PATTERN,
} from '../../app/utils/mail-shield'
import {
  blockDropReason,
  incompleteReason,
  parseProfile,
  PublicProfileSchema,
  PublicProfileShapeSchema,
  toPublicProfile,
  type Profile,
} from '../../types/profile'
import { buildJsonLd, buildHead } from '../../app/utils/site-head'
import { linkTargets } from '../../content/link-check'

const NOW = new Date('2026-09-18T12:00:00Z')
const theme = { colors: 'condomera', fonts: 'geist', mode: 'system' } as const

test.describe('the token', () => {
  const ADDRESSES = [
    'hello@example.com',
    'a.b+tag@mail.example.co.uk',
    'UPPER.Case@Example.COM',
    'ada@sub.domain.example',
    'ricardo.vargas+tilebox@condomera.example',
    // Unicode in both parts, and an emoji: the reverse must work by code point.
    'añó@dominio.example',
    'ricardo🙂@example.com',
  ]

  test('every address round-trips, and the token holds no piece of it', () => {
    for (const address of ADDRESSES) {
      const token = encodeEmail(address)
      expect(decodeEmail(token), address).toBe(address)
      expect(mailHref(token), address).toBe(`mailto:${address}`)
      const json = JSON.stringify(token)
      expect(json, address).not.toContain('@')
      expect(json.toLowerCase(), address).not.toContain('mailto')
      // No part of the address, in either direction: the parts are reversed BEFORE base64.
      const [local, domain] = address.split('@')
      expect(json, address).not.toContain(local ?? '')
      expect(json, address).not.toContain(domain ?? '')
      expect(RAW_EMAIL_PATTERN.test(json), address).toBe(false)
    }
  })

  test('a subject query rides in `q` and comes back on the href', () => {
    const token = encodeEmail('hello@example.com', { subject: 'Hello from your page' })
    expect(token.q).toBeTruthy()
    expect(JSON.stringify(token)).not.toContain('subject')
    expect(mailHref(token)).toBe('mailto:hello@example.com?subject=Hello+from+your+page')
    expect(decodeEmail(token)).toBe('hello@example.com')
    // An empty value is no query at all.
    expect(encodeEmail('hello@example.com', { subject: '' }).q).toBeUndefined()
    expect(encodeEmail('hello@example.com').q).toBeUndefined()
  })

  test('the human form reads out loud and matches no harvester pattern', () => {
    expect(humanEmail(encodeEmail('hello@example.com'))).toBe('hello at example dot com')
    expect(humanEmail(encodeEmail('a.b+tag@mail.example.co.uk'))).toBe('a dot b+tag at mail dot example dot co dot uk')
    for (const address of ADDRESSES) {
      const human = humanEmail(encodeEmail(address))
      expect(human, address).not.toContain('@')
      expect(RAW_EMAIL_PATTERN.test(human), address).toBe(false)
    }
  })

  test('`mailto:` URLs become tokens, with and without a query', () => {
    expect(mailHref(encodeMailto('mailto:hello@example.com') ?? { u: '', d: '' })).toBe('mailto:hello@example.com')
    const withQuery = encodeMailto('mailto:hello@example.com?subject=Hi%20there&body=Hello')
    expect(withQuery?.q).toBeTruthy()
    expect(mailHref(withQuery ?? { u: '', d: '' })).toBe('mailto:hello@example.com?subject=Hi%20there&body=Hello')
    // A percent-encoded address is read too.
    expect(decodeEmail(encodeMailto('mailto:hello%40example.com') ?? { u: '', d: '' })).toBe('hello@example.com')
  })

  test('invalid input: `encodeEmail` throws, `encodeMailto` answers null, `decodeEmail` throws', () => {
    for (const bad of ['', '   ', 'nope', '@example.com', 'ada@', 'ada@example', 'a b@example.com', 'a@b@example.com', 'ada@.com', 'ada@example.']) {
      expect(() => encodeEmail(bad), bad).toThrow(MailShieldError)
    }
    for (const bad of ['https://example.com', 'mailto:', 'mailto:nope', 'mailto:?subject=Hi', 'tel:+1202', 'MAILTO:a@b']) {
      expect(encodeMailto(bad), bad).toBeNull()
    }
    // A scheme in any case is still a mail URL.
    expect(encodeMailto('MAILTO:ada@example.com')).not.toBeNull()

    expect(() => decodeEmail({ u: '', d: '' })).toThrow(MailShieldError)
    expect(() => decodeEmail({ u: 'not base64!', d: 'x' })).toThrow(MailShieldError)
    expect(() => decodeEmail({ u: 'A', d: 'B' })).toThrow(MailShieldError)
    expect(isMailToken(null)).toBe(false)
    expect(isMailToken({ u: 'a' })).toBe(false)
    expect(isMailToken({ u: 'a', d: 'b', q: 3 })).toBe(false)
    expect(isMailToken({ u: 'a', d: 'b' })).toBe(true)
  })

  test('the scheme constant is the real scheme, although the literal is in no bundled source', () => {
    expect(MAILTO_PREFIX).toBe(['m', 'a', 'i', 'l', 't', 'o', ':'].join(''))
    expect(isMailtoUrl(`${MAILTO_PREFIX}a@b.co`)).toBe(true)
    expect(isMailtoUrl('https://a.example')).toBe(false)
  })

  test('the harvester pattern finds a real address and leaves a URL path alone', () => {
    expect(RAW_EMAIL_PATTERN.test('write to hello@example.com please')).toBe(true)
    expect(RAW_EMAIL_PATTERN.test('"hello@example.com"')).toBe(true)
    expect(RAW_EMAIL_PATTERN.test('mailto:hello@example.com')).toBe(true)
    expect(RAW_EMAIL_PATTERN.test('https://mastodon.social/@ada')).toBe(false)
    expect(RAW_EMAIL_PATTERN.test('https://example.com/path@sub.domain.com/x')).toBe(false)
    expect(RAW_EMAIL_PATTERN.test('hello at example dot com')).toBe(false)
  })
})

test.describe('the sanitizer', () => {
  /** A fixture with all three ways an address can enter a page. */
  const FIXTURE: Profile = {
    profile: {
      name: 'Ada Lovelace',
      handle: 'ada',
      bio: 'Maths and machines.',
      highlights: [],
      email: 'ada@shield.example',
      showEmail: true,
      theme,
    },
    blocks: [
      { id: 'mail', type: 'link', size: '1x1', title: 'Say hello', url: 'mailto:ada@shield.example?subject=Hi' },
      { id: 'social', type: 'social', size: '1x1', network: 'email', url: 'mailto:ada@shield.example' },
      { id: 'web', type: 'link', size: '1x1', title: 'Site', url: 'https://shield.example/' },
      { id: 'broken', type: 'link', size: '1x1', title: 'Not an address', url: 'mailto:nope' },
    ],
    layout: { desktop: ['mail', 'social', 'web', 'broken'] },
  }

  const publicProfile = toPublicProfile(FIXTURE, undefined, undefined, { now: NOW })

  test('no address and no `mailto:` string reaches the public profile', () => {
    const json = JSON.stringify(publicProfile)
    expect(json).not.toMatch(/mailto:/i)
    expect(json).not.toContain('ada@shield.example')
    expect(RAW_EMAIL_PATTERN.test(json)).toBe(false)
    expect(PublicProfileSchema.safeParse(publicProfile).success).toBe(true)
  })

  test('the profile line carries `emailToken`, and the token decodes to the address', () => {
    const info = publicProfile.profile
    expect('email' in info).toBe(false)
    expect(info.emailToken).toBeTruthy()
    expect(info.emailToken && decodeEmail(info.emailToken)).toBe('ada@shield.example')
    expect(info.emailToken && humanEmail(info.emailToken)).toBe('ada at shield dot example')
    // `showEmail: false` = no token at all.
    const hidden = toPublicProfile({ ...FIXTURE, profile: { ...FIXTURE.profile, showEmail: false } }, undefined, undefined, { now: NOW })
    expect(hidden.profile.emailToken).toBeUndefined()
  })

  test('a mail tile keeps its token, loses its `url` key, and keeps the subject', () => {
    const mail = publicProfile.blocks.find(block => block.id === 'mail')
    expect(mail && 'url' in mail).toBe(false)
    const token = mail && 'mail' in mail ? mail.mail : undefined
    expect(token && mailHref(token)).toBe('mailto:ada@shield.example?subject=Hi')

    const social = publicProfile.blocks.find(block => block.id === 'social')
    expect(social && 'url' in social).toBe(false)
    expect(social && 'mail' in social ? social.mail : undefined).toBeTruthy()

    // An http(s) tile is untouched.
    expect(publicProfile.blocks.find(block => block.id === 'web')).toMatchObject({ url: 'https://shield.example/' })
  })

  test('a `mailto:` that is not an address is INCOMPLETE: the build leaves that tile out', () => {
    const broken = FIXTURE.blocks.find(block => block.id === 'broken')
    expect(broken && incompleteReason(broken)).toBe('add a URL')
    expect(broken && blockDropReason(broken, NOW)).toBe('incomplete')
    expect(publicProfile.blocks.map(block => block.id)).toEqual(['mail', 'social', 'web'])
    expect(publicProfile.layout.desktop).toEqual(['mail', 'social', 'web'])
    // A tile with a token alone is complete: the token IS the target.
    expect(incompleteReason({ id: 'x', type: 'link', size: '1x1', mail: { u: 'YWRh', d: 'eA' } })).toBeNull()
  })

  test('UTM tags never touch a mail token, and the head carries no address', () => {
    const tagged = toPublicProfile(
      { ...FIXTURE, site: { utm: { source: 'tilebox', medium: 'profile' } } },
      undefined,
      undefined,
      { now: NOW },
    )
    const mail = tagged.blocks.find(block => block.id === 'mail')
    expect(mail && 'url' in mail).toBe(false)
    // Nothing was tagged on the mail tile: its token is the same as without any UTM settings.
    expect(JSON.stringify(mail)).not.toContain('utm')
    expect(mail && 'mail' in mail ? mailHref(mail.mail ?? { u: '', d: '' }) : '').toBe('mailto:ada@shield.example?subject=Hi')
    // An http(s) tile still gets its tags.
    expect(tagged.blocks.find(block => block.id === 'web')).toMatchObject({ url: expect.stringContaining('utm_source=tilebox') })

    const jsonLd = JSON.stringify(buildJsonLd(publicProfile, 'https://shield.example'))
    expect(jsonLd).not.toContain('email')
    expect(RAW_EMAIL_PATTERN.test(jsonLd)).toBe(false)
    const head = JSON.stringify(buildHead(publicProfile, 'https://shield.example'))
    expect(head).not.toMatch(/mailto:/i)
    expect(RAW_EMAIL_PATTERN.test(head)).toBe(false)
  })

  test('`check:links` never asks a mail target', () => {
    expect(linkTargets(FIXTURE).map(target => target.url)).toEqual(['https://shield.example/'])
  })

  test('WP20: the page loads the SHAPE, so an address in the bio never breaks the build', () => {
    // `check:profile` calls the guard a WARNING and exits 0 (an address in a bio must not stop a build).
    // So the schema the PAGE parses must not carry the guard: `useProfile()` ran `PublicProfileSchema.parse`
    // at module scope, and `npm run generate` then died with "Exiting due to prerender errors".
    const withAddress = { ...publicProfile, profile: { ...publicProfile.profile, bio: 'Write to ada@shield.example' } }
    expect(PublicProfileSchema.safeParse(withAddress).success).toBe(false)
    expect(() => PublicProfileShapeSchema.parse(withAddress)).not.toThrow()
    // And that is really the schema the page uses.
    const source = readFileSync(resolve(ROOT, 'app/composables/useProfile.ts'), 'utf8')
    expect(source).toContain('PublicProfileShapeSchema.parse')
    expect(source).not.toContain('PublicProfileSchema.parse')
  })

  test('the guard refuses a public profile that carries an address or `mailto:`', () => {
    const withAddress = { ...publicProfile, profile: { ...publicProfile.profile, bio: 'Write to ada@shield.example' } }
    expect(PublicProfileSchema.safeParse(withAddress).success).toBe(false)
    const withMailto = {
      ...publicProfile,
      blocks: [...publicProfile.blocks, { id: 'raw', type: 'link' as const, size: '1x1' as const, url: 'mailto:ada@shield.example' }],
      layout: { desktop: [...publicProfile.layout.desktop, 'raw'] },
    }
    expect(PublicProfileSchema.safeParse(withMailto).success).toBe(false)
  })
})

test.describe('the built site', () => {
  /** Every address of the sample profile: none of them may be in `dist/`. */
  function sampleAddresses(): string[] {
    const example = parseProfile(JSON.parse(readFileSync(EXAMPLE_PROFILE_PATH, 'utf8')))
    const found = new Set<string>()
    if (example.profile.email) found.add(example.profile.email)
    if (example.contact?.email) found.add(example.contact.email)
    for (const block of example.blocks) {
      if ('url' in block && block.url && block.url.toLowerCase().startsWith('mailto:')) {
        const address = block.url.slice('mailto:'.length).split('?')[0]
        if (address) found.add(address)
      }
    }
    expect(found.size).toBeGreaterThan(0)
    return [...found]
  }

  test('no file of dist/ holds the string `mailto:`', () => {
    expect(filesContaining(distDir(), 'mailto:')).toEqual([])
    expect(filesContaining(distDir(), 'MAILTO:')).toEqual([])
  })

  test('no file of dist/ holds a sample address', () => {
    for (const address of sampleAddresses()) {
      expect(filesContaining(distDir(), address), address).toEqual([])
    }
  })

  test('the mail tile is still on the page, as a button with no address', () => {
    const html = readFileSync(`${distDir()}/index.html`, 'utf8')
    expect(html).toContain('Say hello')
    expect(html).not.toMatch(/mailto/i)
  })
})

/* ---------- the page in a browser ---------- */

const TILES = 'ul[aria-label="Tiles"] > li'

/** The first mail tile the build ships, and the `mailto:` URL it must end up with. */
function mailTile(): { title: string, href: string } | null {
  const profile = readProfile()
  const assets = siteAssetsIfPresent(resolve(ROOT, 'dist/site'))
  const block = profile.blocks.find(item =>
    item.type === 'link' && item.url?.toLowerCase().startsWith('mailto:') && blockDropReason(item, new Date(), assets) === null,
  )
  if (!block || block.type !== 'link' || !block.url || !block.title) return null
  return { title: block.title, href: block.url }
}

/**
 * `useHumanSignal` arms its listeners in `onMounted`, so a pointer event a test
 * sends BEFORE hydration is simply missed. A real visitor sends a stream of them
 * and never notices; a test sends exactly one, and the tile would stay a button
 * for ever (WP19 saw this as a flake in the full run, 1 in 6). `#__nuxt._vnode`
 * is set by `app.mount()`, so it is true only once Vue has taken over.
 */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!(document.getElementById('__nuxt') as unknown as { _vnode?: unknown } | null)?._vnode,
    undefined,
    { timeout: 15_000 },
  )
}

test.describe('the mail tile in a browser', () => {
  test('before any interaction it is a button, and the DOM holds no address', async ({ page }) => {
    const tile = mailTile()
    test.skip(tile === null, 'this profile has no mailto: tile')
    if (!tile) return
    await page.goto('/')
    const control = page.locator(`${TILES} [data-protected-email]`).first()
    await expect(control).toHaveAttribute('data-protected-email', 'button')
    expect(await control.evaluate(el => el.tagName)).toBe('BUTTON')
    expect(await control.getAttribute('href')).toBeNull()
    await expect(control).toContainText(tile.title)
    // Nothing in the live DOM, and nothing in the file that was served.
    const address = tile.href.replace(/^mailto:/i, '').split('?')[0] ?? ''
    expect(await page.content()).not.toMatch(/mailto:/i)
    expect(await page.content()).not.toContain(address)
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0)
  })

  test('one mouse move upgrades it to a real mailto: link, with the same accessible name', async ({ page }) => {
    const tile = mailTile()
    test.skip(tile === null, 'this profile has no mailto: tile')
    if (!tile) return
    await page.goto('/')
    await hydrated(page)
    const control = page.locator(`${TILES} [data-protected-email]`).first()
    const before = (await control.textContent())?.trim()

    await page.mouse.move(40, 40)
    await expect(control).toHaveAttribute('data-protected-email', 'link')
    await expect(control).toHaveAttribute('href', tile.href)
    expect(await control.evaluate(el => el.tagName)).toBe('A')
    // A tile is named by its own text: it must not change.
    expect((await control.textContent())?.trim()).toBe(before)
    await expect(control).not.toHaveAttribute('target', '_blank')
  })

  test('the focus survives the swap, and a key press is a human signal too', async ({ page }) => {
    test.skip(mailTile() === null, 'this profile has no mailto: tile')
    await page.goto('/')
    await hydrated(page)
    const control = page.locator(`${TILES} [data-protected-email]`).first()
    await control.focus()
    await expect(control).toBeFocused()
    // A key is a signal. The <button> becomes an <a>, and the focus follows.
    await page.keyboard.press('Shift')
    await expect(control).toHaveAttribute('data-protected-email', 'link')
    await expect(control).toBeFocused()
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('A')
  })

  test('a click before the upgrade opens the mail client on its own', async ({ page }) => {
    const tile = mailTile()
    test.skip(tile === null, 'this profile has no mailto: tile')
    if (!tile) return
    // `location` cannot be replaced (its members are unforgeable), `window.open` can.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'open', {
        configurable: true,
        writable: true,
        value: (url?: string | URL) => {
          Object.assign(window, { __opened: String(url ?? '') })
          return window
        },
      })
    })
    await page.goto('/')
    const control = page.locator(`${TILES} [data-protected-email]`).first()
    await expect(control).toHaveAttribute('data-protected-email', 'button')
    // A dispatched click carries no pointer event, so nothing upgraded first.
    await control.dispatchEvent('click')
    expect(await page.evaluate(() => (window as unknown as { __opened?: string }).__opened)).toBe(tile.href)
  })

  test('no axe violation after the upgrade, and no request leaves this site', async ({ page, baseURL }) => {
    test.skip(mailTile() === null, 'this profile has no mailto: tile')
    const foreign: string[] = []
    page.on('request', (request) => {
      if (!request.url().startsWith(baseURL ?? '') && !request.url().startsWith('data:')) foreign.push(request.url())
    })
    await page.goto('/')
    await hydrated(page)
    await page.mouse.move(40, 40)
    await expect(page.locator(`${TILES} [data-protected-email]`).first()).toHaveAttribute('data-protected-email', 'link')
    await settle(page)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()
    expect(results.violations.map(v => `${v.impact}: ${v.id} ${v.help}`).join('\n')).toBe('')
    expect(foreign).toEqual([])
  })
})

test.describe('the mail tile without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the human form is readable and no address is on the page', async ({ page }) => {
    const tile = mailTile()
    test.skip(tile === null, 'this profile has no mailto: tile')
    if (!tile) return
    await page.goto('/')
    const address = tile.href.replace(/^mailto:/i, '').split('?')[0] ?? ''
    const control = page.locator(`${TILES} [data-protected-email]`).first()
    await expect(control).toHaveAttribute('data-protected-email', 'button')
    await expect(control).toContainText(address.replace(/@/g, ' at ').replace(/\./g, ' dot '))
    expect(await page.content()).not.toMatch(/mailto:/i)
    expect(await page.content()).not.toContain(address)
  })
})
