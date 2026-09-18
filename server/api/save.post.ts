/**
 * Dev only. Validates the body with the zod contract, checks every icon
 * against the installed Iconify packs, then writes content/profile.json.
 * Always that file, never the example: it is created when it does not exist.
 * The write is atomic: a temp file in the same folder, then a rename.
 * `restartNeeded` is true when nuxt.config.ts must re-read the file
 * (theme preset or icon set changed). Text changes need no restart:
 * modules/public-profile.ts watches `content/` and rewrites the sanitized
 * `#profile` copy, also on the first save that creates content/profile.json.
 */
import { rename, unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { ProfileSchema, type Profile } from '~~/types/profile'
import { assertDev, assertEditorRequest, checkIcons, iconsOf, PROFILE_WRITE_PATH, readProfileFile } from '../utils/editor'

function invalid(errors: string[]): never {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid profile',
    message: errors.join('\n'),
    data: { errors },
  })
}

/** Write to `<path>.<random>.tmp` then rename over the target, so a crash never leaves a half file. */
async function writeAtomic(path: string, content: string): Promise<void> {
  const temp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(temp, content, 'utf8')
    await rename(temp, path)
  }
  catch (error) {
    await unlink(temp).catch(() => undefined)
    throw error
  }
}

export default defineEventHandler(async (event) => {
  assertDev()
  assertEditorRequest(event, 'json')
  const body = await readBody<unknown>(event)
  const result = ProfileSchema.safeParse(body)
  if (!result.success) {
    invalid(result.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`))
  }
  const next: Profile = result.data

  const iconErrors = await checkIcons(iconsOf(next))
  if (iconErrors.length) invalid(iconErrors)

  let restartNeeded = true
  try {
    const previous = ProfileSchema.safeParse(await readProfileFile())
    if (previous.success) {
      const a = previous.data.profile.theme
      const b = next.profile.theme
      restartNeeded = a.colors !== b.colors
        || a.fonts !== b.fonts
        || iconsOf(previous.data).join(',') !== iconsOf(next).join(',')
    }
  }
  catch {
    restartNeeded = true
  }

  await writeAtomic(PROFILE_WRITE_PATH, `${JSON.stringify(next, null, 2)}\n`)
  return { ok: true as const, restartNeeded }
})
