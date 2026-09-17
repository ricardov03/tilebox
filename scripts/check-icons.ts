/**
 * Checks that every icon name the site can render exists in an installed Iconify pack.
 * Sources: `icon` fields in content/profile.json, the NETWORKS map, UI_ICONS,
 * and the static list of icons the block components use.
 * Prints the missing ones and exits 1 if any. `npm run check:icons`, runs in `pregenerate`.
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { parseProfile } from '../types/profile'
import { NETWORKS, UI_ICONS } from '../app/utils/networks'

/** Icons referenced directly by app/components/blocks/*.vue (all through UI_ICONS). Keep in sync. */
const COMPONENT_ICONS = [
  UI_ICONS.link, // LinkBlock fallback when no favicon was fetched
  UI_ICONS.external, // LinkBlock arrow
  UI_ICONS.map, // MapBlock
  UI_ICONS.play, // VideoBlock
] as const

interface IconPack {
  icons: Record<string, unknown>
  aliases?: Record<string, unknown>
}

const require = createRequire(import.meta.url)
const packs = new Map<string, IconPack | null>()

async function loadPack(prefix: string): Promise<IconPack | null> {
  if (packs.has(prefix)) return packs.get(prefix) ?? null
  const pack = await readPack(prefix)
  packs.set(prefix, pack)
  return pack
}

async function readPack(prefix: string): Promise<IconPack | null> {
  try {
    const file = require.resolve(`@iconify-json/${prefix}/icons.json`)
    return JSON.parse(await readFile(file, 'utf8')) as IconPack
  }
  catch {
    return null
  }
}

function collectIcons(profileJson: unknown): Map<string, string[]> {
  const sources = new Map<string, string[]>()
  const add = (name: string, source: string) => {
    const list = sources.get(name) ?? []
    list.push(source)
    sources.set(name, list)
  }
  const profile = parseProfile(profileJson)
  for (const block of profile.blocks) {
    if ('icon' in block && block.icon) add(block.icon, `profile.json block "${block.id}"`)
  }
  for (const [id, network] of Object.entries(NETWORKS)) add(network.icon, `NETWORKS.${id}`)
  for (const [id, icon] of Object.entries(UI_ICONS)) add(icon, `UI_ICONS.${id}`)
  for (const icon of COMPONENT_ICONS) add(icon, 'block components')
  return sources
}

async function iconExists(name: string): Promise<'ok' | 'no-pack' | 'missing'> {
  const [prefix, icon] = name.split(':')
  if (!prefix || !icon) return 'missing'
  const pack = await loadPack(prefix)
  if (!pack) return 'no-pack'
  return icon in pack.icons || (pack.aliases !== undefined && icon in pack.aliases) ? 'ok' : 'missing'
}

const profileFile = resolve(process.cwd(), 'content/profile.json')
const sources = collectIcons(JSON.parse(await readFile(profileFile, 'utf8')))
const problems: string[] = []

for (const [name, from] of [...sources.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const status = await iconExists(name)
  if (status === 'ok') continue
  const reason = status === 'no-pack'
    ? `pack @iconify-json/${name.split(':')[0]} is not installed`
    : 'icon not found in the pack'
  problems.push(`  ${name}  (${reason}; used by ${from.join(', ')})`)
}

if (problems.length > 0) {
  process.stderr.write(`Missing icons (${problems.length}):\n${problems.join('\n')}\nBrowse names at https://icones.js.org/collection/line-md\n`)
  process.exit(1)
}

process.stdout.write(`OK  ${sources.size} icons found in installed Iconify packs\n`)
