/**
 * Text fields of the local editor on `nuxt dev` (NOTES.md, "Editor input fix").
 * A field keeps what you type. The check waits until you stop typing. A value
 * that fails the check never reaches the draft, and the input is never rewritten.
 * Writes content/profile.json: it is backed up first and restored at the end.
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { PERSONAL_PROFILE_PATH as PROFILE_PATH, readProfile } from './helpers'
import type { LinkBlock } from '../../types/profile'

const BACKUP = `${PROFILE_PATH}.e2e-inputs-backup`

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

/** No test may read a real website: every POST /api/unfurl gets this answer. */
async function mockUnfurl(page: Page, answer: Record<string, unknown>): Promise<void> {
  await page.route('**/api/unfurl', route => route.fulfill({ json: answer }))
}

async function openEditor(page: Page): Promise<void> {
  await mockUnfurl(page, { ok: false, reason: 'mocked in tests' })
  await page.goto('/edit')
  await page.locator('li[data-id]').first().waitFor({ timeout: 60_000 })
}

async function selectFromList(page: Page, id: string): Promise<void> {
  const back = page.getByRole('button', { name: 'All blocks' })
  if (await back.isVisible()) await back.click()
  await page.getByRole('tab', { name: 'Blocks' }).click()
  await page.locator(`[data-select-block="${id}"]`).click()
}

/** The first link block of the saved file that has a description. */
function firstLink(): LinkBlock {
  const block = readProfile().blocks.find(b => b.type === 'link' && b.description)
  if (!block || block.type !== 'link') throw new Error('the sample profile has no link block with a description')
  return block
}

function savedLink(id: string): LinkBlock {
  const block = readProfile().blocks.find(b => b.id === id)
  if (!block || block.type !== 'link') throw new Error(`no link block "${id}" in the saved file`)
  return block
}

async function clear(field: Locator): Promise<void> {
  await field.click()
  await field.press('ControlOrMeta+a')
  await field.press('Backspace')
}

/** Type key by key. After every key the input shows exactly what was typed so far. */
async function typeAndWatch(field: Locator, text: string): Promise<void> {
  let typed = ''
  for (const key of text) {
    await field.pressSequentially(key, { delay: 30 })
    typed += key
    expect(await field.inputValue()).toBe(typed)
  }
}

const problems = (page: Page) => page.locator('[data-field-problems]')
const blocked = (page: Page) => page.locator('[data-save-blocked]')

test('a cleared URL stays empty, and Backspace in a field never opens the block delete', async ({ page }) => {
  const block = firstLink()
  await openEditor(page)
  await selectFromList(page, block.id)
  const url = page.locator('form input[id$="-url"]')
  await expect(url).toHaveValue(block.url)

  await clear(url)
  await expect(url).toHaveValue('')
  // Backspace and Delete in an empty field: still a field key, not the block shortcut.
  await url.press('Backspace')
  await url.press('Delete')
  await page.waitForTimeout(1000)
  await expect(url).toHaveValue('')
  await expect(page.getByRole('button', { name: /^Yes, delete/ })).toHaveCount(0)
  await expect(page.locator(`li[data-id="${block.id}"]`)).toBeVisible()
})

test('typing through invalid states never rewrites the input', async ({ page }) => {
  const block = firstLink()
  await openEditor(page)
  await selectFromList(page, block.id)
  const url = page.locator('form input[id$="-url"]')

  await clear(url)
  await typeAndWatch(url, 'https://exa')
  // Also after the check ran on the half-typed text.
  await page.waitForTimeout(900)
  await expect(url).toHaveValue('https://exa')
  await typeAndWatch(page.locator('form input[id$="-title"]'), ' x')
})

test('no message while typing, a message about 600 ms after the last key', async ({ page }) => {
  const block = firstLink()
  await openEditor(page)
  await selectFromList(page, block.id)
  const form = page.locator('form')
  const url = form.locator('input[id$="-url"]')
  const error = form.locator('[data-field-error]')

  await clear(url)
  await url.pressSequentially('not a url', { delay: 30 })
  await page.waitForTimeout(300)
  await expect(error).toHaveCount(0)
  await expect(url).not.toHaveAttribute('aria-invalid', 'true')

  await expect(error).toHaveCount(1, { timeout: 1500 })
  await expect(url).toHaveAttribute('aria-invalid', 'true')
  await expect(url).toHaveAttribute('aria-describedby', /-url-error/)
  // Not an alert while the field has the focus. An alert after the blur.
  await expect(form.getByRole('alert')).toHaveCount(0)
  await url.blur()
  await expect(form.getByRole('alert')).toHaveCount(1)
  await expect(url).toHaveValue('not a url')
})

test('a cleared required URL: error after blur, the draft keeps the last valid URL, Save is blocked, a valid URL saves', async ({ page }) => {
  const block = firstLink()
  const before = readFileSync(PROFILE_PATH, 'utf8')
  await openEditor(page)
  await selectFromList(page, block.id)
  const form = page.locator('form')
  const url = form.locator('input[id$="-url"]')
  const tileLink = page.locator(`li[data-id="${block.id}"] a`)

  await clear(url)
  await url.blur()
  await expect(form.locator('[data-field-error]')).toHaveText('Required')
  await expect(form.getByRole('alert')).toHaveText('Required')
  await expect(url).toHaveValue('')
  // The draft (the preview tile) still has the last valid URL.
  await expect(tileLink).toHaveAttribute('href', block.url)
  await expect(problems(page)).toContainText('Not saved yet')
  await expect(problems(page)).toContainText('URL: Required')

  await page.keyboard.press('ControlOrMeta+s')
  await expect(blocked(page)).toContainText('Save is blocked')
  await page.waitForTimeout(500)
  expect(readFileSync(PROFILE_PATH, 'utf8')).toBe(before)

  await url.fill('https://inputs.test/valid')
  await url.blur()
  await expect(form.locator('[data-field-error]')).toHaveCount(0)
  await expect(problems(page)).toHaveCount(0)
  await expect(blocked(page)).toHaveCount(0)
  await expect(tileLink).toHaveAttribute('href', 'https://inputs.test/valid')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(savedLink(block.id).url).toBe('https://inputs.test/valid')
})

test('Cmd/Ctrl+S checks the field now, then saves', async ({ page }) => {
  const block = firstLink()
  await openEditor(page)
  await selectFromList(page, block.id)
  const title = page.locator('form input[id$="-title"]')

  await title.fill('Flushed by the save key')
  // Far inside the 600 ms wait, with the focus still in the field.
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(savedLink(block.id).title).toBe('Flushed by the save key')
})

test('an emptied optional field leaves the saved file', async ({ page }) => {
  const block = firstLink()
  expect(block.description).toBeTruthy()
  await openEditor(page)
  await selectFromList(page, block.id)
  const description = page.locator('form input[id$="-description"]')

  await clear(description)
  await description.blur()
  await expect(description).toHaveValue('')
  await expect(page.locator('form [data-field-error]')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect('description' in savedLink(block.id)).toBe(false)
})

const FETCHED = {
  ok: true,
  cached: false,
  url: 'https://inputs.test/valid',
  finalUrl: 'https://inputs.test/valid',
  title: 'Fetched title',
  source: 'html',
  fetchedAt: '2026-09-18T00:00:00.000Z',
}

test('a change from outside updates a field without the focus, and clears its error', async ({ page }) => {
  const block = firstLink()
  await openEditor(page)
  await mockUnfurl(page, FETCHED)
  await selectFromList(page, block.id)
  const form = page.locator('form')
  const title = form.locator('input[id$="-title"]')

  await form.locator('input[id$="-preview-enrich"]').check()
  const useFetched = form.getByRole('button', { name: 'Use fetched title' })
  await expect(useFetched).toBeVisible()
  await clear(title)
  await title.blur()
  await expect(form.locator('[data-field-error]')).toHaveText('Required')
  await expect(title).toHaveValue('')

  await useFetched.click()
  await expect(title).toHaveValue('Fetched title')
  await expect(form.locator('[data-field-error]')).toHaveCount(0)
  await expect(problems(page)).toHaveCount(0)
})

test('a change from outside never rewrites the field you are typing in', async ({ page }) => {
  await openEditor(page)
  // The answer comes 500 ms late: by then the title field has the focus and new text.
  await page.route('**/api/unfurl', async (route) => {
    await new Promise(done => setTimeout(done, 500))
    await route.fulfill({ json: FETCHED })
  })
  await page.getByRole('button', { name: 'Add block' }).click()
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  const form = page.locator('form')
  const title = form.locator('input[id$="-title"]')
  const id = (await page.locator('li[data-id]').last().getAttribute('data-id')) ?? ''

  await form.locator('input[id$="-url"]').fill('https://inputs.test/valid')
  // The click takes the focus from the URL field: the URL is checked and the website is asked now.
  await title.click()
  await title.press('ControlOrMeta+a')
  await title.pressSequentially('Mine', { delay: 10 })
  // The answer pre-fills the placeholder title in the draft. The input keeps your text, then your text wins.
  await expect(form.locator('[data-link-card]')).toContainText('Fetched title')
  await expect(title).toHaveValue('Mine')
  await expect(page.locator(`li[data-id="${id}"] a`)).toContainText('Mine')
  await expect(title).toHaveValue('Mine')
})

test('the profile email field: clear, error, blocked save, valid email saves', async ({ page }) => {
  const before = readProfile().profile.email
  await openEditor(page)
  await page.getByRole('tab', { name: 'Profile' }).click()
  const email = page.locator('#p-email')
  await expect(email).toHaveValue(before)

  await clear(email)
  await typeAndWatch(email, 'me@inputs')
  await page.waitForTimeout(300)
  await expect(page.locator('#p-email-error')).toHaveCount(0)
  await clear(email)
  await email.blur()
  await expect(email).toHaveValue('')
  await expect(page.locator('#p-email-error')).toHaveText('Required')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(problems(page)).toContainText('Email: Required')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(blocked(page)).toBeVisible()
  expect(readProfile().profile.email).toBe(before)

  await email.fill('me@inputs.test')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(readProfile().profile.email).toBe('me@inputs.test')
})

test('the Site URL field: typing is never rewritten, a bad URL blocks the save, an empty one leaves the file', async ({ page }) => {
  await openEditor(page)
  await page.getByRole('tab', { name: 'Site' }).click()
  const panel = page.locator('#panel-site')
  const url = panel.getByLabel('Site URL')

  await clear(url)
  await typeAndWatch(url, 'https://inputs.example/')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  // The draft gets the URL without the trailing slash.
  expect(readProfile().site?.url).toBe('https://inputs.example')

  await openEditor(page)
  await page.getByRole('tab', { name: 'Site' }).click()
  await clear(url)
  await typeAndWatch(url, 'http://inputs')
  await url.blur()
  await expect(panel.locator('#s-url-error')).toContainText('https')
  await expect(url).toHaveValue('http://inputs')
  await expect(problems(page)).toContainText('Site URL')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(blocked(page)).toBeVisible()
  expect(readProfile().site?.url).toBe('https://inputs.example')

  await clear(url)
  await url.blur()
  await expect(panel.locator('#s-url-error')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(readProfile().site?.url).toBeUndefined()
})
