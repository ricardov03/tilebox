/**
 * Dev only. `{ exists }`: is public/avatar.gravatar.webp on disk?
 * The editor preview uses it to show the same avatar the public page will show.
 */
import { gravatarFileExists } from '~~/content/gravatar'
import { assertDev, assertEditorRequest } from '../../utils/editor'

export default defineEventHandler((event) => {
  assertDev()
  assertEditorRequest(event, 'none')
  return { exists: gravatarFileExists() }
})
