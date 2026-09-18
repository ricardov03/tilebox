/**
 * Checks every icon name the site can render. WP18: ONE rule, `iconProblem()` of content/icon-index.ts,
 * the same one the editor's save route uses. An icon passes when it
 * - is a name of the two supported sets (`ICON_SETS`: line-md, simple-icons),
 * - exists in the installed pack (an alias counts),
 * - is not marked `hidden: true`: simple-icons hides the brands it removed (linkedin, twitter,
 *   amazon, slack), and a later pack update drops them.
 * Sources: `icon` fields in the profile (content/resolve.ts picks the file; read from the raw JSON, so a
 * bad name gets this script's message), the NETWORKS map, UI_ICONS (the block components and ThemeToggle
 * take every icon from UI_ICONS) and every value of the brand map in app/utils/brand-icons.ts (WP10a).
 * Prints the bad ones and exits 1 if any. `npm run check:icons`, runs in `pregenerate`.
 */
import { readFile } from 'node:fs/promises'
import { iconProblem } from '../content/icon-index'
import { profilePath } from '../content/resolve'
import { allBrandIcons } from '../app/utils/brand-icons'
import { ICON_SETS_TEXT } from '../app/utils/icon-sets'
import { NETWORKS, UI_ICONS } from '../app/utils/networks'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectIcons(profileJson: unknown): Map<string, string[]> {
  const sources = new Map<string, string[]>()
  const add = (name: string, source: string) => {
    const list = sources.get(name) ?? []
    list.push(source)
    sources.set(name, list)
  }
  const blocks = isRecord(profileJson) && Array.isArray(profileJson.blocks) ? profileJson.blocks : []
  for (const block of blocks) {
    if (isRecord(block) && typeof block.icon === 'string' && block.icon) add(block.icon, `profile.json block "${String(block.id)}"`)
  }
  for (const [id, network] of Object.entries(NETWORKS)) add(network.icon, `NETWORKS.${id}`)
  for (const [id, icon] of Object.entries(UI_ICONS)) add(icon, `UI_ICONS.${id}`)
  for (const icon of allBrandIcons()) add(icon, 'BRAND_ICONS (app/utils/brand-icons.ts)')
  return sources
}

const profileJson: unknown = JSON.parse(await readFile(profilePath(), 'utf8'))
const sources = collectIcons(profileJson)
const problems: string[] = []

for (const [name, from] of [...sources.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const problem = iconProblem(name)
  if (problem) problems.push(`  ${problem} (used by ${[...new Set(from)].join(', ')})`)
}

if (problems.length > 0) {
  process.stderr.write(`Bad icons (${problems.length}):\n${problems.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(`OK  ${sources.size} icons found in the installed packs (${ICON_SETS_TEXT})\n`)
