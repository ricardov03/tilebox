/**
 * Avatar from the email (Gravatar). One module for every caller:
 * `scripts/fetch-avatar.ts` (tsx, predev + pregenerate), the dev-only route
 * `POST /api/avatar/gravatar` (Nitro) and `modules/public-profile.ts` (config time).
 *
 * The picture is downloaded to `public/avatar.gravatar.jpg` (ignored by git,
 * rule `public/avatar.*`). The public page only loads that local file. It
 * never talks to gravatar.com.
 *
 * Paths come from `ROOT` in ./resolve.ts, never from this file's location:
 * Nitro bundles this module into `.nuxt/` (NOTES.md, WP7 regression fix).
 * Node built-ins only. No Vue or Nuxt imports: tsx runs this file.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ROOT } from './resolve'

/** The path the page uses. */
export const GRAVATAR_PUBLIC_PATH = '/avatar.gravatar.jpg'
/** The file on disk. */
export const GRAVATAR_FILE = resolve(ROOT, 'public/avatar.gravatar.jpg')

const TIMEOUT_MS = 5000
const MAX_BYTES = 2 * 1024 * 1024
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

/**
 * `d=404`: no default picture, a 404 instead. Gravatar picks the format (JPEG or PNG).
 * The file is always named `.jpg`; browsers read the real format from the bytes.
 */
export function gravatarUrl(email: string): string {
  return `https://gravatar.com/avatar/${gravatarHash(email)}?s=${SIZE_PX}&d=404`
}

export function gravatarFileExists(): boolean {
  return existsSync(GRAVATAR_FILE)
}

/** `/avatar.gravatar.jpg` when the file is on disk, else undefined. Feeds `toPublicProfile()`. */
export function gravatarPathIfPresent(): string | undefined {
  return gravatarFileExists() ? GRAVATAR_PUBLIC_PATH : undefined
}

const OFFLINE: GravatarResult = { status: 'offline', message: 'avatar: offline, kept the old file' }

export interface FetchGravatarOptions {
  /**
   * May a 404 remove the file on disk? True only when `email` is the SAVED
   * email of the profile file (the build script). The editor route passes
   * false for an unsaved draft email, so a try with another email can never
   * delete the picture of the saved profile.
   */
  allowDelete: boolean
}

/**
 * Downloads the Gravatar of `email`. Never throws.
 * - 200 + image + at most 2 MB: writes the file. `saved`.
 * - 404: this email has no Gravatar. `none`. A stale file is removed only with `allowDelete`.
 * - anything else (network error, timeout, 5xx, odd body): the old file stays. `offline`.
 */
export async function fetchGravatar(email: string, options: FetchGravatarOptions): Promise<GravatarResult> {
  try {
    const response = await fetch(gravatarUrl(email), { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
    if (response.status === 404) {
      if (options.allowDelete) await rm(GRAVATAR_FILE, { force: true })
      return { status: 'none', message: 'avatar: no gravatar for this email' }
    }
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !type.startsWith('image/')) return OFFLINE
    if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) return OFFLINE
    const body = Buffer.from(await response.arrayBuffer())
    if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return OFFLINE
    await writeFile(GRAVATAR_FILE, body)
    return { status: 'saved', message: 'avatar: gravatar saved' }
  }
  catch {
    return OFFLINE
  }
}
