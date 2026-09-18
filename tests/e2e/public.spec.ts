/**
 * Public page, prerendered `dist/`. Server: scripts/serve-dist.mjs.
 */
import { expect, test } from '@playwright/test'
import { siteTitle } from '../../app/utils/site-head'
import { columnsOf, profileIsPersonal, readProfile, THEME_KEY, tileLefts } from './helpers'

const profile = readProfile()
const GRID = 'ul[aria-label="Tiles"]'
const TILES = `${GRID} > li`
const TOGGLE = 'button[aria-label^="Theme:"]'

test('has one h1 with the profile name', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText(profile.profile.name)
  // WP10b: the title is `site.title`, else the name plus the handle.
  await expect(page).toHaveTitle(siteTitle(profile.profile, profile.site))
})

test('highlights render as a list under the bio', async ({ page }) => {
  await page.goto('/')
  const { highlights } = profile.profile
  const list = page.locator('ul[aria-label="Highlights"]')
  // The tracked example has 3. A personal file may have fewer; an empty list renders nothing.
  if (!profileIsPersonal()) expect(highlights).toHaveLength(3)
  if (highlights.length === 0) {
    await expect(list).toHaveCount(0)
    return
  }
  await expect(list.locator('> li')).toHaveCount(highlights.length)
  await expect(list.locator('> li')).toHaveText(highlights)
})

test('the email shows as a mailto link only when showEmail is true', async ({ page }) => {
  await page.goto('/')
  const { email, showEmail } = profile.profile
  if (!profileIsPersonal()) expect(showEmail).toBe(false)
  const link = page.locator(`a[href="mailto:${email}"]`)
  if (showEmail) {
    await expect(link).toHaveCount(1)
    await expect(link).toContainText(email)
    return
  }
  await expect(link).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(email)
  // The example has no mailto link at all.
  if (!profileIsPersonal()) await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
})

test('the status dot pulses and is hidden from assistive tech', async ({ page }) => {
  test.skip(!profile.profile.status, 'profile has no status')
  await page.goto('/')
  const dot = page.locator('h1 ~ p span[aria-hidden="true"]').first()
  await expect(dot).toHaveClass(/animate-pulse/)
  expect(await dot.evaluate(el => getComputedStyle(el).animationName)).toBe('pulse')
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the status dot does not pulse', async ({ page }) => {
    test.skip(!profile.profile.status, 'profile has no status')
    await page.goto('/')
    const dot = page.locator('h1 ~ p span[aria-hidden="true"]').first()
    expect(await dot.evaluate(el => getComputedStyle(el).animationName)).toBe('none')
  })
})

test('shows 4 columns at 1280', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(page.locator(TILES)).toHaveCount(profile.blocks.length + 1)
  expect(await columnsOf(page, GRID)).toBe(4)
  // Tiles start in at least 3 distinct columns and the widest spans the full 4-column width.
  const lefts = await tileLefts(page, TILES)
  expect(lefts.length).toBeGreaterThanOrEqual(3)
  const grid = await page.locator(GRID).boundingBox()
  const section = await page.locator(`${TILES}:has(h2)`).last().boundingBox()
  expect(Math.round(section!.width)).toBe(Math.round(grid!.width))
})

test('shows 2 columns at 390 and follows layout.mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await columnsOf(page, GRID)).toBe(2)
  expect((await tileLefts(page, TILES)).length).toBe(2)

  // The sample data puts the image tile before the social tiles on phones only.
  const mobile = profile.layout.mobile ?? profile.layout.desktop
  const imageId = profile.blocks.find(b => b.type === 'image')?.id
  const socialId = profile.blocks.find(b => b.type === 'social')?.id
  test.skip(!imageId || !socialId, 'sample data has no image or social block')
  expect(mobile.indexOf(imageId!)).toBeLessThan(mobile.indexOf(socialId!))

  const image = page.locator(`${TILES}:has(img[src$="sample.jpg"])`).first()
  const social = page.locator(`${TILES}:has(a[href*="github.com"])`).first()
  const [imageBox, socialBox] = await Promise.all([image.boundingBox(), social.boundingBox()])
  expect(imageBox).not.toBeNull()
  expect(socialBox).not.toBeNull()
  expect(imageBox!.y).toBeLessThan(socialBox!.y)
})

test('theme toggle cycles system -> light -> dark and persists', async ({ page }) => {
  await page.goto('/')
  const toggle = page.locator(TOGGLE)
  await expect(toggle).toHaveAttribute('aria-label', 'Theme: system. Switch to light.')

  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(toggle).toHaveAttribute('aria-label', 'Theme: light. Switch to dark.')
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe('light')

  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe('dark')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-label', 'Theme: dark. Switch to system.')

  await page.locator(TOGGLE).click()
  expect(await page.evaluate(key => localStorage.getItem(key), THEME_KEY)).toBe('system')
})

test.describe('dark OS, mode system', () => {
  test.use({ colorScheme: 'dark' })

  test('is dark before hydration, no light flash', async ({ page }) => {
    test.skip(profile.profile.theme.mode !== 'system', 'profile mode is fixed')
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
    await page.waitForLoadState('load')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})

test('never requests another origin or an /api/ path', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).host
  const foreign: string[] = []
  const api: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.host !== origin) foreign.push(request.url())
    if (url.pathname.startsWith('/api/')) api.push(request.url())
  })
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.locator(TOGGLE).click()
  await page.locator(TOGGLE).click()
  await page.waitForLoadState('networkidle')
  // Icons and fonts are inline or local. api.iconify.design is one of the hosts this catches.
  expect(foreign).toEqual([])
  expect(api).toEqual([])
  // Icons are inline SVG in the prerendered HTML.
  await expect(page.locator('a[href*="github.com"] svg').first()).toBeVisible()
})

test('the editor and its API do not exist in the static output', async ({ request }) => {
  for (const path of ['/edit', '/api/profile']) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
  }
})

test('video tile loads its iframe only after the play button', async ({ page }) => {
  await page.route('**/*youtube-nocookie.com/**', route => route.fulfill({ status: 200, body: '' }))
  await page.goto('/')
  await expect(page.locator('iframe')).toHaveCount(0)
  const play = page.locator('button[aria-label^="Play "]')
  await expect(play).toHaveCount(1)
  await play.click()
  const frame = page.locator('iframe')
  await expect(frame).toHaveCount(1)
  await expect(frame).toHaveAttribute('src', /youtube-nocookie\.com\/embed\//)
})
