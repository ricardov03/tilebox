/**
 * Dev only. Validates the body with the zod contract, checks every icon
 * against the installed Iconify packs, then writes content/profile.json.
 * `restartNeeded` is true when nuxt.config.ts must re-read the file
 * (theme preset or icon set changed).
 */
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { ProfileSchema, type Profile } from '~~/types/profile'
import { assertDev, checkIcons, iconsOf, PROFILE_PATH, readProfileFile } from '../utils/editor'

function invalid(errors: string[]): never {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid profile',
    message: errors.join('\n'),
    data: { errors },
  })
}

export default defineEventHandler(async (event) => {
  assertDev()
  const body = await readBody<unknown>(event)
  const result = ProfileSchema.safeParse(body)
  if (!result.success) {
    invalid(z.prettifyError(result.error).split('\n').filter(Boolean))
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

  await writeFile(PROFILE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return { ok: true as const, restartNeeded }
})
