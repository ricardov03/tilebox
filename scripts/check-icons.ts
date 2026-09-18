/**
 * Checks that every icon name the site can render exists in an installed Iconify pack.
 * Sources: `icon` fields in the profile (content/resolve.ts picks the file), the NETWORKS map, UI_ICONS
 * (the block components and ThemeToggle take every icon from UI_ICONS) and every value of the
 * brand map in app/utils/brand-icons.ts (WP10a).
 * An icon marked `hidden: true` in its pack fails too: simple-icons hides the brands it removed
 * (linkedin, twitter, amazon, slack), and a later pack update drops them.
 * Prints the bad ones and exits 1 if any. `npm run check:icons`, runs in `pregenerate`.
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { profilePath } from '../content/resolve'
import { parseProfile } from '../types/profile'
import { allBrandIcons } from '../app/utils/brand-icons'
import { NETWORKS, UI_ICONS } from '../app/utils/networks'

interface IconPack {
  icons: Record<string, unknown>
  aliases?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Minimal shape check for an `@iconify-json/<prefix>/icons.json` file. */
function isIconPack(value: unknown): value is IconPack {
  return isRecord(value)
    && isRecord(value.icons)
    && (value.aliases === undefined || isRecord(value.aliases))
}

const require = createRequire(import.meta.url)
const packs = new Map<string, IconPack | null>()

async function loadPack(prefix: string): Promise<IconPack | null> {
  const cached = packs.get(prefix)
  if (cached !== undefined) return cached
  const pack = await readPack(prefix)
  packs.set(prefix, pack)
  return pack
}

async function readPack(prefix: string): Promise<IconPack | null> {
  try {
    const file = require.resolve(`@iconify-json/${prefix}/icons.json`)
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
    return isIconPack(parsed) ? parsed : null
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
  for (const icon of allBrandIcons()) add(icon, 'BRAND_ICONS (app/utils/brand-icons.ts)')
  return sources
}

type IconStatus = 'ok' | 'no-pack' | 'missing' | 'hidden'

async function iconStatus(name: string): Promise<IconStatus> {
  const [prefix, icon] = name.split(':')
  if (!prefix || !icon) return 'missing'
  const pack = await loadPack(prefix)
  if (!pack) return 'no-pack'
  let entry: unknown
  if (Object.hasOwn(pack.icons, icon)) entry = pack.icons[icon]
  else if (pack.aliases !== undefined && Object.hasOwn(pack.aliases, icon)) entry = pack.aliases[icon]
  if (entry === undefined) return 'missing'
  return isRecord(entry) && entry.hidden === true ? 'hidden' : 'ok'
}

const REASONS: Record<Exclude<IconStatus, 'ok'>, (prefix: string) => string> = {
  'no-pack': prefix => `pack @iconify-json/${prefix} is not installed or not a valid Iconify pack`,
  'missing': prefix => `icon not found in the pack. Browse https://icones.js.org/collection/${prefix}`,
  'hidden': () => 'icon is marked hidden in the pack: the brand was removed. Pick another one',
}

const sources = collectIcons(JSON.parse(await readFile(profilePath(), 'utf8')))
const problems: string[] = []

for (const [name, from] of [...sources.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const status = await iconStatus(name)
  if (status === 'ok') continue
  const prefix = name.split(':')[0] ?? name
  problems.push(`  ${name}  (${REASONS[status](prefix)}; used by ${[...new Set(from)].join(', ')})`)
}

if (problems.length > 0) {
  process.stderr.write(`Bad icons (${problems.length}):\n${problems.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(`OK  ${sources.size} icons found in installed Iconify packs\n`)
