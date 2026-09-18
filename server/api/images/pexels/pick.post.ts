/**
 * Dev only. `POST /api/images/pexels/pick`, JSON body `{ id, size? }` (`size`: `large2x` default, or `large`).
 * Answer: `{ src: "/blocks/pexels-<id>.webp", width, height, alt, source: { provider: 'pexels', id, url, author, authorUrl } }`.
 *
 * NOT an open proxy: the body names a photo ID, never a URL. The engine (content/pexels.ts) asks the
 * Pexels API for that photo, takes the file URL from the API answer, refuses every host but
 * `images.pexels.com` (https, also on a redirect), checks the magic bytes, and writes a NEW WebP with sharp
 * (1600 px on the long side, no metadata) into the git-ignored `public/blocks/`. A file that exists is used again.
 *
 * Guards: 404 outside `nuxt dev`, then `assertEditorRequest()` with a JSON body (an HTML form on another
 * website cannot send `application/json`).
 */
import { assertEditorRequest } from '../../../utils/editor'
import { pexelsFailure, pexelsKey } from '../../../utils/pexels'

export default defineEventHandler(async (event) => {
  // A build-time constant: in a production build the import below is dead code and is dropped.
  const engine = import.meta.dev ? await import('~~/content/pexels') : null
  if (!engine) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  assertEditorRequest(event, 'json')

  const input = engine.PickInputSchema.safeParse(await readBody<unknown>(event))
  if (!input.success) throw createError({ statusCode: 400, statusMessage: 'Send { id, size? }. id is the number of a Pexels photo.' })

  try {
    return await engine.pickPhoto(input.data, { key: pexelsKey() })
  }
  catch (error) {
    throw pexelsFailure(error, engine.PexelsError)
  }
})
