/**
 * Dev only. "Use my Gravatar" in the editor. Body: `{ email }` (the draft's
 * email, it may not be saved yet). Runs the same fetch as `npm run fetch:avatar`
 * (content/gravatar.ts) and answers `{ status, message, exists }`.
 * The editor clears `profile.avatar` when `status` is `saved`.
 */
import { z } from 'zod'
import { fetchGravatar, gravatarFileExists } from '~~/content/gravatar'
import { isPlaceholderEmail } from '~~/types/profile'
import { assertDev } from '../../utils/editor'

const BodySchema = z.object({ email: z.email() })

export default defineEventHandler(async (event) => {
  assertDev()
  const body = BodySchema.safeParse(await readBody<unknown>(event))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: 'Set a valid email first.' })
  }
  if (isPlaceholderEmail(body.data.email)) {
    throw createError({ statusCode: 400, statusMessage: 'Set your real email first. This one is a placeholder.' })
  }
  const result = await fetchGravatar(body.data.email)
  return { ...result, exists: gravatarFileExists() }
})
