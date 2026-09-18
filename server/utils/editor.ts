/**
 * Helpers for the dev-only editor routes (WP3). PLAN.md section 8 WP3.
 * Every route in server/api must call `assertDev()` first.
 */
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { Profile } from '~~/types/profile'
import { PERSONAL_PROFILE_PATH, resolveProfilePath } from '~~/content/resolve'

/** The only file the editor writes: content/profile.json (yours, not tracked). */
export const PROFILE_WRITE_PATH = PERSONAL_PROFILE_PATH

/** The file the editor reads: content/profile.json when it exists, else the example. Checked on every call. */
export function profileReadPath(): string {
  return resolveProfilePath()
}

/** 404 outside `nuxt dev`. The routes never exist in a prod build. */
export function assertDev(): void {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}

/** Raw JSON of the profile file (`profileReadPath()`). 500 with the path when the file is not valid JSON. */
export async function readProfileFile(): Promise<unknown> {
  const path = profileReadPath()
  const raw = await readFile(path, 'utf8')
  try {
    return JSON.parse(raw) as unknown
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Profile is not valid JSON',
      message: `${path}: ${reason}`,
    })
  }
}

/** Every `icon` field on a block, sorted and unique. */
export function iconsOf(profile: Profile): string[] {
  const icons = new Set<string>()
  for (const block of profile.blocks) {
    if ('icon' in block && block.icon) icons.add(block.icon)
  }
  return [...icons].sort()
}

/** The parts of `@iconify-json/<prefix>/icons.json` this check needs. */
const IconifyJsonSchema = z.object({
  icons: z.record(z.string(), z.unknown()),
  aliases: z.record(z.string(), z.unknown()).optional(),
})
type IconifyJson = z.infer<typeof IconifyJsonSchema>

/** Only successful loads are cached. A failed load is retried on the next call (the pack may get installed). */
const packCache = new Map<string, IconifyJson>()

async function loadPack(prefix: string): Promise<IconifyJson | null> {
  const cached = packCache.get(prefix)
  if (cached) return cached
  try {
    const require = createRequire(resolve(process.cwd(), 'package.json'))
    const file = require.resolve(`@iconify-json/${prefix}/icons.json`)
    const parsed = IconifyJsonSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
    if (!parsed.success) return null
    packCache.set(prefix, parsed.data)
    return parsed.data
  }
  catch {
    return null
  }
}

/** Returns one message per unknown icon. Empty array = all good. */
export async function checkIcons(icons: string[]): Promise<string[]> {
  const errors: string[] = []
  for (const icon of icons) {
    const [prefix, name] = icon.split(':')
    if (!prefix || !name) {
      errors.push(`Icon "${icon}" must look like prefix:name, for example line-md:github`)
      continue
    }
    const pack = await loadPack(prefix)
    if (!pack) {
      errors.push(`Icon "${icon}": pack @iconify-json/${prefix} is not installed. Run: npm i -D @iconify-json/${prefix}`)
      continue
    }
    if (!Object.hasOwn(pack.icons, name) && !(pack.aliases && Object.hasOwn(pack.aliases, name))) {
      errors.push(`Icon "${icon}" does not exist in ${prefix}. Browse https://icones.js.org/collection/${prefix}`)
    }
  }
  return errors
}
