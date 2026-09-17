/**
 * Dev only. Copies one image into public/blocks/<slug>-<6 hex>.<ext>.
 * Accepts png, jpg, jpeg, webp, gif up to 8 MB. Returns `{ src }`.
 * The extension decides. A missing or generic MIME type is fine; only a
 * MIME type that names another format is rejected.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { extname, resolve } from 'node:path'
import { assertDev } from '../utils/editor'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])
/** MIME types that match one of the allowed extensions. `image/jpg` is a common non-standard value. */
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])
/** MIME types browsers send when they do not know. Never a reason to reject. */
const GENERIC_MIME = new Set(['', 'application/octet-stream', 'binary/octet-stream'])

function slugOf(filename: string): string {
  const base = filename.replace(extname(filename), '')
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return slug || 'image'
}

function tooLarge(filename: string, bytes: number): never {
  throw createError({ statusCode: 413, statusMessage: `"${filename}" is ${(bytes / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.` })
}

export default defineEventHandler(async (event) => {
  assertDev()

  // Refuse an oversized request before reading its body.
  const declared = Number(getHeader(event, 'content-length') ?? 0)
  if (declared > MAX_BYTES) tooLarge('The upload', declared)

  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file' && p.filename)
  if (!file || !file.filename) {
    throw createError({ statusCode: 400, statusMessage: 'No file in the request. Send multipart form data with a "file" field.' })
  }

  const ext = extname(file.filename).slice(1).toLowerCase()
  const mime = (file.type ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  const mimeOk = IMAGE_MIME.has(mime) || GENERIC_MIME.has(mime)
  if (!ALLOWED_EXT.has(ext) || !mimeOk) {
    throw createError({ statusCode: 415, statusMessage: `"${file.filename}" is not allowed. Use png, jpg, jpeg, webp or gif.` })
  }
  if (file.data.byteLength > MAX_BYTES) tooLarge(file.filename, file.data.byteLength)

  const dir = resolve(process.cwd(), 'public/blocks')
  await mkdir(dir, { recursive: true })
  const name = `${slugOf(file.filename)}-${randomBytes(3).toString('hex')}.${ext}`
  await writeFile(resolve(dir, name), file.data)
  return { src: `/blocks/${name}` }
})
