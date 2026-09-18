/**
 * Dev only. `{ exists }`: is public/avatar.gravatar.jpg on disk?
 * The editor preview uses it to show the same avatar the public page will show.
 */
import { gravatarFileExists } from '~~/content/gravatar'
import { assertDev } from '../../utils/editor'

export default defineEventHandler(() => {
  assertDev()
  return { exists: gravatarFileExists() }
})
