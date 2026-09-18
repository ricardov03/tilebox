/**
 * Dev only. Your own favicon or social preview image, from the Site tab.
 * `POST /api/site/upload?kind=favicon|og`, multipart field `file`.
 * Writes `public/site-uploads/<kind>-<6 hex>.<ext>` (ignored by git) and
 * answers `{ src }`, the value for `site.favicon` or `site.ogImage`.
 * favicon: png, svg, jpg, jpeg. og: png, jpg, jpeg, webp. Up to 8 MB.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { extname, resolve } from 'node:path'
import { SITE_UPLOADS_DIR, SITE_UPLOADS_PUBLIC_DIR } from '~~/content/site-files'

const MAX_BYTES = 8 * 1024 * 1024
const MULTIPART_OVERHEAD = 64 * 1024
const ALLOWED: Record<'favicon' | 'og', readonly string[]> = {
  favicon: ['png', 'svg', 'jpg', 'jpeg'],
  og: ['png', 'jpg', 'jpeg', 'webp'],
}

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const kind = getQuery(event).kind
  if (kind !== 'favicon' && kind !== 'og') {
    throw createError({ statusCode: 400, statusMessage: 'Set ?kind=favicon or ?kind=og.' })
  }
  const declared = Number(getHeader(event, 'content-length') ?? 0)
  if (declared > MAX_BYTES + MULTIPART_OVERHEAD) {
    throw createError({ statusCode: 413, statusMessage: 'The upload is too large. The limit is 8 MB.' })
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  if (!file || !file.filename) {
    throw createError({ statusCode: 400, statusMessage: 'No file in the request. Send multipart form data with a "file" field.' })
  }
  const ext = extname(file.filename).slice(1).toLowerCase()
  if (!ALLOWED[kind].includes(ext)) {
    throw createError({ statusCode: 415, statusMessage: `"${file.filename}" is not allowed. Use ${ALLOWED[kind].join(', ')}.` })
  }
  if (file.data.byteLength > MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `"${file.filename}" is ${(file.data.byteLength / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.` })
  }

  await mkdir(SITE_UPLOADS_DIR, { recursive: true })
  const name = `${kind}-${randomBytes(3).toString('hex')}.${ext}`
  await writeFile(resolve(SITE_UPLOADS_DIR, name), file.data)
  return { src: `${SITE_UPLOADS_PUBLIC_DIR}/${name}` }
})
