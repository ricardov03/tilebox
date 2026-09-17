/** Dev only. Returns content/profile.json, read from disk on every call. */
import { assertDev, readProfileFile } from '../utils/editor'

export default defineEventHandler(async () => {
  assertDev()
  return readProfileFile()
})
