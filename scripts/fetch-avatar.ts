/**
 * Avatar from the email (Gravatar). `npm run fetch:avatar`, runs in `predev`
 * and `pregenerate` after `check:profile`. Writes public/avatar.gravatar.webp
 * (not tracked). Prints one line. Never fails the build.
 *
 * Skipped when `profile.avatar` is set (your uploaded picture wins) or when the
 * email is a placeholder. The logic lives in content/gravatar-fetch.ts, shared with
 * the dev-only route `POST /api/avatar/gravatar`.
 */
import { readFile } from 'node:fs/promises'
import { fetchGravatar } from '../content/gravatar-fetch'
import { profilePath } from '../content/resolve'
import { isPlaceholderEmail, parseProfile } from '../types/profile'

async function main(): Promise<string> {
  const { profile } = parseProfile(JSON.parse(await readFile(profilePath(), 'utf8')))
  if (profile.avatar) return 'avatar: profile.avatar is set, gravatar skipped'
  // WP17: the email is optional. No email = no lookup, and an old Gravatar file stays as it is.
  if (!profile.email) return 'avatar: no email in the profile, gravatar skipped'
  if (isPlaceholderEmail(profile.email)) return 'avatar: placeholder email, gravatar skipped'
  // The saved email: a 404 may remove a stale file.
  return (await fetchGravatar(profile.email, { allowDelete: true })).message
}

try {
  process.stdout.write(`${await main()}\n`)
}
catch (error) {
  // check:profile already reports a broken file. This script never stops a build.
  process.stdout.write(`avatar: skipped (${error instanceof Error ? error.message.split('\n')[0] : String(error)})\n`)
}
