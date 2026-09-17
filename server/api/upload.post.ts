/**
 * Dev only. Copies one image into public/blocks/<slug>-<6 hex>.<ext>.
 * Accepts png, jpg, jpeg, webp, gif up to 8 MB. Returns `{ src }`.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { extname, resolve } from 'node:path'
import { assertDev } from '../utils/editor'

const MAX_BYTES = 8 * 1024 * 1024
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

function slugOf(filename: string): string {
  const base = filename.replace(extname(filename), '')
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return slug || 'image'
}

export default defineEventHandler(async (event) => {
  assertDev()
  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.filename)
  if (!file || !file.filename) {
    throw createError({ statusCode: 400, statusMessage: 'No file in the request. Send multipart form data with a "file" field.' })
  }

  const extFromName = extname(file.filename).slice(1).toLowerCase()
  const ext = (file.type && EXT_BY_MIME[file.type]) || extFromName
  if (!ALLOWED_EXT.has(ext) || (file.type && !EXT_BY_MIME[file.type])) {
    throw createError({ statusCode: 415, statusMessage: `"${file.filename}" is not allowed. Use png, jpg, jpeg, webp or gif.` })
  }
  if (file.data.byteLength > MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `"${file.filename}" is ${(file.data.byteLength / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.` })
  }

  const dir = resolve(process.cwd(), 'public/blocks')
  await mkdir(dir, { recursive: true })
  const name = `${slugOf(file.filename)}-${randomBytes(3).toString('hex')}.${ext}`
  await writeFile(resolve(dir, name), file.data)
  return { src: `/blocks/${name}` }
})
