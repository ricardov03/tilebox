/** Validates content/profile.json against the zod schema. Exit 1 on error. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseProfile } from '../types/profile'

const file = resolve(process.cwd(), 'content/profile.json')

try {
  const raw = await readFile(file, 'utf8')
  const profile = parseProfile(JSON.parse(raw))
  process.stdout.write(`OK  content/profile.json  (${profile.blocks.length} blocks, theme ${profile.profile.theme.colors}/${profile.profile.theme.fonts})\n`)
}
catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
