/**
 * Upgrades an older `content/profile.json` to the current shape (WP9).
 * Adds the keys that are missing in `profile`: `highlights`, `email`, `showEmail`.
 * Text in, text out. Everything else stays byte for byte: the new lines are
 * inserted after `"bio"`, in the file's own indent. When that is not possible
 * (bio is not a plain one-line string), the file is rewritten as 2-space JSON.
 * Returns `null` when there is nothing to do or the text is not a profile.
 * No Vue or Nuxt imports: `scripts/ensure-profile.ts` runs this with tsx.
 */
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
