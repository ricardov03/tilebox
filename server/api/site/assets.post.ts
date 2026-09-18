/**
 * Dev only. "Regenerate" in the Site tab of the editor. Body: the editor's
 * DRAFT profile (it may not be saved yet). Runs the same build as
 * `npm run build:site-assets` (content/site-assets.ts) and writes `public/site/`.
 * Answers `{ files, faviconSource, ogSource, messages, version }`; `version`
 * busts the image cache of the previews.
 *
 * The builder is imported inside the handler, behind the dev check: a
 * production build drops the whole branch, so sharp and satori never reach it.
 */
import { ProfileSchema } from '~~/types/profile'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = ProfileSchema.safeParse(await readBody<unknown>(event))
  if (!body.success) {
    const errors = body.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile', message: errors.join('\n'), data: { errors } })
  }
  const { buildSiteAssets } = await import('~~/content/site-assets')
  return buildSiteAssets({ profile: body.data, envSiteUrl: process.env.NUXT_PUBLIC_SITE_URL })
})
