/**
 * Helpers for the dev-only editor routes (WP3). PLAN.md section 8 WP3.
 * Every route in server/api must call `assertDev()` first.
 */
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Profile } from '~~/types/profile'

export const PROFILE_PATH = resolve(process.cwd(), 'content/profile.json')

/** 404 outside `nuxt dev`. The routes never exist in a prod build. */
export function assertDev(): void {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}

export async function readProfileFile(): Promise<unknown> {
  const raw = await readFile(PROFILE_PATH, 'utf8')
  return JSON.parse(raw) as unknown
}

/** Every `icon` field on a block, sorted and unique. */
export function iconsOf(profile: Profile): string[] {
  const icons = new Set<string>()
  for (const block of profile.blocks) {
    if ('icon' in block && block.icon) icons.add(block.icon)
  }
  return [...icons].sort()
}

interface IconifyJson {
  icons: Record<string, unknown>
  aliases?: Record<string, unknown>
}

const packCache = new Map<string, IconifyJson | null>()

async function loadPack(prefix: string): Promise<IconifyJson | null> {
  const cached = packCache.get(prefix)
  if (cached !== undefined) return cached
  let pack: IconifyJson | null = null
  try {
    const require = createRequire(resolve(process.cwd(), 'package.json'))
    const file = require.resolve(`@iconify-json/${prefix}/icons.json`)
    pack = JSON.parse(await readFile(file, 'utf8')) as IconifyJson
  }
  catch {
    pack = null
  }
  packCache.set(prefix, pack)
  return pack
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
    if (!(name in pack.icons) && !(pack.aliases && name in pack.aliases)) {
      errors.push(`Icon "${icon}" does not exist in ${prefix}. Browse https://icones.js.org/collection/${prefix}`)
    }
  }
  return errors
}
