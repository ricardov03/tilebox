/**
 * Dev only. Returns the profile (content/profile.json, else the example),
 * read from disk and validated on every call. 400 with one message per
 * issue when the file is not valid.
 */
import { ProfileSchema } from '~~/types/profile'
import { assertDev, assertEditorRequest, profileReadPath, readProfileFile } from '../utils/editor'

export default defineEventHandler(async (event) => {
  assertDev()
  // The file has your hidden email: a DNS-rebinding page (another `Host`) must not read it.
  assertEditorRequest(event, 'none')
  const result = ProfileSchema.safeParse(await readProfileFile())
  if (!result.success) {
    const errors = result.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid profile',
      message: `${profileReadPath()}:\n${errors.join('\n')}`,
      data: { errors },
    })
  }
  return result.data
})
