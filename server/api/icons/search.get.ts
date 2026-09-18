/**
 * Dev only. The icon search of the editor's icon picker. WP18.
 * LOCAL: it reads the index of the two installed packs (content/icon-index.ts). It asks no
 * other host for anything, so it works offline and a query never leaves this machine.
 * `GET /api/icons/search?q=<text>` -> `{ icons, sets, total }`: at most 48 `prefix:name`
 * names, `line-md` first inside one rank, removed (hidden) brands never. An empty `q`
 * returns a small default list. A full name that exists (`line-md:github`) is the first result.
 * The index is loaded only under `nuxt dev`, so a build never bundles it.
 */
import { z } from 'zod'
import { assertEditorRequest } from '../../utils/editor'

/** `q` once, as text. `?q=a&q=b` (an array) is refused. The index cuts the text to 64 characters. */
const QuerySchema = z.object({
  q: z.string().max(2048).optional(),
})

export default defineEventHandler(async (event) => {
  const index = import.meta.dev ? await import('~~/content/icon-index') : null
  if (!index) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  assertEditorRequest(event, 'none')
  const query = QuerySchema.safeParse(getQuery(event))
  if (!query.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid query', message: 'Send the search text once, as ?q=<text>.' })
  }
  return index.searchIcons(query.data.q ?? '')
})
