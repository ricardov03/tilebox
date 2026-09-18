/**
 * Upgrades an older `content/profile.json` to the current shape (WP9).
 * Adds the keys that are missing in `profile`: `highlights`, `email`, `showEmail`.
 * Text in, text out. Everything else stays byte for byte: the new lines are
 * inserted after `"bio"`, in the file's own indent. When that is not possible
 * (bio is not a plain one-line string), the file is rewritten as 2-space JSON.
 * Returns `null` when there is nothing to do or the text is not a profile.
 * No Vue or Nuxt imports: `scripts/ensure-profile.ts` runs this with tsx.
 *
 * WP18: `migrateIconsText()` removes an `icon` of another icon set from its block (only the sets of
 * app/utils/icon-sets.ts are supported). The tile falls back to its automatic icon. Nothing else changes.
 */
import { ICON_SETS, ICON_SETS_TEXT } from '../app/utils/icon-sets'

export const MIGRATION_EMAIL = 'you@example.com'

const NEW_KEYS: readonly (readonly [key: string, value: unknown])[] = [
  ['highlights', []],
  ['email', MIGRATION_EMAIL],
  ['showEmail', false],
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  }
  catch {
    return undefined
  }
}

export function migrateProfileText(text: string): string | null {
  const data = tryParse(text)
  if (!isRecord(data) || !isRecord(data.profile)) return null
  const info = data.profile
  const missing = NEW_KEYS.filter(([key]) => !Object.hasOwn(info, key))
  if (!missing.length) return null

  // Expected result: the same data with the new keys right after `bio` (or at the end of `profile`).
  const nextInfo: Record<string, unknown> = {}
  let placed = false
  for (const [key, value] of Object.entries(info)) {
    nextInfo[key] = value
    if (key === 'bio') {
      for (const [k, v] of missing) nextInfo[k] = v
      placed = true
    }
  }
  if (!placed) for (const [k, v] of missing) nextInfo[k] = v
  const expected = { ...data, profile: nextInfo }

  // Byte-stable path: insert lines after the first `"bio": "..."` line.
  const bioLine = /^([ \t]*)"bio"[ \t]*:[ \t]*"(?:[^"\\]|\\.)*"[ \t]*(,?)[ \t]*$/m.exec(text)
  if (bioLine && placed) {
    const [line, indent = '', comma] = bioLine
    const added = missing.map(([k, v]) => `${indent}${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    const lines = comma
      ? [line, ...added.map(l => `${l},`)]
      : [`${line},`, ...added.map((l, i) => (i === added.length - 1 ? l : `${l},`))]
    const candidate = text.slice(0, bioLine.index) + lines.join('\n') + text.slice(bioLine.index + line.length)
    const parsed = tryParse(candidate)
    if (parsed !== undefined && JSON.stringify(parsed) === JSON.stringify(expected)) {
      return candidate.endsWith('\n') ? candidate : `${candidate}\n`
    }
  }
  return `${JSON.stringify(expected, null, 2)}\n`
}

/** A block `icon` from a set tilebox does not support, for example `lucide:mail`. */
export interface ForeignIcon {
  id: string
  icon: string
}

/** `prefix:name` with a prefix that is not one of `ICON_SETS`. A name without a prefix is a typo, not a foreign set: the schema reports it. */
function isForeignIcon(icon: unknown): icon is string {
  if (typeof icon !== 'string') return false
  const colon = icon.indexOf(':')
  if (colon < 1) return false
  const prefix = icon.slice(0, colon)
  return !ICON_SETS.some(set => set === prefix)
}

function blocksOf(data: unknown): Record<string, unknown>[] {
  if (!isRecord(data) || !Array.isArray(data.blocks)) return []
  return data.blocks.filter(isRecord)
}

/** Every block icon of another set, in file order. `data` is the parsed JSON of a profile file. */
export function foreignIcons(data: unknown): ForeignIcon[] {
  return blocksOf(data).flatMap(block => (isForeignIcon(block.icon) ? [{ id: String(block.id), icon: block.icon }] : []))
}

/** The one line `npm run ensure:profile` prints per removed icon. */
export function removedIconLine({ id, icon }: ForeignIcon): string {
  return `profile: removed icon "${icon}" from block ${id} (only ${ICON_SETS_TEXT} are supported)`
}

/** The advice `npm run check:profile` prints for the same icon, when the migration did not run (a build never changes your file). */
export function foreignIconAdvice({ id, icon }: ForeignIcon): string {
  return `profile: icon "${icon}" of block ${id} is not supported (only ${ICON_SETS_TEXT} are supported). Run \`npm run ensure:profile\` to remove it (the tile gets its automatic icon), or pick another icon in /edit.`
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Removes every foreign `icon` from its block. Returns the new text and what was removed, or `null`
 * when there is nothing to do (so a second run changes nothing) or the text is not a profile.
 * Byte-stable when it can be: the `"icon": "..."` lines are cut out and the result is compared with
 * the expected data. When that fails (the icon is the last key of its block, or the file is on one
 * line) the file is rewritten as 2-space JSON with a final newline, the shape the editor writes.
 */
export function migrateIconsText(text: string): { text: string, removed: ForeignIcon[] } | null {
  const data = tryParse(text)
  const removed = foreignIcons(data)
  if (!isRecord(data) || !removed.length) return null
  const expected = {
    ...data,
    blocks: (Array.isArray(data.blocks) ? data.blocks : []).map((block: unknown) => {
      if (!isRecord(block) || !isForeignIcon(block.icon)) return block
      return Object.fromEntries(Object.entries(block).filter(([key]) => key !== 'icon'))
    }),
  }

  let candidate = text
  for (const { icon } of removed) {
    const line = new RegExp(`^[ \\t]*"icon"[ \\t]*:[ \\t]*${escapeRegExp(JSON.stringify(icon))}[ \\t]*,[ \\t]*\\r?\\n`, 'm')
    candidate = candidate.replace(line, '')
  }
  const parsed = tryParse(candidate)
  if (parsed !== undefined && JSON.stringify(parsed) === JSON.stringify(expected)) {
    return { text: candidate.endsWith('\n') ? candidate : `${candidate}\n`, removed }
  }
  return { text: `${JSON.stringify(expected, null, 2)}\n`, removed }
}
