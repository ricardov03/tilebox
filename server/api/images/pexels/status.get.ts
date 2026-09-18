/**
 * Dev only. `{ configured }`: is there a Pexels key in `.env`? Nothing else. The key never leaves the server.
 * Guards: 404 outside `nuxt dev`, then `assertEditorRequest()` (server/utils/editor.ts).
 */
import { assertDev, assertEditorRequest } from '../../../utils/editor'
import { pexelsKey } from '../../../utils/pexels'

export default defineEventHandler((event): { configured: boolean } => {
  assertDev()
  assertEditorRequest(event, 'none')
  return { configured: (pexelsKey() ?? '').trim() !== '' }
})
