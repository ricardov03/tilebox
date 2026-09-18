/**
 * Dev only. `GET /api/images/pexels/search?q=&page=&orientation=`.
 * Answer: `{ photos: [{ id, width, height, alt, avgColor, photographer, photographerUrl, pageUrl, thumb, preview }],
 * page, hasMore, rateLimit: { remaining, reset } }`. Never the key, never the raw API answer.
 * Errors: 400 bad input, 401 "The Pexels key is wrong", 429 "Pexels rate limit reached, try again at <time>",
 * 503 no key, 502 / 504 Pexels cannot be reached.
 *
 * Guards: 404 outside `nuxt dev` (the engine is loaded only there, so a build never bundles it), then
 * `assertEditorRequest()`. The engine (content/pexels.ts) talks to `api.pexels.com` only and keeps
 * identical searches in memory for 10 minutes.
 */
import { assertEditorRequest } from '../../../utils/editor'
import { pexelsFailure, pexelsKey } from '../../../utils/pexels'

export default defineEventHandler(async (event) => {
  // A build-time constant: in a production build the import below is dead code and is dropped.
  const engine = import.meta.dev ? await import('~~/content/pexels') : null
  if (!engine) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  assertEditorRequest(event, 'none')

  const input = engine.SearchInputSchema.safeParse(getQuery(event))
  if (!input.success) {
    throw createError({ statusCode: 400, statusMessage: 'Send q (1 to 80 characters), page (1 to 50) and orientation (landscape, portrait or square).' })
  }

  // `close` before the answer was written = the editor went away (a newer search).
  const controller = new AbortController()
  const res = event.node.res
  res.once('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  try {
    return await engine.searchPhotos(input.data, { key: pexelsKey(), signal: controller.signal })
  }
  catch (error) {
    throw pexelsFailure(error, engine.PexelsError)
  }
})
