/**
 * Dev only. "Check links" in the Blocks tab of the editor (WP11). Body: the
 * editor's DRAFT profile. Answers `{ results }` (content/link-check.ts): one
 * entry per external http(s) URL with `ok`, `blocked` or `broken` and the reason.
 * Nothing is written: the editor keeps the result in memory only.
 *
 * The requests use the guarded request of the link previews (SSRF guard, honest
 * user agent). A closed editor request stops the job. The checker is imported
 * inside the handler, behind the dev check, so it never reaches a production build.
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

  const stop = new AbortController()
  const res = event.node.res
  res.once('close', () => {
    if (!res.writableEnded) stop.abort()
  })

  const { checkLinks, linkTargets } = await import('~~/content/link-check')
  return { results: await checkLinks(linkTargets(body.data), { signal: stop.signal }) }
})
