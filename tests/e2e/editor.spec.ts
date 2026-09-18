/**
 * The local editor on `nuxt dev`. Writes content/profile.json and
 * public/blocks/, so this project runs locally only.
 * content/profile.json (the file the save route writes; `predev` creates it
 * from the example) is backed up first and restored at the end.
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { PERSONAL_PROFILE_PATH as PROFILE_PATH, readProfile, ROOT } from './helpers'
import type { Profile } from '../../types/profile'

const BACKUP = `${PROFILE_PATH}.e2e-backup`
const NEW_TITLE = 'Playwright link'
const NEW_URL = 'https://playwright.dev/'
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

async function save(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
}

test('adds a link block, edits it, moves it on mobile and saves with the keyboard', async ({ page }) => {
  const before = readProfile()
  await openEditor(page)

  await page.getByRole('button', { name: 'Add block' }).click()
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  const form = page.locator('form')
  await expect(form.locator('input[id$="-title"]')).toHaveValue('New link')
  await form.locator('input[id$="-title"]').fill(NEW_TITLE)
  await form.locator('input[id$="-url"]').fill(NEW_URL)

  // The preview renders the real tile with the new title.
  const newId = (await page.locator('li[data-id]').last().getAttribute('data-id')) ?? ''
  expect(newId).not.toBe('')
  expect(before.blocks.some(b => b.id === newId)).toBe(false)
  await expect(page.locator(`li[data-id="${newId}"] a`)).toContainText(NEW_TITLE)

  // Mobile layout: radio group, 2 columns.
  await page.getByRole('radio', { name: 'Mobile' }).click()
  await expect(page.getByRole('radio', { name: 'Mobile' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('ul.grid-cols-2')).toHaveCount(1)

  // Keyboard reorder: the new block is last, move it up one.
  await page.getByRole('button', { name: 'All blocks' }).click()
  const ordered = () => page.locator('li[data-id]').evaluateAll(els => els.map(el => el.getAttribute('data-id')))
  const mobileBefore = await ordered()
  expect(mobileBefore.at(-1)).toBe(newId)
  await page.getByRole('button', { name: `Move ${NEW_TITLE} up` }).click()
  const mobileAfter = await ordered()
  expect(mobileAfter.at(-2)).toBe(newId)
  expect(mobileAfter.at(-1)).toBe(mobileBefore.at(-2))

  await save(page)

  const saved = readProfile()
  const block = saved.blocks.find(b => b.id === newId)
  expect(block).toMatchObject({ type: 'link', title: NEW_TITLE, url: NEW_URL })
  expect(saved.layout.desktop.at(-1)).toBe(newId)
  expect(saved.layout.mobile?.at(-2)).toBe(newId)
  expect(saved.layout.mobile?.at(-1)).toBe(mobileBefore.at(-2))
})

test('an invalid URL shows an error and is not written', async ({ page }) => {
  const before = readFileSync(PROFILE_PATH, 'utf8')
  await openEditor(page)

  await page.getByRole('button', { name: /^Edit Link block: /, exact: false }).first().click()
  const form = page.locator('form')
  await form.locator('input[id$="-url"]').fill('not a url')
  await expect(form.getByRole('alert')).toContainText('url')

  // The invalid value never reached the draft, so there is nothing to save.
  await page.keyboard.press('ControlOrMeta+s')
  await page.waitForTimeout(500)
  expect(readFileSync(PROFILE_PATH, 'utf8')).toBe(before)
  expect(before).not.toContain('not a url')
})

test('the save route rejects an empty profile name', async ({ page }) => {
  const before = readFileSync(PROFILE_PATH, 'utf8')
  await openEditor(page)

  await page.getByRole('tab', { name: 'Profile' }).click()
  await page.locator('#p-name').fill('')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByRole('alert')).toContainText('profile.name')
  expect(readFileSync(PROFILE_PATH, 'utf8')).toBe(before)
})

test('edits email, email visibility and highlights, and saves them', async ({ page }) => {
  await openEditor(page)
  await page.getByRole('tab', { name: 'Profile' }).click()

  await page.locator('#p-email').fill('me@tilebox.test')
  await page.locator('#p-show-email').check()
  await page.locator('#p-highlight-0').fill('First highlight')
  await page.locator('#p-highlight-1').fill('')
  await page.locator('#p-highlight-2').fill('Third input, second highlight')
  await expect(page.getByText('15/80')).toBeVisible()

  // The live preview shows the highlights, the email link and the pulsing dot.
  const preview = page.locator('li[data-profile]')
  await expect(preview.locator('ul[aria-label="Highlights"] > li')).toHaveText(['First highlight', 'Third input, second highlight'])
  await expect(preview.locator('a[href="mailto:me@tilebox.test"]')).toBeVisible()
  await expect(preview.locator('.animate-pulse')).toHaveCount(1)

  await save(page)

  const saved = readProfile().profile
  expect(saved.email).toBe('me@tilebox.test')
  expect(saved.showEmail).toBe(true)
  // The empty input in the middle was dropped.
  expect(saved.highlights).toEqual(['First highlight', 'Third input, second highlight'])

  // The public page gets the new sanitized profile without a restart.
  await page.goto('/')
  await expect(page.locator('a[href="mailto:me@tilebox.test"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('ul[aria-label="Highlights"] > li')).toHaveCount(2)
})

test('hiding the email removes it from the public page', async ({ page }) => {
  await openEditor(page)
  await page.getByRole('tab', { name: 'Profile' }).click()
  await expect(page.locator('#p-show-email')).toBeChecked()
  await page.locator('#p-show-email').uncheck()
  await expect(page.locator('li[data-profile] a[href^="mailto:"]')).toHaveCount(0)
  await save(page)
  expect(readProfile().profile.showEmail).toBe(false)

  // The dev server rewrites the sanitized profile a moment after the save (file watcher). Production builds it fresh.
  await expect.poll(async () => (await page.request.get('/')).text(), { timeout: 15_000 }).not.toContain('me@tilebox.test')
  await page.goto('/')
  await expect(page.locator('a[href="mailto:me@tilebox.test"]')).toHaveCount(0)
})

test('an invalid email shows an inline error and is not written', async ({ page }) => {
  const before = readFileSync(PROFILE_PATH, 'utf8')
  await openEditor(page)
  await page.getByRole('tab', { name: 'Profile' }).click()

  await page.locator('#p-email').fill('not-an-email')
  await expect(page.locator('#p-email-error')).toContainText('email')
  await expect(page.locator('#p-email')).toHaveAttribute('aria-invalid', 'true')

  // The invalid value never reached the draft, so there is nothing to save.
  await page.keyboard.press('ControlOrMeta+s')
  await page.waitForTimeout(500)
  expect(readFileSync(PROFILE_PATH, 'utf8')).toBe(before)
  expect(before).not.toContain('not-an-email')
})

test('the Gravatar route refuses a placeholder email', async ({ request }) => {
  const response = await request.post('/api/avatar/gravatar', { data: { email: 'you@example.com' } })
  expect(response.status()).toBe(400)
  const state = await request.get('/api/avatar/gravatar')
  expect(state.status()).toBe(200)
  expect(typeof (await state.json()).exists).toBe('boolean')
})

test('uploads a png through ImagePicker into public/blocks', async ({ page }) => {
  await openEditor(page)
  const profile: Profile = readProfile()
  const image = profile.blocks.find(b => b.type === 'image')
  test.skip(!image, 'sample data has no image block')

  await page.getByRole('button', { name: /^Edit Image block: / }).first().click()
  const form = page.locator('form')
  await form.locator('input[type="file"]').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: TINY_PNG })
  const srcInput = form.locator('input[id$="-src"]')
  await expect(srcInput).toHaveValue(/^\/blocks\/tiny-[0-9a-f]{6}\.png$/, { timeout: 15_000 })

  const src = await srcInput.inputValue()
  const file = resolve(ROOT, 'public', src.slice(1))
  expect(existsSync(file)).toBe(true)
  expect(readFileSync(file)).toEqual(TINY_PNG)
  rmSync(file)
})
