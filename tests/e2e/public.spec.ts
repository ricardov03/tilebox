/**
 * Public page, prerendered `dist/`. Server: scripts/serve-dist.mjs.
 */
import { expect, test } from '@playwright/test'
import { columnsOf, readProfile, THEME_KEY, tileLefts } from './helpers'

const profile = readProfile()
const GRID = 'ul[aria-label="Tiles"]'
const TILES = `${GRID} > li`
const TOGGLE = 'button[aria-label^="Theme:"]'

test('has one h1 with the profile name', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText(profile.profile.name)
  await expect(page).toHaveTitle(profile.profile.name)
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

test('never calls api.iconify.design', async ({ page }) => {
  const iconify: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('api.iconify.design')) iconify.push(request.url())
  })
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.locator(TOGGLE).click()
  await page.locator(TOGGLE).click()
  await page.waitForLoadState('networkidle')
  expect(iconify).toEqual([])
  // Icons are inline SVG in the prerendered HTML.
  await expect(page.locator('a[href*="github.com"] svg').first()).toBeVisible()
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
