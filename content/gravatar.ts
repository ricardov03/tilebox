/**
 * Avatar from the email (Gravatar): the LIGHT half. Names, paths, the hash and "is the file there?".
 * Callers: `modules/public-profile.ts` (config time), `content/site-assets.ts`, the dev-only route
 * `GET /api/avatar/gravatar` (Nitro, a static import) and `content/gravatar-fetch.ts`.
 *
 * The download lives in `content/gravatar-fetch.ts`, NOT here: it needs the guarded request of
 * `content/unfurl.ts` and sharp, and a static import of this file by a Nitro route must never pull that
 * engine into a production build (`.output/server`). Same split as `content/pexels.ts` and its routes.
 *
 * The picture is stored as `public/avatar.gravatar.webp` (ignored by git, rule `public/avatar.*`). The
 * public page only loads that local file. It never talks to gravatar.com.
 *
 * Paths come from `ROOT` in ./resolve.ts, never from this file's location:
 * Nitro bundles this module into `.nuxt/` (NOTES.md, WP7 regression fix).
 * Node built-ins only. No Vue or Nuxt imports: tsx runs this file.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { GRAVATAR_PUBLIC_PATH } from '../types/profile'
import { ROOT } from './resolve'

/** The path the page uses. It lives in types/profile.ts (client-safe): the editor page imports it too. */
export { GRAVATAR_PUBLIC_PATH }
/** The file on disk. */
export const GRAVATAR_FILE = resolve(ROOT, `public${GRAVATAR_PUBLIC_PATH}`)
/**
 * The name of the file before WP15. It held the bytes of gravatar.com as they came. A successful
 * download (and a 404 that may delete) removes it, next to the file it writes.
 */
export const GRAVATAR_LEGACY_NAME = 'avatar.gravatar.jpg'

/**
 * The only hosts the download may talk to, `https:` only, on every redirect hop (`onlyHosts` of the
 * guarded request). Measured on 2026-09-18: all three answer 200 or 404 directly, with no redirect
 * and no other image host.
 */
export const GRAVATAR_HOSTS: readonly string[] = ['gravatar.com', 'www.gravatar.com', 'secure.gravatar.com']

const SIZE_PX = 256

export type GravatarStatus = 'saved' | 'none' | 'offline'

export interface GravatarResult {
  status: GravatarStatus
  /** One log line, no trailing newline. */
  message: string
}

/** Gravatar's key: sha256 of the trimmed, lower-case email. */
export function gravatarHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

/** `d=404`: no default picture, a 404 instead. Gravatar picks the format (JPEG or PNG); the stored file is always a new WebP. */
export function gravatarUrl(email: string): string {
  return `https://gravatar.com/avatar/${gravatarHash(email)}?s=${SIZE_PX}&d=404`
}

export function gravatarFileExists(): boolean {
  return existsSync(GRAVATAR_FILE)
}

/** `/avatar.gravatar.webp` when the file is on disk, else undefined. Feeds `toPublicProfile()`. */
export function gravatarPathIfPresent(): string | undefined {
  return gravatarFileExists() ? GRAVATAR_PUBLIC_PATH : undefined
}
