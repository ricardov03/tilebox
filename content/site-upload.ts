/**
 * Stores one upload of the Site tab (your own favicon or social image) in
 * `public/site-uploads/` (ignored by git). Used by the dev-only route
 * `POST /api/site/upload`; a function of its own so a test can run it on a temp folder.
 *
 * Everything under `public/` ships with the site and is served from the site's
 * own origin. So (WP10 security round, S1c):
 * - An SVG is NEVER written to disk. sharp draws it as a 512x512 PNG and only
 *   that PNG is stored. An SVG opened directly can run script; a PNG cannot.
 * - A raster upload must decode with sharp, and its real format must be the one
 *   its extension names. A text file called `icon.png` is refused.
 *
 * Paths come from `ROOT` (through ./site-files.ts), never from this file's
 * location: Nitro bundles this module (NOTES.md, WP7 regression fix).
 */
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import sharp from 'sharp'
import { SITE_UPLOADS_DIR, SITE_UPLOADS_PUBLIC_DIR } from './site-files'

export type SiteUploadKind = 'favicon' | 'og'

export const SITE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024
/** The extensions each kind takes. `svg` is an INPUT format only: the stored file is a PNG. */
export const SITE_UPLOAD_EXTENSIONS: Record<SiteUploadKind, readonly string[]> = {
  favicon: ['png', 'svg', 'jpg', 'jpeg', 'webp'],
  og: ['png', 'jpg', 'jpeg', 'webp'],
}

/** The sharp format each extension must decode as. */
const FORMAT_OF: Record<string, string> = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', svg: 'svg' }
const SVG_OUTPUT_PX = 512
const SVG_BASE_DENSITY = 72
const SVG_MAX_DENSITY = 2400
const LIMITS = { limitInputPixels: 8192 * 8192, failOn: 'error' as const }
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

/** A refused upload. `statusCode` is the HTTP status the route answers with. */
export class SiteUploadError extends Error {
  constructor(public readonly statusCode: 413 | 415, message: string) {
    super(message)
    this.name = 'SiteUploadError'
  }
}

export interface SiteUploadInput {
  kind: SiteUploadKind
  /** The name the browser sent. Only its extension is used. */
  filename: string
  data: Buffer
  /** Default: `<ROOT>/public/site-uploads`. Tests pass a temp folder. */
  dir?: string
}

/** The SVG as a 512x512 PNG. The density is set from the SVG's own size, so a huge viewBox cannot use a lot of memory. */
async function svgToPng(data: Buffer): Promise<Buffer> {
  const meta = await sharp(data, { ...LIMITS, density: SVG_BASE_DENSITY }).metadata()
  const side = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (meta.format !== 'svg' || side <= 0) throw new Error('not an svg')
  const density = Math.min(SVG_MAX_DENSITY, Math.max(1, Math.round(SVG_BASE_DENSITY * SVG_OUTPUT_PX / side)))
  return sharp(data, { ...LIMITS, density })
    .resize(SVG_OUTPUT_PX, SVG_OUTPUT_PX, { fit: 'contain', background: TRANSPARENT })
    .ensureAlpha()
    .png()
    .toBuffer()
}

/** Checks and stores one upload. Answers `{ src }`, the value for `site.favicon` or `site.ogImage`. Throws `SiteUploadError`. */
export async function storeSiteUpload(input: SiteUploadInput): Promise<{ src: string }> {
  const { kind, filename, data } = input
  const dir = input.dir ?? SITE_UPLOADS_DIR
  const allowed = SITE_UPLOAD_EXTENSIONS[kind]
  const ext = extname(filename).slice(1).toLowerCase()
  const notAllowed = () => new SiteUploadError(415, `"${filename}" is not allowed. Use ${allowed.join(', ')}.`)
  if (!allowed.includes(ext)) throw notAllowed()
  if (data.byteLength > SITE_UPLOAD_MAX_BYTES) {
    throw new SiteUploadError(413, `"${filename}" is ${(data.byteLength / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.`)
  }

  let body: Buffer
  let storedExt: string
  try {
    if (ext === 'svg') {
      body = await svgToPng(data)
      storedExt = 'png'
    }
    else {
      const meta = await sharp(data, LIMITS).metadata()
      if (meta.format !== FORMAT_OF[ext] || !meta.width || !meta.height) throw new Error('the bytes are not that format')
      body = data
      storedExt = ext
    }
  }
  catch {
    throw new SiteUploadError(415, `"${filename}" is not a readable ${ext} image.`)
  }

  await mkdir(dir, { recursive: true })
  const name = `${kind}-${randomBytes(3).toString('hex')}.${storedExt}`
  await writeFile(resolve(dir, name), body)
  return { src: `${SITE_UPLOADS_PUBLIC_DIR}/${name}` }
}
