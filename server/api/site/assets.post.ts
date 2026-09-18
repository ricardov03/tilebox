/**
 * Dev only. "Regenerate" in the Site tab of the editor. Body: the editor's
 * DRAFT profile (it may not be saved yet). Runs the same build as
 * `npm run build:site-assets` (content/site-assets.ts, then content/site-extras.ts)
 * and writes `public/site/`.
 * Answers `{ files, faviconSource, ogSource, messages, version, extras }`; `version`
 * busts the image cache of the previews; `extras` (WP11) is the result for the
 * contact card and the QR code. A new key: older callers ignore it.
 *
 * The builders are imported inside the handler, behind the dev check: a
 * production build drops the whole branch, so sharp and satori never reach it.
 */
import { ProfileSchema } from '~~/types/profile'
import { assertEditorRequest } from '../../utils/editor'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  assertEditorRequest(event, 'json')

  const body = ProfileSchema.safeParse(await readBody<unknown>(event))
  if (!body.success) {
    const errors = body.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile', message: errors.join('\n'), data: { errors } })
  }
  const { buildSiteAssets } = await import('~~/content/site-assets')
  const { buildSiteExtras } = await import('~~/content/site-extras')
  const envSiteUrl = process.env.NUXT_PUBLIC_SITE_URL
  const assets = await buildSiteAssets({ profile: body.data, envSiteUrl })
  const extras = await buildSiteExtras({ profile: body.data, envSiteUrl })
  return { ...assets, extras }
})
