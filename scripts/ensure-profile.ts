/**
 * 1. Creates content/profile.json from content/profile.example.json when it is
 *    missing. Runs first in `predev`, so the first `npm run dev` gives you your
 *    own file. Never runs in `pregenerate`: a build without the personal file
 *    (GitHub CI, the release zip) is the sample site by design.
 * 2. Upgrades an existing content/profile.json that lacks the WP9 keys
 *    (`highlights`, `email`, `showEmail`). The rest of the file stays as it is.
 *    A file that already has them is never touched.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { migrateProfileText } from '../content/migrate'
import { ensureProfile, hasPersonalProfile } from '../content/resolve'

const existed = hasPersonalProfile()
const path = ensureProfile()
if (!existed) {
  process.stdout.write('Created content/profile.json from the example. It is yours and it is not tracked by git.\n')
}

const migrated = migrateProfileText(readFileSync(path, 'utf8'))
if (migrated !== null) {
  writeFileSync(path, migrated, 'utf8')
  process.stdout.write('profile: added email, showEmail and highlights. Set your real email in /edit.\n')
}
