/**
 * The public page never imports `content/profile.json`. It imports `#profile`,
 * and this module makes `#profile` a SANITIZED copy:
 * `.nuxt/tilebox/public-profile.json` = `toPublicProfile(profile, gravatar path)`.
 * So a hidden email is in no HTML, no payload and no JS chunk.
 *
 * A Nuxt template, not a file written at config time: `nuxt build` clears
 * `.nuxt/` after the config is loaded, and templates are written after that.
 *
 * Dev: `content/` and `public/` are watched. A save in /edit (or a change by
 * hand, or a new Gravatar file) rewrites the template, and Vite hot-reloads it.
 * A file that is not valid keeps the last good copy.
 */
import { readFileSync, watch, type FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'
import { addTemplate, defineNuxtModule, updateTemplates } from '@nuxt/kit'
import { GRAVATAR_FILE, gravatarPathIfPresent } from '../content/gravatar'
import { EXAMPLE_PROFILE_PATH, PERSONAL_PROFILE_PATH, profilePath } from '../content/resolve'
import { parseProfile, toPublicProfile } from '../types/profile'

/** Relative to `.nuxt/`. nuxt.config.ts points the `#profile` tsconfig path at the same file. */
export const PUBLIC_PROFILE_TEMPLATE = 'tilebox/public-profile.json'

function render(): string {
  const profile = parseProfile(JSON.parse(readFileSync(profilePath(), 'utf8')))
  return `${JSON.stringify(toPublicProfile(profile, gravatarPathIfPresent()), null, 2)}\n`
}

export default defineNuxtModule({
  meta: { name: 'tilebox-public-profile' },
  setup(_options, nuxt) {
    let lastGood = render()

    const template = addTemplate({
      filename: PUBLIC_PROFILE_TEMPLATE,
      write: true,
      getContents: () => {
        try {
          lastGood = render()
        }
        catch {
          // Half-written or invalid file: keep serving the last good copy. `check:profile` names the error.
        }
        return lastGood
      },
    })
    nuxt.options.alias['#profile'] = template.dst

    if (!nuxt.options.dev) return

    const watchers: FSWatcher[] = []
    let timer: NodeJS.Timeout | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        void updateTemplates({ filter: t => t.filename === PUBLIC_PROFILE_TEMPLATE })
      }, 50)
    }
    /** Watch the folder, not the file: the save route replaces the file with a rename. */
    const watchFiles = (files: string[]) => {
      const [first] = files
      if (!first) return
      const names = new Set(files.map(file => basename(file)))
      watchers.push(watch(dirname(first), (_event, changed) => {
        if (changed && names.has(changed)) refresh()
      }))
    }
    watchFiles([PERSONAL_PROFILE_PATH, EXAMPLE_PROFILE_PATH])
    watchFiles([GRAVATAR_FILE])

    nuxt.hook('close', () => {
      clearTimeout(timer)
      watchers.forEach(w => w.close())
    })
  },
})
