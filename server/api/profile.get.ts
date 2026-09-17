/**
 * Dev only. Returns content/profile.json, read from disk and validated on
 * every call. 400 with one message per issue when the file is not valid.
 */
import { ProfileSchema } from '~~/types/profile'
import { assertDev, PROFILE_PATH, readProfileFile } from '../utils/editor'

export default defineEventHandler(async () => {
  assertDev()
  const result = ProfileSchema.safeParse(await readProfileFile())
  if (!result.success) {
    const errors = result.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid profile',
      message: `${PROFILE_PATH}:\n${errors.join('\n')}`,
      data: { errors },
    })
  }
  return result.data
})
