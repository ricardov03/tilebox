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
import type { Block, Profile } from '../../types/profile'

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

/** What the mocked POST /api/unfurl saw. */
interface UnfurlCall {
  url: string
  showImage: boolean
  force: boolean
}

/**
 * The link form calls POST /api/unfurl, which reads a real website. No test may do that:
 * `openEditor` answers every call with a failure. A test that needs an answer calls
 * `mockUnfurl` AFTER `openEditor` (the route added last wins).
 */
async function mockUnfurl(page: Page, answer: Record<string, unknown>): Promise<UnfurlCall[]> {
  const calls: UnfurlCall[] = []
  await page.route('**/api/unfurl', async (route) => {
    calls.push(route.request().postDataJSON() as UnfurlCall)
    await route.fulfill({ json: answer })
  })
  return calls
}

const FETCHED = {
  ok: true,
  cached: false,
  url: 'https://unfurl.test/page',
  finalUrl: 'https://unfurl.test/page',
  title: 'Fetched title',
  description: 'Fetched description',
  siteName: 'Unfurl Test Site',
  source: 'html',
  fetchedAt: '2026-09-18T00:00:00.000Z',
}

/** Open a block's form from the list. The editor may come back from a reload with a form open: close it first. */
async function selectFromList(page: Page, id: string): Promise<void> {
  const back = page.getByRole('button', { name: 'All blocks' })
  if (await back.isVisible()) await back.click()
  await page.locator(`[data-select-block="${id}"]`).click()
}

async function openEditor(page: Page): Promise<void> {
  await mockUnfurl(page, { ok: false, reason: 'mocked in tests' })
  await page.goto('/edit')
  await page.locator('li[data-id]').first().waitFor({ timeout: 60_000 })
}

async function save(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
}

/** Ids of the preview tiles, in the order shown. */
function previewIds(page: Page): Promise<(string | null)[]> {
  return page.locator('li[data-id]').evaluateAll(els => els.map(el => el.getAttribute('data-id')))
}

/** The block's short name, read from its row: the delete button is named "Delete <name>". */
async function rowLabel(page: Page, id: string): Promise<string> {
  const name = await page.locator(`[data-delete-block="${id}"]`).getAttribute('aria-label')
  expect(name).toMatch(/^Delete .+/)
  return (name ?? '').replace(/^Delete /, '')
}

/** A block that is not first and not last in the desktop layout, so "next row" and "previous index" mean something. */
function middleBlock(profile: Profile): Block {
  const id = profile.layout.desktop[Math.floor(profile.layout.desktop.length / 2)]
  const block = profile.blocks.find(b => b.id === id)
  if (!block) throw new Error('the sample layout has no middle block')
  return block
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

test('"No" and Escape in the list row confirm keep the block', async ({ page }) => {
  const before = readFileSync(PROFILE_PATH, 'utf8')
  const block = middleBlock(readProfile())
  await openEditor(page)

  const deleteButton = page.locator(`[data-delete-block="${block.id}"]`)
  const label = await rowLabel(page, block.id)
  await deleteButton.click()

  // The row's right side is now the confirm, and the focus is on "No".
  const confirm = page.getByRole('group', { name: `Delete ${label}?` })
  await expect(confirm).toContainText('Delete?')
  await expect(deleteButton).toHaveCount(0)
  await expect(confirm.getByRole('button', { name: 'No' })).toBeFocused()

  await confirm.getByRole('button', { name: 'No' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(deleteButton).toBeFocused()

  await deleteButton.click()
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(deleteButton).toBeFocused()

  await expect(page.locator(`li[data-id="${block.id}"]`)).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  expect(readFileSync(PROFILE_PATH, 'utf8')).toBe(before)
})

test('Delete on a selected tile opens the confirm, the tile button deletes, Undo restores both layouts', async ({ page }) => {
  const profile = readProfile()
  const block = middleBlock(profile)
  await openEditor(page)
  const label = await rowLabel(page, block.id)
  const desktopBefore = await previewIds(page)
  await page.getByRole('radio', { name: 'Mobile' }).click()
  const mobileBefore = await previewIds(page)
  await page.getByRole('radio', { name: 'Desktop' }).click()

  // Select the tile. Inside a field the keys belong to the text (caret at the edge, so nothing changes).
  const tile = page.locator(`li[data-id="${block.id}"]`)
  const editButton = tile.locator('button[data-editor-control][aria-pressed]')
  await editButton.click()
  const field = page.locator('form input[type="text"], form input[type="url"]').first()
  await field.focus()
  // The caret is set by hand: on macOS the Home and End keys do not move it, and Backspace then eats a letter.
  const caretTo = (edge: 'start' | 'end') => field.evaluate((el, where) => {
    if (!(el instanceof HTMLInputElement)) return
    const at = where === 'start' ? 0 : el.value.length
    el.setSelectionRange(at, at)
  }, edge)
  const valueBefore = await field.inputValue()
  await caretTo('end')
  await page.keyboard.press('Delete')
  await caretTo('start')
  await page.keyboard.press('Backspace')
  await expect(field).toHaveValue(valueBefore)
  await expect(page.locator('[data-delete-confirm]')).toHaveCount(0)

  // Focus on a button: Delete opens the confirm on the tile. Nothing is deleted yet.
  await editButton.focus()
  await page.keyboard.press('Delete')
  const confirm = tile.getByRole('group', { name: `Delete ${label}?` })
  await expect(confirm.getByRole('button', { name: 'No' })).toBeFocused()
  await expect(tile).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(tile).toHaveCount(1)

  // The tile's own delete button: same confirm, no selection change, no drag.
  await page.getByRole('button', { name: 'All blocks' }).click()
  await tile.hover()
  await tile.getByRole('button', { name: `Delete ${label}`, exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add block' })).toBeVisible()
  await confirm.getByRole('button', { name: 'Yes' }).click()
  await expect(tile).toHaveCount(0)
  await expect(page.locator('[data-delete-notice]')).toHaveText('Block deleted.')
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  expect(await previewIds(page)).toEqual(desktopBefore.filter(id => id !== block.id))

  // Undo: same index in both layouts, and the draft equals the saved file again.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('[data-delete-notice]')).toHaveText('Block restored.')
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  expect(await previewIds(page)).toEqual(desktopBefore)
  await page.getByRole('radio', { name: 'Mobile' }).click()
  expect(await previewIds(page)).toEqual(mobileBefore)
  await page.getByRole('radio', { name: 'Desktop' }).click()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()

  // The next change ends the Undo offer.
  await page.locator(`[data-delete-block="${block.id}"]`).click()
  await page.getByRole('group', { name: `Delete ${label}?` }).getByRole('button', { name: 'Yes' }).click()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  await page.getByRole('button', { name: /^Move .* down$/ }).first().click()
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
})

test('deletes a block from its list row, and the save removes it from the file', async ({ page }) => {
  const profile = readProfile()
  const block = middleBlock(profile)
  const nextId = profile.layout.desktop[profile.layout.desktop.indexOf(block.id) + 1]
  await openEditor(page)
  const label = await rowLabel(page, block.id)

  await page.locator(`[data-delete-block="${block.id}"]`).click()
  await page.getByRole('group', { name: `Delete ${label}?` }).getByRole('button', { name: 'Yes' }).click()

  // Gone from the preview and the list. The focus is on the next row.
  await expect(page.locator(`li[data-id="${block.id}"]`)).toHaveCount(0)
  await expect(page.locator(`[data-select-block="${block.id}"]`)).toHaveCount(0)
  await expect(page.locator(`[data-select-block="${nextId}"]`)).toBeFocused()
  await expect(page.locator('[data-delete-notice]')).toHaveText('Block deleted.')

  await save(page)

  const saved = readProfile()
  expect(saved.blocks.some(b => b.id === block.id)).toBe(false)
  expect(saved.layout.desktop).not.toContain(block.id)
  expect(saved.layout.mobile ?? []).not.toContain(block.id)
  expect(saved.blocks).toHaveLength(profile.blocks.length - 1)
})

test('S3: a half-typed URL asks nothing; a whole URL asks after 1.2 s, a paste and a blur ask at once', async ({ page }) => {
  await openEditor(page)
  const calls = await mockUnfurl(page, FETCHED)
  await page.getByRole('button', { name: 'Add block' }).click()
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  const url = page.locator('form input[id$="-url"]')
  await expect(page.locator('form input[id$="-preview-enrich"]')).toBeChecked()

  // Typing. No dot in the host yet: nothing is asked, however long the pause is.
  await url.fill('https://unfurl')
  await page.waitForTimeout(1600)
  expect(calls).toHaveLength(0)
  // The rest of the URL, key by key: every key starts the 1.2 s again, so no partial URL is asked.
  await url.pressSequentially('.test/typed', { delay: 60 })
  await page.waitForTimeout(700)
  expect(calls).toHaveLength(0)
  await expect.poll(() => calls.length, { timeout: 3000 }).toBe(1)
  expect(calls[0]?.url).toBe('https://unfurl.test/typed')

  // Blur: no wait.
  await url.pressSequentially('/more', { delay: 20 })
  const beforeBlur = Date.now()
  await url.blur()
  await expect.poll(() => calls.length, { timeout: 1000 }).toBe(2)
  expect(Date.now() - beforeBlur).toBeLessThan(1000)
  expect(calls[1]?.url).toBe('https://unfurl.test/typed/more')
  // A second blur with the same URL asks nothing.
  await url.focus()
  await url.blur()
  await page.waitForTimeout(300)
  expect(calls).toHaveLength(2)

  // Paste: no wait.
  await url.focus()
  const beforePaste = Date.now()
  await url.evaluate((element) => {
    const input = element as HTMLInputElement
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true }))
    input.value = 'https://unfurl.test/pasted'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect.poll(() => calls.length, { timeout: 1000 }).toBe(3)
  expect(Date.now() - beforePaste).toBeLessThan(1000)
  expect(calls[2]?.url).toBe('https://unfurl.test/pasted')
})

test('a pasted URL loads the link preview, fetched text fills empty fields only, the switches are saved', async ({ page }) => {
  await openEditor(page)
  const calls = await mockUnfurl(page, FETCHED)

  await page.getByRole('button', { name: 'Add block' }).click()
  await page.getByRole('button', { name: 'Link', exact: true }).click()
  const form = page.locator('form')
  const title = form.locator('input[id$="-title"]')
  const description = form.locator('input[id$="-description"]')
  const enrich = form.locator('input[id$="-preview-enrich"]')
  const showImage = form.locator('input[id$="-preview-show-image"]')
  const id = (await page.locator('li[data-id]').last().getAttribute('data-id')) ?? ''

  // A new link starts with the preview on and the image off.
  await expect(enrich).toBeChecked()
  await expect(showImage).not.toBeChecked()
  await expect(form.locator('[data-icon-auto]')).toHaveText('auto')

  await form.locator('input[id$="-url"]').fill('https://unfurl.test/page')
  const card = form.locator('[data-link-card]')
  await expect(card).toContainText('Fetched title')
  await expect(card).toContainText('Unfurl Test Site')
  await expect(card).toContainText('Fetched description')
  expect(calls).toEqual([{ url: 'https://unfurl.test/page', showImage: false, force: false }])

  // The placeholder title and the empty description were filled. The tile shows them.
  await expect(title).toHaveValue('Fetched title')
  await expect(description).toHaveValue('Fetched description')
  await expect(page.locator(`li[data-id="${id}"] a`)).toContainText('Fetched title')
  await expect(form.getByRole('button', { name: 'Use fetched title' })).toHaveCount(0)

  // Your own text wins. The fetched one comes back only on request.
  await title.fill('My own title')
  await form.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => calls.length).toBe(2)
  expect(calls[1]).toEqual({ url: 'https://unfurl.test/page', showImage: false, force: true })
  await expect(title).toHaveValue('My own title')
  await form.getByRole('button', { name: 'Use fetched title' }).click()
  await expect(title).toHaveValue('Fetched title')

  // The second switch asks again, now with the image.
  await showImage.check()
  await expect.poll(() => calls.length).toBe(3)
  expect(calls[2]).toEqual({ url: 'https://unfurl.test/page', showImage: true, force: false })

  await save(page)
  const saved = readProfile().blocks.find(b => b.id === id)
  expect(saved).toMatchObject({
    type: 'link',
    title: 'Fetched title',
    description: 'Fetched description',
    url: 'https://unfurl.test/page',
    enrich: true,
    showImage: true,
    meta: { title: 'Fetched title', siteName: 'Unfurl Test Site', source: 'html', fetchedAt: FETCHED.fetchedAt },
  })

  // The switches are still on after a reload.
  await openEditor(page)
  await selectFromList(page, id)
  await expect(page.locator('form input[id$="-preview-enrich"]')).toBeChecked()
  await expect(page.locator('form input[id$="-preview-show-image"]')).toBeChecked()
  await expect(page.locator('form [data-link-card]')).toContainText('Fetched title')
})

test('a failed fetch shows the reason, and turning the preview off keeps your text', async ({ page }) => {
  const block = readProfile().blocks.find(b => b.type === 'link' && b.enrich)
  if (!block || block.type !== 'link') throw new Error('the test before this one saves a link with the preview on')
  await openEditor(page)
  const calls = await mockUnfurl(page, { ok: false, reason: 'http 403' })
  await selectFromList(page, block.id)
  const form = page.locator('form')

  await form.locator('input[id$="-url"]').fill('https://unfurl.test/blocked')
  await expect(form.locator('[data-link-reason]')).toContainText('http 403')
  expect(calls).toHaveLength(1)
  await expect(form.locator('input[id$="-title"]')).toHaveValue(block.title)

  await form.locator('input[id$="-preview-enrich"]').uncheck()
  await expect(form.locator('[data-link-card]')).toHaveCount(0)
  await expect(form.locator('[data-link-reason]')).toHaveCount(0)
  await expect(form.locator('input[id$="-preview-show-image"]')).toBeDisabled()

  await save(page)
  const saved = readProfile().blocks.find(b => b.id === block.id)
  expect(saved).toMatchObject({ title: block.title, url: 'https://unfurl.test/blocked' })
  expect(saved?.type === 'link' ? saved.description : null).toBe(block.description)
  expect(saved && 'enrich' in saved).toBe(false)
  expect(saved && 'meta' in saved).toBe(false)
  expect(saved && 'favicon' in saved).toBe(false)
  expect(saved && 'image' in saved).toBe(false)
})

test('Hide dims the block, the save keeps it in the file and drops it from the page, Show brings it back', async ({ page }) => {
  const block = readProfile().blocks.find(b => b.type === 'map' && !b.hidden)
  if (!block || block.type !== 'map') throw new Error('the sample has a map block')
  await openEditor(page)
  const tile = page.locator(`li[data-id="${block.id}"]`)
  const rowToggle = page.locator(`[data-hide-block="${block.id}"]`)

  await expect(rowToggle).toHaveAttribute('aria-pressed', 'false')
  await rowToggle.click()
  await expect(rowToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(rowToggle).toHaveText('Show')
  await expect(tile.locator('[data-hidden-badge]')).toHaveText('Hidden')
  await expect(page.locator(`[data-hidden-row="${block.id}"]`)).toHaveCount(1)
  await expect(page.getByText('Unsaved changes')).toBeVisible()

  await save(page)
  expect(readProfile().blocks.find(b => b.id === block.id)).toMatchObject({ hidden: true, label: block.label })
  // The dev server rewrites the sanitized profile a moment after the save.
  // The URL, not the label: the sample's `site.location` (WP10b, public JSON-LD) is the same city as the map label.
  await expect.poll(async () => (await page.request.get('/')).text(), { timeout: 15_000 }).not.toContain(block.url)

  // Back, this time with the control on the tile (next to Delete).
  await openEditor(page)
  await tile.hover()
  await tile.locator(`[data-hide-tile="${block.id}"]`).click()
  await expect(tile.locator('[data-hidden-badge]')).toHaveCount(0)
  await save(page)
  const shown = readProfile().blocks.find(b => b.id === block.id)
  expect(shown && 'hidden' in shown).toBe(false)
  await expect.poll(async () => (await page.request.get('/')).text(), { timeout: 15_000 }).toContain(block.url)
})

test('Duplicate puts a selected copy right after the original in both layouts', async ({ page }) => {
  const before = readProfile()
  const block = before.blocks.find(b => b.type === 'text')
  if (!block || block.type !== 'text' || !block.title) throw new Error('the sample has a text block with a title')
  await openEditor(page)

  await page.locator(`[data-duplicate-block="${block.id}"]`).click()
  // The copy is selected: its form is open, with " copy" on the title. The draft is dirty.
  const form = page.locator('form')
  await expect(form.locator('input[id$="-title"]')).toHaveValue(`${block.title} copy`)
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  const desktop = await previewIds(page)
  const copyId = desktop[desktop.indexOf(block.id) + 1] ?? ''
  expect(before.blocks.some(b => b.id === copyId)).toBe(false)
  await expect(page.locator(`li[data-id="${copyId}"] button[data-editor-control][aria-pressed="true"]`)).toHaveCount(1)

  await page.getByRole('radio', { name: 'Mobile' }).click()
  const mobile = await previewIds(page)
  expect(mobile[mobile.indexOf(block.id) + 1]).toBe(copyId)
  await page.getByRole('radio', { name: 'Desktop' }).click()

  // The same action in the block form: a copy of the copy.
  await form.locator('[data-form-duplicate]').click()
  await expect(form.locator('input[id$="-title"]')).toHaveValue(`${block.title} copy copy`)
  const after = await previewIds(page)
  expect(after.indexOf(copyId)).toBe(after.indexOf(block.id) + 1)
  const secondId = after[after.indexOf(copyId) + 1] ?? ''

  await save(page)
  const saved = readProfile()
  expect(saved.blocks.find(b => b.id === copyId)).toMatchObject({ ...block, id: copyId, title: `${block.title} copy` })
  for (const layout of [saved.layout.desktop, saved.layout.mobile ?? []]) {
    const at = layout.indexOf(block.id)
    expect(layout.slice(at, at + 3)).toEqual([block.id, copyId, secondId])
  }
  expect(saved.blocks).toHaveLength(before.blocks.length + 2)
})

test('the spotlight has one owner: a new one takes it from the old one', async ({ page }) => {
  const links = readProfile().blocks.filter(b => b.type === 'link' && !b.hidden)
  const [first, second] = links
  if (!first || !second) throw new Error('the profile has two visible link blocks at this point')
  await openEditor(page)
  const form = page.locator('form')
  const pick = async (id: string, value: string) => {
    await selectFromList(page, id)
    await form.locator('select[id$="-spotlight"]').selectOption(value)
  }

  await pick(first.id, 'wobble')
  await expect(page.locator(`li[data-id="${first.id}"] [data-spotlight]`)).toHaveAttribute('data-spotlight', 'wobble')
  await expect(form.locator('[data-spotlight-sample]')).toHaveClass(/spotlight-wobble/)
  await expect(page.locator('li[data-id] [data-spotlight]')).toHaveCount(1)

  await pick(second.id, 'buzz')
  await expect(page.locator(`li[data-id="${second.id}"] [data-spotlight]`)).toHaveAttribute('data-spotlight', 'buzz')
  await expect(page.locator(`li[data-id="${first.id}"] [data-spotlight]`)).toHaveCount(0)
  await expect(page.locator('li[data-id] [data-spotlight]')).toHaveCount(1)

  await save(page)
  const spotlights = readProfile().blocks.flatMap(b => (b.type === 'link' && b.spotlight ? [[b.id, b.spotlight]] : []))
  expect(spotlights).toEqual([[second.id, 'buzz']])

  await pick(second.id, '')
  await expect(page.locator('li[data-id] [data-spotlight]')).toHaveCount(0)
})
