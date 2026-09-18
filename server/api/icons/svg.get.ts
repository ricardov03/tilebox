/**
 * Dev only. One icon of the two installed packs as an SVG file, for the previews of the
 * editor's icon picker. WP18. LOCAL: built from `node_modules/@iconify-json/<set>/icons.json`
 * (content/icon-index.ts), so the editor needs no `api.iconify.design` to show a search result.
 * `GET /api/icons/svg?name=<prefix:name>[&color=<rrggbb>]` -> `image/svg+xml`.
 * - `name` must be a name of the two sets (`isAllowedIconName`): 400 for the rest.
 * - An icon that does not exist or is marked hidden: 404.
 * - `color`: six hex digits, no `#`. An `<img>` cannot inherit `currentColor`, so the picker
 *   sends its ink color. Without it the SVG keeps `currentColor`.
 * The sandbox CSP and `nosniff` come from `routeRules` in nuxt.config.ts, the same headers
 * as the asset folders: opened directly, the file can run nothing.
 */
import { z } from 'zod'
import { ICON_SETS_MESSAGE, isAllowedIconName } from '~~/app/utils/icon-sets'
import { assertEditorRequest } from '../../utils/editor'

const QuerySchema = z.object({
  name: z.string().max(128).refine(isAllowedIconName),
  color: z.string().regex(/^[0-9a-f]{6}$/i).optional(),
})

export default defineEventHandler(async (event) => {
  const index = import.meta.dev ? await import('~~/content/icon-index') : null
  if (!index) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  assertEditorRequest(event, 'none')
  const query = QuerySchema.safeParse(getQuery(event))
  if (!query.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid query',
      message: `Send ?name=<prefix:name> and an optional &color=<rrggbb>. ${ICON_SETS_MESSAGE}.`,
    })
  }
  const svg = index.buildIconSvg(query.data.name, query.data.color)
  if (svg === null) throw createError({ statusCode: 404, statusMessage: 'Icon not found' })
  setResponseHeaders(event, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'max-age=3600',
  })
  return svg
})
