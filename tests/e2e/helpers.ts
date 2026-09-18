import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { parseProfile, type Profile } from '../../types/profile'

import { PERSONAL_PROFILE_PATH, profileIsPersonal, profilePath, ROOT } from '../../content/resolve'

/** Same resolution as the build: content/profile.json when it exists, else the example. `ROOT` comes from the resolver, which anchors on its own location. */
export { PERSONAL_PROFILE_PATH, profileIsPersonal, profilePath, ROOT }

/** The content the site was built from, validated with the same schema the app uses. Resolved on every call. */
export function readProfile(): Profile {
  return parseProfile(JSON.parse(readFileSync(profilePath(), 'utf8')))
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

/**
 * Wait for every running CSS animation (the page-load stagger) to finish.
 * Endless animations (the ping halo of the status dot) never finish, so they are skipped.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(
    document.getAnimations()
      .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
      .map(a => a.finished.catch(() => undefined)),
  ))
}
