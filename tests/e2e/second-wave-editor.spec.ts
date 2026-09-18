/**
 * WP11 in the local editor, on `nuxt dev`. Writes content/profile.json and
 * `public/site/{contact.vcf,qr.svg}`, so this project runs locally only. The
 * profile is backed up first and restored at the end, and the two files are
 * made again from the restored profile. "Check links" is mocked in the UI test:
 * no test here reaches the network.
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import sharp from 'sharp'
import { localInputToIso } from '../../app/utils/schedule'
import { buildSiteExtras } from '../../content/site-extras'
import { contactFileName } from '../../types/profile'
import { PERSONAL_PROFILE_PATH as PROFILE_PATH, readProfile, ROOT } from './helpers'

const BACKUP = `${PROFILE_PATH}.e2e-wave-backup`
const SITE_DIR = resolve(ROOT, 'public/site')

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  copyFileSync(PROFILE_PATH, BACKUP)
})

test.afterAll(async () => {
  if (existsSync(BACKUP)) {
    writeFileSync(PROFILE_PATH, readFileSync(BACKUP))
    rmSync(BACKUP)
  }
  // The saves above rewrote the contact card and the QR code: make them again from the restored profile.
  await buildSiteExtras({ profile: readProfile(), envSiteUrl: process.env.NUXT_PUBLIC_SITE_URL })
})

async function openEditor(page: Page): Promise<void> {
  await page.goto('/edit')
  await page.locator('li[data-id]').first().waitFor({ timeout: 60_000 })
}

async function openSiteTab(page: Page): Promise<void> {
  await openEditor(page)
  await page.getByRole('tab', { name: 'Site' }).click()
  await expect(page.locator('#panel-site')).toBeVisible()
}

async function openBlock(page: Page, id: string): Promise<void> {
  await openEditor(page)
  await page.getByRole('tab', { name: 'Blocks' }).click()
  const back = page.getByRole('button', { name: '← All blocks' })
  if (await back.isVisible()) await back.click()
  await page.locator(`[data-select-block="${id}"]`).click()
  await expect(page.locator('[data-block-advanced]')).toBeVisible()
}

async function save(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
}

const firstLink = () => {
  const block = readProfile().blocks.find(item => item.type === 'link' && !item.hidden && !item.startsAt && !item.endsAt)
  if (!block) throw new Error('the profile has no plain link block')
  return block
}

test('schedule: the two inputs round-trip to ISO with this machine\'s offset, a bad range is refused, Clear removes the keys', async ({ page }) => {
  const block = firstLink()
  await openBlock(page, block.id)
  const advanced = page.locator('[data-block-advanced]')
  const badge = advanced.locator('[data-schedule-badge]')
  const start = advanced.locator('[data-schedule-input="startsAt"]')
  const end = advanced.locator('[data-schedule-input="endsAt"]')
  await expect(badge).toHaveText('Live')
  await expect(advanced).toContainText('publish again after that time')

  await start.fill('2099-05-01T10:30')
  await expect(badge).toHaveAttribute('data-schedule-state', 'scheduled')
  await expect(badge).toContainText('Scheduled from')

  // An end before the start: an error, and the draft keeps the last good value.
  await end.fill('2099-04-01T10:30')
  await expect(advanced.locator('[data-schedule-error]')).toContainText('endsAt must be after startsAt')
  await end.fill('2099-06-01T18:00')
  await expect(advanced.locator('[data-schedule-error]')).toHaveCount(0)

  // The clock badge on the preview tile.
  await expect(page.locator(`li[data-id="${block.id}"] [data-schedule-row-badge]`)).toHaveText('Scheduled')
  await advanced.locator('[data-no-utm]').check()
  await save(page)

  const saved = readProfile().blocks.find(item => item.id === block.id)
  expect(saved?.startsAt).toBe(localInputToIso('2099-05-01T10:30'))
  expect(saved?.endsAt).toBe(localInputToIso('2099-06-01T18:00'))
  expect(saved?.startsAt).toMatch(/^2099-05-01T10:30:00[+-]\d{2}:\d{2}$/)
  expect(saved && 'noUtm' in saved ? saved.noUtm : undefined).toBe(true)

  // A fresh load shows the same local times, and the list row has the badge.
  await openEditor(page)
  await page.getByRole('tab', { name: 'Blocks' }).click()
  const back = page.getByRole('button', { name: '← All blocks' })
  if (await back.isVisible()) await back.click()
  const row = page.locator('ol > li', { has: page.locator(`[data-select-block="${block.id}"]`) })
  await expect(row.locator('[data-schedule-row-badge]')).toHaveText('Scheduled')
  await page.locator(`[data-select-block="${block.id}"]`).click()
  await expect(start).toHaveValue('2099-05-01T10:30')
  await expect(end).toHaveValue('2099-06-01T18:00')

  // The dev page follows the saved file: the scheduled block is not on it.
  await page.goto('/')
  await expect(page.locator('ul[aria-label="Tiles"]')).toBeVisible()
  await expect(page.locator(`ul[aria-label="Tiles"] a[href^="${block.type === 'link' ? block.url : ''}"]`)).toHaveCount(0)

  // Clear both: the keys leave the file.
  await openBlock(page, block.id)
  await advanced.locator('[data-schedule-clear="startsAt"]').click()
  await advanced.locator('[data-schedule-clear="endsAt"]').click()
  await expect(badge).toHaveText('Live')
  await advanced.locator('[data-no-utm]').uncheck()
  await save(page)
  const cleared = readProfile().blocks.find(item => item.id === block.id)
  expect(cleared).toEqual(block)
})

test('an end date in the past shows Expired', async ({ page }) => {
  const block = firstLink()
  await openBlock(page, block.id)
  const advanced = page.locator('[data-block-advanced]')
  await advanced.locator('[data-schedule-input="endsAt"]').fill('2020-01-01T00:00')
  await expect(advanced.locator('[data-schedule-badge]')).toHaveText('Expired')
  await expect(page.locator(`li[data-id="${block.id}"] [data-schedule-row-badge]`)).toHaveText('Expired')
  // Not saved: the next test loads the file again.
})

test('contact panel: says that everything is public, refuses a bad email, saves, and the card follows the save', async ({ page }) => {
  const before = readProfile()
  await openSiteTab(page)
  const panel = page.locator('[data-contact-panel]')
  await expect(panel.locator('[data-contact-public-note]')).toContainText('Everything here is public')
  await expect(panel.getByLabel('Full name')).toHaveAttribute('placeholder', before.profile.name)

  await panel.getByLabel('Make the contact card').check()
  await panel.getByLabel('Full name').fill('Ada Lovelace')
  await panel.getByLabel('Company').fill('Analytical Engines, Ltd.')
  await panel.getByLabel('Role').fill('Mathematician')
  await panel.getByLabel('Phone').fill('+44 20 7946 0000')
  // The fields are `EditorTextField`: the check runs on blur, the reason shows under the field and in the save bar.
  await panel.getByLabel('Public email').fill('not-an-email')
  await panel.getByLabel('Public email').blur()
  await expect(panel.locator('[data-field-error]')).toHaveCount(1)
  await expect(panel.getByRole('alert')).toBeVisible()
  await expect(page.locator('[data-field-problems]')).toContainText('Site > Contact card, Public email')
  await panel.getByLabel('Public email').fill('ada.public@a.example')
  await panel.getByLabel('Public email').blur()
  await expect(panel.locator('[data-field-error]')).toHaveCount(0)
  await expect(page.locator('[data-field-problems]')).toHaveCount(0)
  await panel.getByLabel('Website').fill('https://ada.example')
  await panel.getByLabel('Note').fill('Met at the engine fair.')
  await panel.getByLabel('Note').blur()

  // The preview is the text the build writes, made from the draft.
  const href = await panel.locator('[data-contact-preview]').getAttribute('href')
  const preview = decodeURIComponent((href ?? '').replace('data:text/vcard;charset=utf-8,', ''))
  expect(preview).toContain('FN:Ada Lovelace\r\n')
  expect(preview).toContain('ORG:Analytical Engines\\, Ltd.\r\n')
  expect(preview).not.toContain(before.profile.email)
  await expect(panel.locator('[data-contact-preview]')).toHaveAttribute('download', 'ada-lovelace.vcf')

  await save(page)
  expect(readProfile().contact).toEqual({
    enabled: true,
    fullName: 'Ada Lovelace',
    org: 'Analytical Engines, Ltd.',
    title: 'Mathematician',
    phone: '+44 20 7946 0000',
    email: 'ada.public@a.example',
    url: 'https://ada.example',
    note: 'Met at the engine fair.',
  })
  // The save route made the card again (no network): the dev page never links to a stale file.
  const card = readFileSync(resolve(SITE_DIR, 'contact.vcf'), 'utf8')
  expect(card).toContain('FN:Ada Lovelace\r\n')
  expect(card).not.toContain(before.profile.email)

  // Off again: the key leaves the file, the card leaves the disk.
  await openSiteTab(page)
  await panel.getByLabel('Make the contact card').uncheck()
  await save(page)
  expect(readProfile().contact?.enabled).toBeUndefined()
  expect(existsSync(resolve(SITE_DIR, 'contact.vcf'))).toBe(false)
})

test('UTM panel: the example follows the checked fields, a bad value is refused, the tags are saved', async ({ page }) => {
  await openSiteTab(page)
  const panel = page.locator('[data-utm-panel]')
  const example = panel.locator('[data-utm-example]')
  await expect(example).not.toContainText('utm_')

  await panel.getByLabel('Source (utm_source)').fill('tilebox')
  await expect(panel.locator('[data-utm-incomplete]')).toBeVisible()
  await expect(example).not.toContainText('utm_')
  await panel.getByLabel('Medium (utm_medium)').fill('profile')
  await expect(example).toContainText('utm_source=tilebox&utm_medium=profile')
  // A refused value never reaches the draft: the example keeps the last checked tags, and the save bar names the field.
  await panel.getByLabel('Campaign (utm_campaign), optional').fill('Spring 2027')
  await panel.getByLabel('Campaign (utm_campaign), optional').blur()
  await expect(panel.locator('[data-field-error]')).toContainText('lowercase')
  await expect(page.locator('[data-field-problems]')).toContainText('Campaign')
  await expect(example).toContainText('utm_source=tilebox&utm_medium=profile')
  await expect(example).not.toContainText('utm_campaign')
  await panel.getByLabel('Campaign (utm_campaign), optional').fill('spring-2027')
  await expect(example).toContainText('utm_source=tilebox&utm_medium=profile&utm_campaign=spring-2027')

  await save(page)
  expect(readProfile().site?.utm).toEqual({ source: 'tilebox', medium: 'profile', campaign: 'spring-2027' })
  // The stored links stay clean; the dev page gets the tagged ones.
  expect(JSON.stringify(readProfile().blocks)).not.toContain('utm_source')
  const block = firstLink()
  await page.goto('/')
  await expect(page.locator('ul[aria-label="Tiles"]')).toBeVisible()
  if (block.type === 'link') await expect(page.locator(`a[href^="${block.url}"][href*="utm_source=tilebox"]`).first()).toBeVisible()

  // Emptied fields remove the key.
  await openSiteTab(page)
  for (const label of ['Source (utm_source)', 'Medium (utm_medium)', 'Campaign (utm_campaign), optional']) await panel.getByLabel(label).fill('')
  await save(page)
  expect(readProfile().site?.utm).toBeUndefined()
})

test('the contact card and UTM fields are clearable, wait for the typing to stop, and block the save on a refused value', async ({ page }) => {
  const before = readFileSync(PROFILE_PATH, 'utf8')
  const profileFile = readProfile()
  await openSiteTab(page)
  const contactPanel = page.locator('[data-contact-panel]')
  const preview = contactPanel.locator('[data-contact-preview]')
  const defaultFile = (await preview.getAttribute('download')) ?? ''
  const clear = async (field: Locator) => {
    await field.click()
    await field.press('ControlOrMeta+a')
    await field.press('Backspace')
  }

  // Full name: the draft (the file name of the preview) follows about 600 ms after the last key, not on every key.
  const fullName = contactPanel.getByLabel('Full name')
  await clear(fullName)
  await fullName.pressSequentially('Zed Tester', { delay: 30 })
  await expect(fullName).toHaveAttribute('data-pending', '')
  await expect(preview).toHaveAttribute('download', defaultFile)
  await expect(preview).toHaveAttribute('download', 'zed-tester.vcf', { timeout: 1500 })
  await expect(fullName).not.toHaveAttribute('data-pending', '')
  // Cleared: the input stays empty (never rewritten), the key leaves the draft.
  await clear(fullName)
  await page.waitForTimeout(1000)
  await expect(fullName).toHaveValue('')
  await expect(preview).toHaveAttribute('download', contactFileName(profileFile.profile.name))

  // Public email: no message while typing, one after the wait, an alert only after the blur. Clearing removes it.
  const email = contactPanel.getByLabel('Public email')
  const contactError = contactPanel.locator('[data-field-error]')
  await clear(email)
  await email.pressSequentially('not-an-email', { delay: 30 })
  await page.waitForTimeout(300)
  await expect(contactError).toHaveCount(0)
  await expect(contactError).toHaveCount(1, { timeout: 1500 })
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(email).toHaveValue('not-an-email')
  await expect(contactPanel.getByRole('alert')).toHaveCount(0)
  await email.blur()
  await expect(contactPanel.getByRole('alert')).toHaveCount(1)
  await clear(email)
  await email.blur()
  await expect(email).toHaveValue('')
  await expect(contactError).toHaveCount(0)

  // UTM: the same field. The "incomplete" note follows the CHECKED text, so it waits too.
  const utmPanel = page.locator('[data-utm-panel]')
  const source = utmPanel.getByLabel('Source (utm_source)')
  const incomplete = utmPanel.locator('[data-utm-incomplete]')
  await clear(source)
  await source.blur()
  await expect(incomplete).toHaveCount(0)
  await source.pressSequentially('newsletter', { delay: 30 })
  await page.waitForTimeout(200)
  await expect(incomplete).toHaveCount(0)
  await expect(incomplete).toBeVisible({ timeout: 1500 })
  await clear(source)
  await page.waitForTimeout(1000)
  await expect(source).toHaveValue('')
  await expect(incomplete).toHaveCount(0)

  // A refused value: the save key checks the field at once and writes nothing.
  await source.pressSequentially('Bad Value', { delay: 10 })
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.locator('[data-save-blocked]')).toContainText('Save is blocked')
  await expect(page.locator('[data-field-problems]')).toContainText('Site > Source (utm_source): Use lowercase')
  await expect(utmPanel.locator('[data-field-error]')).toContainText('lowercase')
  await page.waitForTimeout(500)
  expect(readFileSync(PROFILE_PATH, 'utf8')).toBe(before)
  await clear(source)
  await source.blur()
  await expect(page.locator('[data-field-problems]')).toHaveCount(0)
})

test('share checkbox: off writes share false and the dev page has no button, on removes the key', async ({ page }) => {
  await openSiteTab(page)
  const box = page.getByLabel('Show a share button on my profile tile')
  await expect(box).toBeChecked()
  await box.uncheck()
  await save(page)
  expect(readProfile().site?.share).toBe(false)
  await page.goto('/')
  await expect(page.locator('ul[aria-label="Tiles"]')).toBeVisible()
  await expect(page.locator('[data-share-button]')).toHaveCount(0)

  await openSiteTab(page)
  await box.check()
  await save(page)
  expect(readProfile().site?.share).toBeUndefined()
})

test('QR panel: the caption names the URL that is IN the file, and Make / Regenerate refresh the previews of both panels', async ({ page }) => {
  // Mocked: no file is written. The answer holds the URL the route would put into the code.
  let made = 0
  await page.route('**/api/site/assets', async (route) => {
    const body = route.request().postDataJSON() as { site?: { url?: string } }
    made++
    const url = (body.site?.url ?? '').replace(/\/+$/, '')
    await route.fulfill({ json: { files: [], faviconSource: 'initials', ogSource: 'generated', messages: [], version: `made${made}`, extras: { qrUrl: url ? `${url}/` : '', messages: [] } } })
  })
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer()
  await page.route(/\/site\/qr\.svg/, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>' }))
  await page.route(/\/site\/(og|apple-touch-icon)\.png|\/site\/favicon\.ico/, route => route.fulfill({ contentType: 'image/png', body: png }))
  await openSiteTab(page)
  const panel = page.locator('[data-qr-panel]')
  const caption = panel.locator('[data-qr-caption]')
  const field = page.getByLabel('Site URL')

  // A file from an earlier build or Make is on disk. A new Site URL in the draft is NOT what that file opens.
  await field.fill('https://new.example')
  await field.blur()
  await expect(panel.locator('[data-qr-preview]')).toBeVisible()
  await expect(caption).toContainText('Press "Make the QR code"')
  await expect(caption).toContainText('https://new.example/')
  await expect(caption).not.toHaveText('https://new.example/')

  // Make: the caption is the URL of the answer, and the Site panel's previews load again (one stamp for both panels).
  await panel.locator('[data-qr-make]').click()
  await expect(caption).toHaveText('Opens https://new.example/')
  await expect(panel.locator('[data-qr-svg]')).toBeVisible()
  await expect(page.locator('[data-site-og-preview]')).toHaveAttribute('src', '/site/og.png?v=made1')

  // The Site URL changes after the Make: the file still opens the old URL. The panel says so and offers no download.
  await field.fill('https://other.example')
  await field.blur()
  await expect(caption).toContainText('This file opens https://new.example/')
  await expect(caption).toContainText('https://other.example/')
  await expect(panel.locator('[data-qr-svg]')).toHaveCount(0)
  await expect(panel.locator('[data-qr-png]')).toHaveCount(0)

  // "Regenerate" of the Site panel draws the QR code too: the QR panel follows.
  await page.getByRole('button', { name: 'Regenerate' }).click()
  await expect(caption).toHaveText('Opens https://other.example/')
  await expect(panel.locator('[data-qr-preview]')).toHaveAttribute('src', '/site/qr.svg?v=made2')
  // Not saved: the next test loads the file again.
})

test('"Check links" with the route mocked: badges on the rows, in memory only', async ({ page }) => {
  const blocks = readProfile().blocks.filter(block => (block.type === 'link' || block.type === 'social') && !block.hidden)
  const [ok, broken, blocked] = blocks
  if (!ok || !broken || !blocked || !('url' in ok) || !('url' in broken) || !('url' in blocked)) throw new Error('the profile needs 3 link or social blocks')
  const fileBefore = readFileSync(PROFILE_PATH, 'utf8')
  let posted: unknown
  await page.route('**/api/links/check', async (route) => {
    posted = route.request().postDataJSON()
    await route.fulfill({
      json: {
        results: [
          { url: ok.url, blockIds: [ok.id], status: 'ok', reason: 'http 200' },
          { url: broken.url, blockIds: [broken.id], status: 'broken', reason: 'http 404' },
          { url: blocked.url, blockIds: [blocked.id], status: 'blocked', reason: 'http 403: site blocks checks, probably fine' },
        ],
      },
    })
  })
  await openEditor(page)
  await page.getByRole('tab', { name: 'Blocks' }).click()
  const back = page.getByRole('button', { name: '← All blocks' })
  if (await back.isVisible()) await back.click()
  await expect(page.locator('[data-link-badge]')).toHaveCount(0)

  await page.locator('[data-check-links]').click()
  const rowOf = (id: string) => page.locator('ol > li', { has: page.locator(`[data-select-block="${id}"]`) })
  await expect(rowOf(ok.id).locator('[data-link-badge]')).toHaveAttribute('data-link-status', 'ok')
  await expect(rowOf(broken.id).locator('[data-link-badge]')).toHaveAttribute('data-link-status', 'broken')
  await expect(rowOf(broken.id).locator('[data-link-badge]')).toContainText('http 404')
  await expect(rowOf(blocked.id).locator('[data-link-badge]')).toContainText('probably fine')
  await expect(page.locator('[data-check-links-summary]')).toContainText('3 links')
  await expect(page.locator('[data-check-links-summary]')).toContainText('1 ok, 1 blocked, 1 broken')
  // The editor sent the draft (a profile), and nothing was written.
  expect(posted).toHaveProperty('blocks')
  await expect(page.getByRole('button', { name: 'Save', exact: false }).first()).toBeVisible()
  expect(readFileSync(PROFILE_PATH, 'utf8')).toBe(fileBefore)
})

test('the real dev routes: the link check is guarded and never leaves the machine for a loopback URL; the QR PNG is 1024 px', async ({ request, baseURL }) => {
  const sameOrigin = { 'origin': baseURL ?? '', 'sec-fetch-site': 'same-origin' }
  const profile = readProfile()

  // The guard of every dev route.
  expect((await request.post('/api/links/check', { headers: { origin: 'https://evil.example' }, data: profile })).status()).toBe(403)
  expect((await request.post('/api/links/check', { headers: { 'content-type': 'text/plain' }, data: JSON.stringify(profile) })).status()).toBe(415)
  expect((await request.post('/api/links/check', { headers: sameOrigin, data: { nope: true } })).status()).toBe(400)
  expect((await request.get('/api/site/qr.png', { headers: { host: 'evil.example' } })).status()).toBe(403)

  // One loopback link only: the engine refuses it without any connection, so this real call needs no network.
  const local = { ...profile, blocks: [{ id: 'x1', type: 'link', size: '1x1', title: 'Local', url: 'http://127.0.0.1/' }], layout: { desktop: ['x1'] }, contact: undefined }
  const checked = await request.post('/api/links/check', { headers: sameOrigin, data: local })
  expect(checked.status()).toBe(200)
  expect(await checked.json()).toEqual({ results: [{ url: 'http://127.0.0.1/', blockIds: ['x1'], status: 'broken', reason: 'blocked address' }] })

  // QR: no site URL = no file = 404. With one, "Regenerate" draws the SVG and the PNG route answers 1024 x 1024.
  const hadQr = existsSync(resolve(SITE_DIR, 'qr.svg'))
  try {
    const withoutUrl = { ...profile, site: { ...profile.site, url: undefined } }
    expect((await request.post('/api/site/assets', { headers: sameOrigin, data: withoutUrl })).status()).toBe(200)
    if (!process.env.NUXT_PUBLIC_SITE_URL) expect((await request.get('/api/site/qr.png')).status()).toBe(404)

    const withUrl = { ...profile, site: { ...profile.site, url: 'https://ada.example' } }
    const made = await request.post('/api/site/assets', { headers: sameOrigin, data: withUrl })
    expect(made.status()).toBe(200)
    const body = await made.json() as { extras?: { qrUrl?: string } }
    if (!process.env.NUXT_PUBLIC_SITE_URL) expect(body.extras?.qrUrl).toBe('https://ada.example/')
    const svg = await request.get('/site/qr.svg')
    expect(svg.status()).toBe(200)
    expect(svg.headers()['content-security-policy']).toContain('sandbox')
    const png = await request.get('/api/site/qr.png')
    expect(png.status()).toBe(200)
    expect(png.headers()['content-type']).toContain('image/png')
    const meta = await sharp(await png.body()).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1024, 1024])
  }
  finally {
    if (!hadQr) rmSync(resolve(SITE_DIR, 'qr.svg'), { force: true })
  }
})
