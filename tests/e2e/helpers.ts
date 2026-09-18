import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { parseProfile, type Profile } from '../../types/profile'

export const ROOT = resolve(import.meta.dirname, '../..')
export const PROFILE_PATH = resolve(ROOT, 'content/profile.json')

/** The sample content, validated with the same schema the app uses. */
export function readProfile(): Profile {
  return parseProfile(JSON.parse(readFileSync(PROFILE_PATH, 'utf8')))
}

export const THEME_KEY = 'tilebox:theme'

/** Store a theme mode before any script runs, like a returning visitor. */
export async function presetTheme(page: Page, mode: 'system' | 'light' | 'dark'): Promise<void> {
  await page.addInitScript(([key, value]) => {
    window.localStorage.setItem(key, value)
  }, [THEME_KEY, mode] as const)
}

/** Number of column tracks the grid resolved to. */
export async function columnsOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate(el => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length)
}

/** Left edges of the 1-column tiles, sorted and unique. One per column the tiles start in. */
export async function tileLefts(page: Page, selector: string): Promise<number[]> {
  const lefts = await page.locator(selector).evaluateAll(els =>
    els.map(el => Math.round(el.getBoundingClientRect().left)),
  )
  return [...new Set(lefts)].sort((a, b) => a - b)
}

/** Wait for every running CSS animation (the page-load stagger) to finish. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))))
}
