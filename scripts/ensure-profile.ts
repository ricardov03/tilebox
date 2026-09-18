/**
 * Creates content/profile.json from content/profile.example.json when it is
 * missing. Runs first in `predev`, so the first `npm run dev` gives you your
 * own file. Never runs in `pregenerate`: a build without the personal file
 * (GitHub CI, the release zip) is the sample site by design.
 */
import { ensureProfile, hasPersonalProfile } from '../content/resolve'

const existed = hasPersonalProfile()
ensureProfile()
if (!existed) {
  process.stdout.write('Created content/profile.json from the example. It is yours and it is not tracked by git.\n')
}
