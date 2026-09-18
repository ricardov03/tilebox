/**
 * Dev only. Your own favicon or social preview image, from the Site tab.
 * `POST /api/site/upload?kind=favicon|og`, multipart field `file`.
 * Writes `public/site-uploads/<kind>-<6 hex>.<ext>` (ignored by git) and
 * answers `{ src }`, the value for `site.favicon` or `site.ogImage`.
 * favicon: png, svg, jpg, jpeg, webp. og: png, jpg, jpeg, webp. Up to 8 MB.
 *
 * An SVG is never written to disk: it is drawn as a 512x512 PNG and `src` is
 * that `.png` (content/site-upload.ts, which also checks the real format of a
 * raster file). The store function is imported behind the dev check, so a
 * production build drops it and sharp with it.
 */
export default defineEventHandler(async (event) => {
  const store = import.meta.dev ? await import('~~/content/site-upload') : null
  if (!store) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const kind = getQuery(event).kind
  if (kind !== 'favicon' && kind !== 'og') {
    throw createError({ statusCode: 400, statusMessage: 'Set ?kind=favicon or ?kind=og.' })
  }
  const MULTIPART_OVERHEAD = 64 * 1024
  const declared = Number(getHeader(event, 'content-length') ?? 0)
  if (declared > store.SITE_UPLOAD_MAX_BYTES + MULTIPART_OVERHEAD) {
    throw createError({ statusCode: 413, statusMessage: 'The upload is too large. The limit is 8 MB.' })
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename)
  if (!file || !file.filename) {
    throw createError({ statusCode: 400, statusMessage: 'No file in the request. Send multipart form data with a "file" field.' })
  }
  try {
    return await store.storeSiteUpload({ kind, filename: file.filename, data: file.data })
  }
  catch (error) {
    if (error instanceof store.SiteUploadError) throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    throw error
  }
})
