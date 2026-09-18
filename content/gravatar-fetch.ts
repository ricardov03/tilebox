/**
 * Avatar from the email (Gravatar): the DOWNLOAD. Callers: `scripts/fetch-avatar.ts` (tsx, predev +
 * pregenerate) and the dev-only route `POST /api/avatar/gravatar` (a dynamic import under
 * `import.meta.dev`, so a production build never bundles this file, `content/unfurl.ts` or sharp).
 *
 * The same rules as the link icons and images (docs/invariants.md 10 and 12):
 * - The request goes through `safeRequest()` of content/unfurl.ts: public addresses only, a pinned
 *   address, redirects by hand, one time budget, and the byte limit applied WHILE the body is read.
 * - `onlyHosts`: every hop must be `https:` on one of `GRAVATAR_HOSTS`. A redirect somewhere else is refused.
 * - At most 2 MB. The magic bytes must say JPEG, PNG or WebP BEFORE any decode. The `Content-Type`
 *   header is not trusted, and an SVG never gets to a decoder.
 * - The remote bytes are never stored. sharp decodes them (4096x4096 pixels at most, `failOn: 'error'`)
 *   and writes a NEW WebP, 512 px at most, with no metadata. The output is sniffed again.
 * - The name is fixed (`public/avatar.gravatar.webp`). Nothing of the answer reaches a path.
 *
 * Kept from WP9: `allowDelete`, the atomic write, one of three one-line messages, and it never throws.
 */
import { rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { GRAVATAR_FILE, GRAVATAR_HOSTS, GRAVATAR_LEGACY_NAME, gravatarUrl, type GravatarResult } from './gravatar'
import { newBudget, safeRequest, sniffImage, type LookupFn, type Transport } from './unfurl'

/** The whole download: DNS, connection, headers and body. A build never waits longer for a picture. */
const TOTAL_TIMEOUT_MS = 8000
const MAX_BYTES = 2 * 1024 * 1024
/** No decoder input may be larger than this, whatever its header says. The same limit as the icons. */
const MAX_INPUT_PIXELS = 4096 * 4096
/** The stored picture fits inside this square. The page shows it far smaller; the favicon source is 512. */
const MAX_OUTPUT_PX = 512

const OFFLINE: GravatarResult = { status: 'offline', message: 'avatar: offline, kept the old file' }

export interface FetchGravatarOptions {
  /**
   * May a 404 remove the file on disk? True only when `email` is the SAVED
   * email of the profile file (the build script). The editor route passes
   * false for an unsaved draft email, so a try with another email can never
   * delete the picture of the saved profile.
   */
  allowDelete: boolean
  /** The file to write or remove. Default: `GRAVATAR_FILE`. Tests pass a file in a temp folder. */
  targetFile?: string
  /** TESTS ONLY. Replaces the undici connection of the guarded request. */
  transport?: Transport
  /** TESTS ONLY. Replaces `dns.lookup`. */
  lookup?: LookupFn
}

/**
 * Writes `${file}.tmp`, then renames it over `file`. A crash or a full disk
 * never leaves a half picture at `file`. The tmp file is removed on failure.
 * `public/avatar.gravatar.webp.tmp` is not tracked either (rule `public/avatar.*`).
 */
async function writeAtomic(file: string, body: Buffer): Promise<void> {
  const tmp = `${file}.tmp`
  try {
    await writeFile(tmp, body)
    await rename(tmp, file)
  }
  catch (error) {
    await rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}

/** Decodes the remote picture and draws it again. `null` = sharp cannot decode it, or the output is not a WebP. */
async function reencode(body: Buffer): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import('sharp')
    // No `withMetadata()` / `keepExif()`: sharp drops EXIF, ICC and XMP unless it is told to keep them.
    const webp = await sharp(body, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize(MAX_OUTPUT_PX, MAX_OUTPUT_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer()
    return sniffImage(webp) === 'webp' ? webp : null
  }
  catch {
    return null
  }
}

/**
 * Downloads the Gravatar of `email`. Never throws.
 * - 200 + a real JPEG, PNG or WebP of at most 2 MB that sharp can decode: writes the NEW WebP
 *   (tmp file, then rename) and removes the file with the old name. `saved`.
 * - 404: this email has no Gravatar. `none`. A stale file is removed only with `allowDelete`.
 * - anything else (network error, timeout, 5xx, a blocked host or address, too large, other bytes
 *   than a raster picture, a picture sharp refuses, a failed write): the old file stays. `offline`.
 */
export async function fetchGravatar(email: string, options: FetchGravatarOptions): Promise<GravatarResult> {
  const target = options.targetFile ?? GRAVATAR_FILE
  const legacy = join(dirname(target), GRAVATAR_LEGACY_NAME)
  try {
    const response = await safeRequest(
      gravatarUrl(email),
      { accept: 'image/webp,image/png,image/jpeg', maxBytes: MAX_BYTES, overflow: 'fail', onlyHosts: GRAVATAR_HOSTS },
      { budget: newBudget(undefined, TOTAL_TIMEOUT_MS), transport: options.transport, lookup: options.lookup },
    )
    if (response.status === 404) {
      if (options.allowDelete) {
        await rm(target, { force: true })
        await rm(legacy, { force: true })
      }
      return { status: 'none', message: 'avatar: no gravatar for this email' }
    }
    if (response.status !== 200) return OFFLINE
    // Magic bytes BEFORE the decode: an SVG, HTML or any other body never reaches sharp.
    const kind = sniffImage(response.body)
    if (kind !== 'jpeg' && kind !== 'png' && kind !== 'webp') return OFFLINE
    const webp = await reencode(response.body)
    if (!webp) return OFFLINE
    await writeAtomic(target, webp)
    // The file of before WP15 held remote bytes as they came. The page no longer reads it.
    await rm(legacy, { force: true }).catch(() => {})
    return { status: 'saved', message: 'avatar: gravatar saved' }
  }
  catch {
    return OFFLINE
  }
}
