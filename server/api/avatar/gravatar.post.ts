/**
 * Dev only. "Use my Gravatar" in the editor. Body: `{ email }` (the draft's
 * email, it may not be saved yet). Runs the same fetch as `npm run fetch:avatar`
 * (content/gravatar.ts) and answers `{ status, message, exists }`.
 * A 404 removes the file on disk only when the draft email equals the email in
 * the saved profile file. A try with another email never deletes that picture.
 * The editor clears `profile.avatar` when `status` is `saved`.
 */
import { z } from 'zod'
import { fetchGravatar, gravatarFileExists } from '~~/content/gravatar'
import { isPlaceholderEmail } from '~~/types/profile'
import { assertDev, readProfileFile } from '../../utils/editor'

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
  assertDev()
  const body = BodySchema.safeParse(await readBody<unknown>(event))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Set a valid email first.' })
  }
  if (isPlaceholderEmail(body.data.email)) {
    throw createError({ statusCode: 400, statusMessage: 'Set your real email first. This one is a placeholder.' })
  }
  const result = await fetchGravatar(body.data.email, { allowDelete: await isSavedEmail(body.data.email) })
  return { ...result, exists: gravatarFileExists() }
})
