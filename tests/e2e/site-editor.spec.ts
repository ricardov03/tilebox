/**
 * The Site tab of the local editor (WP10b) on `nuxt dev`. Writes
 * content/profile.json, so this project runs locally only. The file is backed
 * up first and restored at the end. "Regenerate" is mocked in the UI test; the
 * last test calls the real dev routes once (the Nitro bundle must load the builder).
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { PERSONAL_PROFILE_PATH as PROFILE_PATH, readProfile, ROOT } from './helpers'

const BACKUP = `${PROFILE_PATH}.e2e-site-backup`
/** 1x1 transparent PNG. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  copyFileSync(PROFILE_PATH, BACKUP)
})

test.afterAll(() => {
  if (existsSync(BACKUP)) {
    writeFileSync(PROFILE_PATH, readFileSync(BACKUP))
    rmSync(BACKUP)
  }
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

async function save(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
}

test('the Site tab is the fourth tab and follows the ARIA keyboard model', async ({ page }) => {
  await openEditor(page)
  await expect(page.getByRole('tab')).toHaveText(['Profile', 'Blocks', 'Theme', 'Site'])
  await page.getByRole('tab', { name: 'Theme' }).click()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Site' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Site' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name: 'Site' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Profile' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Site' })).toBeFocused()
})

test('edits the site fields, shows the previews, refuses a bad URL and saves', async ({ page }) => {
  const before = readProfile()
  await openSiteTab(page)
  const panel = page.locator('#panel-site')

  // The defaults show as placeholders, the draft values in the previews.
  await expect(panel.getByLabel('Page title')).toHaveAttribute('placeholder', `${before.profile.name} (@${before.profile.handle})`)
  await panel.getByLabel('Page title').fill('Ada Lovelace, engineer')
  await panel.getByLabel('Description').fill('Notes on engines.')
  await expect(panel.locator('[data-site-snippet]')).toContainText('Ada Lovelace, engineer')
  await expect(panel.locator('[data-site-card]')).toContainText('Notes on engines.')
  await expect(panel.getByText('22/70')).toBeVisible()

  // A bad URL shows the inline error and never reaches the draft.
  const url = panel.getByLabel('Site URL')
  await url.fill('http://ada.example')
  await url.blur()
  await expect(panel.getByRole('alert')).toContainText('https URL')
  await expect(url).toHaveAttribute('aria-invalid', 'true')
  await expect(url).toHaveValue('http://ada.example')
  await url.fill('https://ada.example/')
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await expect(panel.locator('[data-site-snippet]')).toContainText('ada.example')

  await panel.getByLabel('Language').fill('en-GB')
  await panel.getByLabel('X handle').fill('@ada')
  await panel.getByLabel('Job title').fill('Engineer')
  await panel.getByLabel('Location').fill('London')
  await panel.getByLabel('Hide my page from search engines').check()
  await save(page)

  expect(readProfile().site).toEqual({
    ...before.site,
    title: 'Ada Lovelace, engineer',
    description: 'Notes on engines.',
    url: 'https://ada.example',
    lang: 'en-GB',
    xHandle: 'ada',
    jobTitle: 'Engineer',
    location: 'London',
    noindex: true,
  })
})

test('a bad URL is not saved and never blocks the save, and an emptied field leaves the file', async ({ page }) => {
  await openSiteTab(page)
  const panel = page.locator('#panel-site')
  const url = panel.getByLabel('Site URL')
  await expect(url).toHaveValue('https://ada.example')
  await url.fill('ada.example')
  await url.blur()
  await expect(panel.getByRole('alert')).toContainText('https URL')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.locator('[data-save-blocked]')).toHaveCount(0)
  await expect(page.locator('[data-field-problems]')).toContainText('Not saved:')
  expect(readProfile().site?.url).toBe('https://ada.example')

  // The old value again: the field is fine, the save works.
  await url.fill('https://ada.example')
  await panel.getByLabel('Page title').fill('')
  await panel.getByLabel('Hide my page from search engines').uncheck()
  await save(page)

  const site = readProfile().site ?? {}
  expect(site.url).toBe('https://ada.example')
  expect('title' in site).toBe(false)
  expect('noindex' in site).toBe(false)
})

test('"Regenerate" sends the draft to the route and refreshes the previews', async ({ page }) => {
  const bodies: { site?: { jobTitle?: string } }[] = []
  await page.route('**/api/site/assets', async (route) => {
    bodies.push(route.request().postDataJSON() as { site?: { jobTitle?: string } })
    await route.fulfill({
      json: { files: ['og.png'], faviconSource: 'avatar', ogSource: 'generated', messages: ['site: a note from the build'], version: 'e2e123' },
    })
  })
  await openSiteTab(page)
  const panel = page.locator('#panel-site')
  const preview = panel.locator('[data-site-og-preview]')
  await expect(preview).toHaveAttribute('src', /^\/site\/og\.png\?v=(?!e2e123)/)
  await panel.getByLabel('Job title').fill('Unsaved job')

  await panel.getByRole('button', { name: 'Regenerate' }).click()
  await expect(preview).toHaveAttribute('src', '/site/og.png?v=e2e123')
  await expect(panel.locator('[data-site-card] img')).toHaveAttribute('src', '/site/og.png?v=e2e123')
  await expect(panel.getByAltText('Favicon, 32 pixels')).toHaveAttribute('src', '/site/favicon.ico?v=e2e123')
  await expect(panel.locator('[data-favicon-source]')).toContainText('your avatar')
  await expect(panel.getByText('site: a note from the build')).toBeVisible()
  expect(bodies).toHaveLength(1)
  expect(bodies[0]?.site?.jobTitle).toBe('Unsaved job')
})

test('the real dev routes: upload to public/site-uploads, build public/site, refuse bad input', async ({ request }) => {
  const upload = await request.post('/api/site/upload?kind=favicon', { multipart: { file: { name: 'icon.png', mimeType: 'image/png', buffer: TINY_PNG } } })
  expect(upload.status()).toBe(200)
  const { src } = await upload.json() as { src: string }
  expect(src).toMatch(/^\/site-uploads\/favicon-[0-9a-f]{6}\.png$/)
  const file = resolve(ROOT, `public${src}`)
  expect(existsSync(file)).toBe(true)
  rmSync(file)

  const refused = await request.post('/api/site/upload?kind=og', { multipart: { file: { name: 'icon.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') } } })
  expect(refused.status()).toBe(415)
  expect((await request.post('/api/site/assets', { data: { nope: true } })).status()).toBe(400)

  // The saved profile, so public/site/ ends as `predev` left it.
  const built = await request.post('/api/site/assets', { data: JSON.parse(readFileSync(BACKUP, 'utf8')) as unknown })
  expect(built.status()).toBe(200)
  const result = await built.json() as { files: string[], ogSource: string, version: string }
  expect(result.files).toContain('og.png')
  expect(result.files).toContain('favicon.ico')
  expect(result.version).not.toBe('')
  expect((await request.get('/site/og.png')).status()).toBe(200)
})
