/**
 * Text fields of the local editor on `nuxt dev` (NOTES.md, "Editor input fix").
 * A field keeps what you type. The check waits until you stop typing. A value
 * that fails the check never reaches the draft, and the input is never rewritten.
 * WP17: an empty field is never an error, and nothing blocks the save.
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

/** The first link block of the saved file. The sample has one with a description, for the optional field test. */
function firstLink(withDescription = false): LinkBlock & { url: string, title: string } {
  const block = readProfile().blocks.find(b => b.type === 'link' && b.url && b.title && (!withDescription || b.description))
  if (!block || block.type !== 'link' || !block.url || !block.title) throw new Error('the profile has no such link block')
  return { ...block, url: block.url, title: block.title }
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
  await expect(url).toHaveValue(block.url ?? '')

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
  const title = page.locator('form input[id$="-title"]')
  await clear(title)
  await typeAndWatch(title, 'A new title')
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

test('WP17: a cleared URL is no error: the block is "Incomplete", Save works, the file has no `url` key, the public page drops the tile', async ({ page }) => {
  const block = firstLink()
  await openEditor(page)
  await selectFromList(page, block.id)
  const form = page.locator('form')
  const url = form.locator('input[id$="-url"]')
  const tile = page.locator(`li[data-id="${block.id}"]`)
  await expect(tile.locator('a')).toHaveAttribute('href', block.url)
  await expect(tile.locator('[data-incomplete-badge]')).toHaveCount(0)

  await clear(url)
  await url.blur()
  await expect(url).toHaveValue('')
  await expect(form.locator('[data-field-error]')).toHaveCount(0)
  await expect(form.getByRole('alert')).toHaveCount(0)
  await expect(url).not.toHaveAttribute('aria-invalid', 'true')
  await expect(problems(page)).toHaveCount(0)
  // The draft lost the URL: the tile is no link any more, it is dimmed and says why.
  await expect(tile.locator('a')).toHaveCount(0)
  await expect(tile.locator('[data-incomplete-badge]')).toHaveText('Incomplete: add a URL')
  await expect(form.locator('[data-form-incomplete]')).toContainText('Incomplete: add a URL')
  expect(await tile.locator('> div').first().evaluate(el => getComputedStyle(el).opacity)).toBe('0.4')

  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(blocked(page)).toHaveCount(0)
  expect('url' in savedLink(block.id)).toBe(false)

  // The public page of the dev server is made by the same sanitizer as the build: the tile is gone.
  // The URL, not the title: a title may also be a word of the bio or the status line.
  await expect.poll(async () => (await (await page.request.get('/')).text()).includes(block.url), { timeout: 20_000 }).toBe(false)

  // The list row carries the badge too. A URL again: complete again.
  await openEditor(page)
  await page.getByRole('tab', { name: 'Blocks' }).click()
  const back = page.getByRole('button', { name: 'All blocks' })
  if (await back.isVisible()) await back.click()
  await expect(page.locator(`li:has([data-select-block="${block.id}"]) [data-incomplete-badge]`)).toHaveText('Incomplete: add a URL')
  await selectFromList(page, block.id)
  await url.fill('https://inputs.test/valid')
  await url.blur()
  await expect(tile.locator('[data-incomplete-badge]')).toHaveCount(0)
  await expect(tile.locator('a')).toHaveAttribute('href', 'https://inputs.test/valid')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(savedLink(block.id).url).toBe('https://inputs.test/valid')
})

test('WP17: text that is not a URL shows a message and is not saved, Save still writes everything else', async ({ page }) => {
  const block = firstLink()
  await openEditor(page)
  await selectFromList(page, block.id)
  const form = page.locator('form')
  const url = form.locator('input[id$="-url"]')
  const title = form.locator('input[id$="-title"]')

  await url.fill('not a url')
  await url.blur()
  await expect(form.locator('[data-field-error]')).toHaveCount(1)
  await expect(url).toHaveAttribute('aria-invalid', 'true')
  await title.fill('Saved next to a refused URL')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => savedLink(block.id).title, { timeout: 15_000 }).toBe('Saved next to a refused URL')
  await expect(blocked(page)).toHaveCount(0)
  // The file keeps the last valid URL.
  expect(savedLink(block.id).url).toBe(block.url)
})

test('WP17: the save bar lists a refused format under "Not saved:" and says that the rest is written', async ({ page }) => {
  await openEditor(page)
  await page.getByRole('tab', { name: 'Profile' }).click()
  const email = page.locator('#p-email')
  await email.fill('not an email')
  await email.blur()
  await expect(problems(page)).toContainText('Not saved:')
  await expect(problems(page)).toContainText('Profile > Email')
  await expect(problems(page)).toContainText('Save writes everything else')
  await expect(email).toHaveValue('not an email')
})

test('WP17: cleared title, bio, handle and email are saved as absent keys', async ({ page }) => {
  const block = firstLink()
  await openEditor(page)
  await selectFromList(page, block.id)
  const title = page.locator('form input[id$="-title"]')
  await clear(title)
  await title.blur()
  await expect(page.locator('form [data-field-error]')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Profile' }).click()
  for (const id of ['#p-handle', '#p-bio', '#p-email']) {
    const field = page.locator(id)
    await clear(field)
    await field.blur()
    await expect(field).toHaveValue('')
    await expect(field).not.toHaveAttribute('aria-invalid', 'true')
  }
  await expect(page.locator('#panel-profile [data-field-error]')).toHaveCount(0)
  await expect(problems(page)).toHaveCount(0)
  // No email = nothing to ask Gravatar for.
  await expect(page.getByRole('button', { name: 'Use my Gravatar' })).toBeDisabled()
  await expect(page.locator('[data-gravatar-no-email]')).toBeVisible()

  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  const saved = readProfile()
  expect('handle' in saved.profile).toBe(false)
  expect('bio' in saved.profile).toBe(false)
  expect('email' in saved.profile).toBe(false)
  expect('title' in savedLink(block.id)).toBe(false)
  expect(savedLink(block.id).url).toBeTruthy()

  // Put the title back, so the next test of this serial file still finds a complete link.
  // The Blocks tab comes back with this block's form already open, so the field is there.
  await page.getByRole('tab', { name: 'Blocks' }).click()
  await expect(title).toBeVisible()
  await title.fill(block.title)
  await title.blur()
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => savedLink(block.id).title, { timeout: 15_000 }).toBe(block.title)
})

test('WP17: an emptied name never blocks: Save works, the last name stays, a soft note says so', async ({ page }) => {
  const before = readProfile().profile.name
  await openEditor(page)
  await page.getByRole('tab', { name: 'Profile' }).click()
  const name = page.locator('#p-name')
  await clear(name)
  await name.blur()
  await expect(name).toHaveValue('')
  await expect(page.locator('#p-name-error')).toHaveCount(0)
  await expect(name).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#p-name-kept')).toContainText('keeps the last saved name')
  await expect(problems(page)).toContainText('Name is empty: kept the last saved name')
  // The preview still shows the last valid name.
  await expect(page.locator('li[data-profile] h1')).toHaveText(before)

  await page.locator('#p-status').fill('Saved with an empty name field')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => readProfile().profile.status, { timeout: 15_000 }).toBe('Saved with an empty name field')
  await expect(blocked(page)).toHaveCount(0)
  expect(readProfile().profile.name).toBe(before)
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
  const block = firstLink(true)
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

test('a change from outside updates a field without the focus', async ({ page }) => {
  const block = firstLink()
  await openEditor(page)
  await mockUnfurl(page, FETCHED)
  await selectFromList(page, block.id)
  const form = page.locator('form')
  const title = form.locator('input[id$="-title"]')

  await form.locator('input[id$="-preview-enrich"]').check()
  const useFetched = form.getByRole('button', { name: 'Use fetched title' })
  await expect(useFetched).toBeVisible()
  // WP17: an emptied title is no error. The draft has no title now.
  await clear(title)
  await title.blur()
  await expect(form.locator('[data-field-error]')).toHaveCount(0)
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

test('the profile email field: a half email shows a message and is not saved, a valid email saves', async ({ page }) => {
  const before = readProfile().profile.email
  await openEditor(page)
  await page.getByRole('tab', { name: 'Profile' }).click()
  const email = page.locator('#p-email')
  await expect(email).toHaveValue(before ?? '')

  await clear(email)
  await typeAndWatch(email, 'me@inputs')
  await page.waitForTimeout(300)
  await expect(page.locator('#p-email-error')).toHaveCount(0)
  await email.blur()
  await expect(page.locator('#p-email-error')).toHaveCount(1)
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expect(problems(page)).toContainText('Profile > Email')
  await page.locator('#p-status').fill('Saved next to a refused email')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => readProfile().profile.status, { timeout: 15_000 }).toBe('Saved next to a refused email')
  await expect(blocked(page)).toHaveCount(0)
  expect(readProfile().profile.email).toBe(before)

  await openEditor(page)
  await page.getByRole('tab', { name: 'Profile' }).click()
  await email.fill('me@inputs.test')
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => readProfile().profile.email, { timeout: 15_000 }).toBe('me@inputs.test')
})

test('the Site URL field: typing is never rewritten, a bad URL is not saved and never blocks, an empty one leaves the file', async ({ page }) => {
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
  await expect(blocked(page)).toHaveCount(0)
  expect(readProfile().site?.url).toBe('https://inputs.example')

  await clear(url)
  await url.blur()
  await expect(panel.locator('#s-url-error')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(readProfile().site?.url).toBeUndefined()
})
