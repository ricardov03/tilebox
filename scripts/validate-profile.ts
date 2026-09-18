/**
 * Validates the profile against the zod schema. Exit 1 on error.
 * Reads content/profile.json (yours) or content/profile.example.json (the sample),
 * whichever content/resolve.ts picks, and says which one. Runs in `predev` and `pregenerate`.
 * A personal file with a placeholder email gets a warning, not a failure.
 * WP11: one warning per expired block, per block that has not started yet, and per
 * contact / QR tile the build will leave out. Warnings never fail the build.
 */
import { readFile } from 'node:fs/promises'
import { scheduleState } from '../app/utils/schedule'
import { resolveSiteUrl } from '../app/utils/site-head'
import { foreignIconAdvice, foreignIcons } from '../content/migrate'
import { describeProfile, profileIsPersonal, profilePath } from '../content/resolve'
import { isPlaceholderEmail, parseProfile, type Profile } from '../types/profile'

const PROFILE_PATH = profilePath()
const label = describeProfile(PROFILE_PATH)
process.stdout.write(`profile: ${label}\n`)
if (!profileIsPersonal()) {
  process.stdout.write('warning: content/profile.json is missing, so this build uses the sample. `npm run dev` creates yours.\n')
}

/**
 * The page is static: the BUILD applies the schedule. So a block that starts
 * later needs a new publish after that time.
 */
function secondWaveWarnings(profile: Profile, now: Date): string[] {
  const lines: string[] = []
  for (const block of profile.blocks) {
    if (block.hidden) continue
    const name = `block "${block.id}"`
    const state = scheduleState(block, now)
    if (state === 'expired') lines.push(`warning: ${name} expired on ${block.endsAt}. This build leaves it out.`)
    if (state === 'scheduled') lines.push(`warning: ${name} starts on ${block.startsAt}. This build leaves it out: publish again after ${block.startsAt} to show it.`)
    if (block.type === 'contact' && !profile.contact?.enabled) {
      lines.push(`warning: ${name} is a "Save my contact" tile, but contact.enabled is off. This build leaves it out. Turn it on in /edit > Site.`)
    }
    if (block.type === 'qr' && !resolveSiteUrl(process.env.NUXT_PUBLIC_SITE_URL, profile.site)) {
      lines.push(`warning: ${name} is a QR tile, but no site URL is known. This build leaves it out. Set the site URL in /edit > Site, or NUXT_PUBLIC_SITE_URL.`)
    }
  }
  return lines
}

/** WP18. The parsed JSON, kept so a schema error about an icon of another set can say what to do. */
let json: unknown
try {
  const raw = await readFile(PROFILE_PATH, 'utf8')
  json = JSON.parse(raw)
  const profile = parseProfile(json)
  if (profileIsPersonal() && isPlaceholderEmail(profile.profile.email)) {
    process.stdout.write(`warning: profile.email is still the placeholder "${profile.profile.email}". Set your real email in /edit. It stays hidden unless you turn on "Show my email".\n`)
  }
  for (const line of secondWaveWarnings(profile, new Date())) process.stdout.write(`${line}\n`)
  process.stdout.write(`OK  ${label}  (${profile.blocks.length} blocks, theme ${profile.profile.theme.colors}/${profile.profile.theme.fonts})\n`)
}
catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  for (const item of foreignIcons(json)) process.stderr.write(`${foreignIconAdvice(item)}\n`)
  process.exit(1)
}
