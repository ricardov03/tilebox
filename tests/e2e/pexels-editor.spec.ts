/**
 * The Pexels tab of the image field, on `nuxt dev` (the `dev` project). WP12.
 * No real Pexels call: `/api/images/pexels/*` and `https://images.pexels.com/**` are answered by
 * `page.route`. The last block of tests talks to the REAL routes, but only with requests that are
 * refused before any network call (guards and input checks), so they need no key and use no quota.
 * Writes content/profile.json (backed up, restored) and one `public/blocks/pexels-*.webp` (removed).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import sharp from 'sharp'
import { PERSONAL_PROFILE_PATH as PROFILE_PATH, readProfile, ROOT } from './helpers'

const BACKUP = `${PROFILE_PATH}.e2e-pexels-backup`
const BLOCKS_DIR = resolve(ROOT, 'public/blocks')
const PICKED_ID = 424242
const PICKED_SRC = `/blocks/pexels-${PICKED_ID}.webp`
const PICKED_FILE = resolve(ROOT, `public${PICKED_SRC}`)
/** 1x1 transparent PNG, the answer for every thumbnail. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

function photo(id: number, photographer: string) {
  return {
    id,
    width: 4000,
    height: 3000,
    alt: `A desk, photo ${id}`,
    avgColor: '#8899AA',
    photographer,
    photographerUrl: `https://www.pexels.com/@${photographer.toLowerCase().replace(/\s+/g, '-')}`,
    pageUrl: `https://www.pexels.com/photo/desk-${id}/`,
    thumb: `https://images.pexels.com/photos/${id}/t.jpeg?h=350`,
    preview: `https://images.pexels.com/photos/${id}/t.jpeg?h=650&w=940`,
  }
}

const PAGE_ONE = [photo(111111, 'Ada Example'), photo(PICKED_ID, 'Grace Sample'), photo(333333, 'Linus Test')]
const PAGE_TWO = [photo(444444, 'Page Two')]

function pickAnswer(id: number) {
  const picked = [...PAGE_ONE, ...PAGE_TWO].find(item => item.id === id) ?? PAGE_ONE[0]!
  return {
    src: PICKED_SRC,
    width: 1600,
    height: 1200,
    alt: picked.alt,
    source: { provider: 'pexels', id: String(id), url: picked.pageUrl, author: picked.photographer, authorUrl: picked.photographerUrl },
  }
}

interface Mocks {
  searches: URL[]
  picks: unknown[]
  foreign: string[]
}

/** Mocks the three routes and the image host. Any other foreign request is recorded (and must stay empty). */
async function mockPexels(page: Page, options: { configured?: boolean, search?: (route: Route, url: URL) => Promise<void> } = {}): Promise<Mocks> {
  const mocks: Mocks = { searches: [], picks: [], foreign: [] }
  await page.route('https://images.pexels.com/**', route => route.fulfill({ contentType: 'image/png', body: TINY_PNG }))
  await page.route('**/api/images/pexels/status', route => route.fulfill({ json: { configured: options.configured ?? true } }))
  await page.route('**/api/images/pexels/search*', async (route) => {
    const url = new URL(route.request().url())
    mocks.searches.push(url)
    if (options.search) return options.search(route, url)
    const pageNumber = Number(url.searchParams.get('page') ?? '1')
    await route.fulfill({ json: { photos: pageNumber === 1 ? PAGE_ONE : PAGE_TWO, page: pageNumber, hasMore: pageNumber === 1, rateLimit: { remaining: 187, reset: 1789725600 } } })
  })
  await page.route('**/api/images/pexels/pick', async (route) => {
    const body = route.request().postDataJSON() as { id: number }
    mocks.picks.push(body)
    await route.fulfill({ json: pickAnswer(body.id) })
  })
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.hostname !== 'localhost' && url.hostname !== 'images.pexels.com' && url.protocol.startsWith('http')) mocks.foreign.push(request.url())
  })
  return mocks
}

async function openImageForm(page: Page): Promise<void> {
  await page.route('**/api/unfurl', route => route.fulfill({ json: { ok: false, reason: 'mocked in tests' } }))
  await page.goto('/edit')
  await page.locator('li[data-id]').first().waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: /^Edit Image block: / }).first().click()
}

async function openPexelsTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Pexels' }).click()
  await expect(page.locator('[data-pexels]')).toBeVisible()
}

function imageBlockId(): string {
  const block = readProfile().blocks.find(item => item.type === 'image')
  if (!block) throw new Error('the sample data has no image block')
  return block.id
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  copyFileSync(PROFILE_PATH, BACKUP)
  mkdirSync(BLOCKS_DIR, { recursive: true })
  // The file the mocked pick route "saved": the preview tile loads it like a real one.
  writeFileSync(PICKED_FILE, await sharp({ create: { width: 64, height: 48, channels: 3, background: '#336699' } }).webp().toBuffer())
})

test.afterAll(() => {
  if (existsSync(BACKUP)) {
    writeFileSync(PROFILE_PATH, readFileSync(BACKUP))
    rmSync(BACKUP)
  }
  for (const name of readdirSync(BLOCKS_DIR)) {
    if (name.startsWith('pexels-')) rmSync(resolve(BLOCKS_DIR, name), { force: true })
  }
})

test('the image field has two tabs, and "Upload" is the same field as before', async ({ page }) => {
  await mockPexels(page)
  await openImageForm(page)
  const tabs = page.getByRole('tablist', { name: 'Image source' })
  await expect(tabs.getByRole('tab')).toHaveText(['Upload', 'Pexels'])
  await expect(tabs.getByRole('tab', { name: 'Upload' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('form input[type="file"]')).toBeAttached()
  await expect(page.locator('form input[id$="-src"]')).toBeVisible()
  // Arrow keys move between the tabs.
  await tabs.getByRole('tab', { name: 'Upload' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.getByRole('tab', { name: 'Pexels' })).toBeFocused()
  await expect(tabs.getByRole('tab', { name: 'Pexels' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('form input[id$="-src"]')).toBeHidden()
})

test('no key: three steps, the link opens in a new tab, "Check again" finds a new key', async ({ page }) => {
  let configured = false
  await mockPexels(page)
  await page.route('**/api/images/pexels/status', route => route.fulfill({ json: { configured } }))
  await openImageForm(page)
  await openPexelsTab(page)

  const help = page.locator('[data-pexels-nokey]')
  await expect(help).toContainText('Pexels needs a free key')
  await expect(help.locator('ol > li')).toHaveCount(3)
  await expect(help).toContainText('The key stays on this machine')
  const link = help.getByRole('link', { name: 'pexels.com/api' })
  await expect(link).toHaveAttribute('href', 'https://www.pexels.com/api/')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.getByLabel('Search Pexels')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Photos provided by Pexels' })).toHaveAttribute('href', 'https://www.pexels.com')

  configured = true
  await help.getByRole('button', { name: 'Check again' }).click()
  await expect(page.getByLabel('Search Pexels')).toBeVisible()
})

test('search -> grid -> pick -> the block has src, alt and source -> save writes them', async ({ page }) => {
  const id = imageBlockId()
  const mocks = await mockPexels(page)
  await openImageForm(page)
  await openPexelsTab(page)

  // The sample image block is 2x2: the shape is preset to "square".
  await expect(page.getByLabel('Shape')).toHaveValue('square')

  // One letter searches nothing. Two letters search after the idle time, without Enter.
  const box = page.getByLabel('Search Pexels')
  await box.fill('d')
  await page.waitForTimeout(1100)
  expect(mocks.searches).toHaveLength(0)
  await box.fill('desk')
  const grid = page.locator('[data-pexels-grid]')
  await expect(grid.locator('button[data-pexels-photo]')).toHaveCount(3, { timeout: 10_000 })
  expect(mocks.searches).toHaveLength(1)
  expect(Object.fromEntries(mocks.searches[0]!.searchParams)).toEqual({ q: 'desk', page: '1', orientation: 'square' })
  await expect(grid).toContainText('Ada Example')
  await expect(page.locator('[data-pexels]')).toContainText('187 requests left')
  await expect(grid.locator('button[data-pexels-photo]').first()).toHaveAccessibleName('A desk, photo 111111. Photo by Ada Example')

  // Load more adds page 2 and moves the focus to its first photo.
  await page.locator('[data-pexels-more]').click()
  await expect(grid.locator('button[data-pexels-photo]')).toHaveCount(4)
  await expect(grid.locator('button[data-photo-id="444444"]')).toBeFocused()
  await expect(page.locator('[data-pexels-more]')).toHaveCount(0)

  await grid.locator(`button[data-photo-id="${PICKED_ID}"]`).click()
  expect(mocks.picks).toEqual([{ id: PICKED_ID, size: 'large2x' }])

  // The preview tile is the real ImageBlock: the local file, the Pexels alt (the sample alt was replaced), the credit.
  const tile = page.locator(`li[data-id="${id}"]`)
  await expect(tile.locator('img')).toHaveAttribute('src', PICKED_SRC)
  await expect(tile.locator('img')).toHaveAttribute('alt', `A desk, photo ${PICKED_ID}`)
  const credit = tile.locator('[data-photo-credit]')
  await expect(credit).toHaveText('Photo by Grace Sample on Pexels')
  const links = credit.getByRole('link')
  await expect(links).toHaveCount(2)
  await expect(links.nth(0)).toHaveAttribute('href', 'https://www.pexels.com/@grace-sample')
  await expect(links.nth(1)).toHaveAttribute('href', `https://www.pexels.com/photo/desk-${PICKED_ID}/`)
  for (const index of [0, 1]) {
    await expect(links.nth(index)).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(links.nth(index)).toHaveAttribute('target', '_blank')
  }

  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  const saved = readProfile().blocks.find(block => block.id === id)
  expect(saved).toMatchObject({
    type: 'image',
    src: PICKED_SRC,
    alt: `A desk, photo ${PICKED_ID}`,
    source: { provider: 'pexels', id: String(PICKED_ID), url: `https://www.pexels.com/photo/desk-${PICKED_ID}/`, author: 'Grace Sample', authorUrl: 'https://www.pexels.com/@grace-sample' },
  })
  expect(mocks.foreign).toEqual([])
})

test('the owner\'s own alt text stays, and a local file clears the Pexels source', async ({ page }) => {
  const id = imageBlockId()
  await mockPexels(page)
  await openImageForm(page)
  const tile = page.locator(`li[data-id="${id}"]`)
  await expect(tile.locator('[data-photo-credit]')).toHaveText('Photo by Grace Sample on Pexels')

  await page.locator('form input[id$="-alt"]').fill('My own words for this photo')
  await openPexelsTab(page)
  await page.getByLabel('Search Pexels').fill('desk')
  await page.getByLabel('Search Pexels').press('Enter')
  await page.locator('button[data-photo-id="111111"]').click()
  await expect(tile.locator('[data-photo-credit]')).toHaveText('Photo by Ada Example on Pexels')
  await expect(tile.locator('img')).toHaveAttribute('alt', 'My own words for this photo')

  await page.getByRole('tab', { name: 'Upload' }).click()
  await page.locator('form input[id$="-src"]').fill('/blocks/sample.jpg')
  await expect(tile.locator('[data-photo-credit]')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(readProfile().blocks.find(block => block.id === id)).toMatchObject({ src: '/blocks/sample.jpg', source: null })
})

test('after a pick the alt FIELD and the path field follow the block (a change from outside, no focus in the field)', async ({ page }) => {
  const id = imageBlockId()
  await mockPexels(page)
  await openImageForm(page)
  const altField = page.locator('form input[id$="-alt"]')
  const srcField = page.locator('form input[id$="-src"]')
  const tile = page.locator(`li[data-id="${id}"]`)

  // A text that starts with the sample text is not the owner's own: the next pick may replace it.
  await altField.fill('Sample image, to be replaced')
  await altField.blur()
  await expect(tile.locator('img')).toHaveAttribute('alt', 'Sample image, to be replaced')

  await openPexelsTab(page)
  await page.getByLabel('Search Pexels').fill('desk')
  await page.getByLabel('Search Pexels').press('Enter')
  await page.locator('button[data-photo-id="333333"]').click()
  await expect(tile.locator('img')).toHaveAttribute('alt', 'A desk, photo 333333')
  await expect(altField).toHaveValue('A desk, photo 333333')
  await expect(srcField).toHaveValue(PICKED_SRC)
  await expect(page.locator('form [data-field-error]')).toHaveCount(0)
  await expect(page.locator('[data-field-problems]')).toHaveCount(0)

  // The text this field filled in is still not the owner's own: the next pick replaces it again.
  await page.locator('button[data-photo-id="111111"]').click()
  await expect(altField).toHaveValue('A desk, photo 111111')

  // The owner's words win from here on: typed text is committed and the next pick keeps it.
  await altField.fill('A tidy desk by the window')
  await altField.blur()
  await page.locator(`button[data-photo-id="${PICKED_ID}"]`).click()
  await expect(tile.locator('[data-photo-credit]')).toHaveText('Photo by Grace Sample on Pexels')
  await expect(altField).toHaveValue('A tidy desk by the window')
  await expect(tile.locator('img')).toHaveAttribute('alt', 'A tidy desk by the window')
  // Not saved: the next test loads the file again.
})

test('keyboard only: Enter searches, arrow keys move in the grid, Enter picks', async ({ page }) => {
  const mocks = await mockPexels(page)
  await openImageForm(page)
  await openPexelsTab(page)

  const box = page.getByLabel('Search Pexels')
  await box.fill('desk')
  await box.press('Enter')
  const buttons = page.locator('button[data-pexels-photo]')
  await expect(buttons).toHaveCount(3)
  // Enter did not submit the block form, and the idle timer adds no second search.
  await page.waitForTimeout(1100)
  expect(mocks.searches).toHaveLength(1)

  // The grid is ONE tab stop.
  await expect(buttons.nth(0)).toHaveAttribute('tabindex', '0')
  await expect(buttons.nth(1)).toHaveAttribute('tabindex', '-1')
  await buttons.nth(0).focus()
  await page.keyboard.press('ArrowRight')
  await expect(buttons.nth(1)).toBeFocused()
  await page.keyboard.press('End')
  await expect(buttons.nth(2)).toBeFocused()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowLeft')
  await expect(buttons.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect.poll(() => mocks.picks).toEqual([{ id: PICKED_ID, size: 'large2x' }])
  await expect(page.locator('[data-pexels]')).toContainText(`Saved as ${PICKED_SRC}`)
})

test('rate limit, wrong key, empty result and offline each say what to do', async ({ page }) => {
  let mode: 'rate' | 'key' | 'empty' | 'down' = 'rate'
  await mockPexels(page, {
    search: async (route) => {
      if (mode === 'rate') return route.fulfill({ status: 429, json: { statusCode: 429, statusMessage: 'Pexels rate limit reached, try again at 14:05', data: { reset: 1789725900 } } })
      if (mode === 'key') return route.fulfill({ status: 401, json: { statusCode: 401, statusMessage: 'The Pexels key is wrong' } })
      if (mode === 'down') return route.fulfill({ status: 502, json: { statusCode: 502, statusMessage: 'Cannot reach Pexels (offline or unknown host)' } })
      return route.fulfill({ json: { photos: [], page: 1, hasMore: false, rateLimit: { remaining: 10, reset: null } } })
    },
  })
  await openImageForm(page)
  await openPexelsTab(page)
  const box = page.getByLabel('Search Pexels')
  const problem = page.locator('[data-pexels-problem]')

  await box.fill('desk')
  await box.press('Enter')
  await expect(problem).toHaveAttribute('data-pexels-problem', 'rate')
  await expect(problem).toHaveText('Pexels rate limit reached, try again at 14:05')
  await expect(problem).toHaveAttribute('role', 'alert')

  mode = 'key'
  await box.press('Enter')
  await expect(problem).toHaveAttribute('data-pexels-problem', 'key')
  await expect(problem).toContainText('The Pexels key is wrong')

  mode = 'down'
  await box.press('Enter')
  await expect(problem).toHaveAttribute('data-pexels-problem', 'offline')
  await expect(problem).toContainText('Cannot reach Pexels')

  mode = 'empty'
  await box.fill('zzzzqqq')
  await box.press('Enter')
  await expect(page.locator('[data-pexels]')).toContainText('No photos for "zzzzqqq"')
  await expect(problem).toHaveCount(0)
  await expect(page.locator('[data-pexels-grid]')).toHaveCount(0)

  await page.context().setOffline(true)
  await box.fill('mountains')
  await box.press('Enter')
  await expect(problem).toHaveAttribute('data-pexels-problem', 'offline')
  await expect(problem).toContainText('You are offline')
  await page.context().setOffline(false)
})

test.describe('the real routes: guards and input checks (no key needed, no Pexels call)', () => {
  test('status answers { configured } and nothing else', async ({ request }) => {
    const response = await request.get('/api/images/pexels/status')
    expect(response.status()).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(Object.keys(body)).toEqual(['configured'])
    expect(typeof body.configured).toBe('boolean')
  })

  test('a request from another site is refused on all three routes', async ({ request }) => {
    const headers = { 'origin': 'https://evil.test', 'sec-fetch-site': 'cross-site' }
    expect((await request.get('/api/images/pexels/status', { headers })).status()).toBe(403)
    expect((await request.get('/api/images/pexels/search?q=desk', { headers })).status()).toBe(403)
    expect((await request.post('/api/images/pexels/pick', { headers, data: { id: 1 } })).status()).toBe(403)
    expect((await request.get('/api/images/pexels/search?q=desk', { headers: { host: 'evil.test' } })).status()).toBe(403)
  })

  test('search refuses bad input with 400', async ({ request }) => {
    for (const query of ['', '?q=', `?q=${'x'.repeat(81)}`, '?q=desk&page=0', '?q=desk&page=51', '?q=desk&orientation=wide', '?q=desk&per_page=80']) {
      expect((await request.get(`/api/images/pexels/search${query}`)).status(), query).toBe(400)
    }
  })

  test('pick takes JSON with a number id only: never a URL, never a form post', async ({ request }) => {
    expect((await request.post('/api/images/pexels/pick', { headers: { 'content-type': 'text/plain' }, data: '{"id":1}' })).status()).toBe(415)
    expect((await request.post('/api/images/pexels/pick', { form: { id: '1' } })).status()).toBe(415)
    for (const data of [{}, { id: '1' }, { id: -1 }, { id: 1, size: 'original' }, { id: 1, url: 'https://images.pexels.com/x.jpg' }, { url: 'http://127.0.0.1/' }]) {
      expect((await request.post('/api/images/pexels/pick', { data })).status(), JSON.stringify(data)).toBe(400)
    }
    expect(readdirSync(BLOCKS_DIR).filter(name => name.startsWith('pexels-') && name !== `pexels-${PICKED_ID}.webp`)).toEqual([])
  })
})
