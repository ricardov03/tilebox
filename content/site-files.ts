/**
 * Names and paths of the generated site assets (WP10b): the favicon set, the
 * web manifest and the social preview image in `public/site/` (ignored by git).
 * Node built-ins only, no sharp, no satori: modules/public-profile.ts loads
 * this file at config time. The builder is ./site-assets.ts.
 *
 * Paths come from `ROOT` in ./resolve.ts, never from this file's location:
 * Nitro bundles this module into `.nuxt/` (NOTES.md, WP7 regression fix).
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SiteAssets } from '../types/site'
import { ROOT } from './resolve'

/** The public folder the page sees as `/site/`. */
export const SITE_PUBLIC_DIR = '/site'
export const SITE_DIR = resolve(ROOT, 'public/site')
/** Your own favicon and social image uploads. Ignored by git. The page sees `/site-uploads/`. */
export const SITE_UPLOADS_PUBLIC_DIR = '/site-uploads'
export const SITE_UPLOADS_DIR = resolve(ROOT, 'public/site-uploads')

export const SITE_FILES = {
  ogImage: 'og.png',
  faviconIco: 'favicon.ico',
  iconSvg: 'icon.svg',
  appleTouchIcon: 'apple-touch-icon.png',
  icon192: 'icon-192.png',
  icon512: 'icon-512.png',
  iconMask: 'icon-mask.png',
  manifest: 'manifest.webmanifest',
} as const

export type SiteFileKey = keyof typeof SITE_FILES

/**
 * The generated files that are on disk right now, as public paths.
 * Feeds `toPublicProfile()`: a missing file = no key = the tracked fallback
 * (`/favicon.ico`, `/og.png`). `dir` is for tests.
 */
export function siteAssetsIfPresent(dir: string = SITE_DIR): SiteAssets {
  const path = (key: SiteFileKey) =>
    existsSync(resolve(dir, SITE_FILES[key])) ? `${SITE_PUBLIC_DIR}/${SITE_FILES[key]}` : undefined
  const assets: SiteAssets = {}
  const keys = ['ogImage', 'faviconIco', 'iconSvg', 'icon192', 'appleTouchIcon', 'manifest'] as const
  for (const key of keys) {
    const value = path(key)
    if (value) assets[key] = value
  }
  return assets
}
