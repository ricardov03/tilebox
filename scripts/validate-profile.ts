/**
 * Validates the profile against the zod schema. Exit 1 on error.
 * Reads content/profile.json (yours) or content/profile.example.json (the sample),
 * whichever content/resolve.ts picks, and says which one. Runs in `predev` and `pregenerate`.
 * A personal file with a placeholder email gets a warning, not a failure.
 */
import { readFile } from 'node:fs/promises'
import { describeProfile, profileIsPersonal, profilePath } from '../content/resolve'
import { isPlaceholderEmail, parseProfile } from '../types/profile'

const PROFILE_PATH = profilePath()
const label = describeProfile(PROFILE_PATH)
process.stdout.write(`profile: ${label}\n`)
if (!profileIsPersonal()) {
  process.stdout.write('warning: content/profile.json is missing, so this build uses the sample. `npm run dev` creates yours.\n')
}

try {
  const raw = await readFile(PROFILE_PATH, 'utf8')
  const profile = parseProfile(JSON.parse(raw))
  if (profileIsPersonal() && isPlaceholderEmail(profile.profile.email)) {
    process.stdout.write(`warning: profile.email is still the placeholder "${profile.profile.email}". Set your real email in /edit. It stays hidden unless you turn on "Show my email".\n`)
  }
  process.stdout.write(`OK  ${label}  (${profile.blocks.length} blocks, theme ${profile.profile.theme.colors}/${profile.profile.theme.fonts})\n`)
}
catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
