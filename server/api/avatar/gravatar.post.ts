/**
 * Dev only. "Use my Gravatar" in the editor. Body: `{ email }` (the draft's
 * email, it may not be saved yet). Runs the same download as `npm run fetch:avatar`
 * (content/gravatar-fetch.ts) and answers `{ status, message, exists }`.
 * A 404 removes the file on disk only when the draft email equals the email in
 * the saved profile file. A try with another email never deletes that picture.
 * The editor clears `profile.avatar` when `status` is `saved`.
 *
 * The download uses the guarded request of content/unfurl.ts and sharp. It is loaded only under
 * `nuxt dev`, so a build never bundles that engine (the same pattern as `/api/unfurl`).
 */
import { z } from 'zod'
import { gravatarFileExists } from '~~/content/gravatar'
import { isPlaceholderEmail } from '~~/types/profile'
import { assertEditorRequest, readProfileFile } from '../../utils/editor'

const BodySchema = z.object({ email: z.email() })
const SavedEmailSchema = z.object({ profile: z.object({ email: z.string() }) })

const normalize = (email: string) => email.trim().toLowerCase()

/** Is `email` the email of the profile file on disk? Any read or parse problem = no. */
async function isSavedEmail(email: string): Promise<boolean> {
  try {
    const saved = SavedEmailSchema.safeParse(await readProfileFile())
    return saved.success && normalize(saved.data.profile.email) === normalize(email)
  }
  catch {
    return false
  }
}

export default defineEventHandler(async (event) => {
  // A build-time constant: in a production build the import below is dead code and is dropped.
  const engine = import.meta.dev ? await import('~~/content/gravatar-fetch') : null
  if (!engine) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  assertEditorRequest(event, 'json')
  const body = BodySchema.safeParse(await readBody<unknown>(event))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Set a valid email first.' })
  }
  if (isPlaceholderEmail(body.data.email)) {
    throw createError({ statusCode: 400, statusMessage: 'Set your real email first. This one is a placeholder.' })
  }
  const result = await engine.fetchGravatar(body.data.email, { allowDelete: await isSavedEmail(body.data.email) })
  return { ...result, exists: gravatarFileExists() }
})
