/**
 * Dead-link check. `npm run check:links`. NOT in `pregenerate`: it is slow and needs the network.
 * `npm run publish` runs it before the upload (skip: `--skip-link-check`).
 *
 * Reads the profile content/resolve.ts picks, asks every external http(s) URL
 * once (content/link-check.ts, the guarded request of the link previews) and
 * prints a table. ALWAYS exits 0: a warning list, never a build failure.
 *
 * Flags: `--broken-only` prints one line per broken link and nothing else (for scripts/publish.mjs).
 */
import { readFile } from 'node:fs/promises'
import { checkLinks, linkTable, linkTargets, MAX_LINKS } from '../content/link-check'
import { describeProfile, profilePath } from '../content/resolve'
import { parseProfile } from '../types/profile'

const brokenOnly = process.argv.includes('--broken-only')
const say = (line: string) => process.stdout.write(`${line}\n`)

try {
  const path = profilePath()
  const profile = parseProfile(JSON.parse(await readFile(path, 'utf8')))
  const targets = linkTargets(profile)
  if (!brokenOnly) say(`links: ${describeProfile(path)}, ${targets.length} URLs to check (max ${MAX_LINKS})`)
  const results = await checkLinks(targets)
  const count = (status: string) => results.filter(result => result.status === status).length
  if (brokenOnly) {
    for (const result of results.filter(item => item.status === 'broken')) {
      say(`broken link: ${result.url} (${result.reason}; block ${result.blockIds.join(', ')})`)
    }
  }
  else {
    if (results.length) say(linkTable(results))
    say(`links: ${count('ok')} ok, ${count('blocked')} blocked (the site blocks checks, probably fine), ${count('broken')} broken`)
    if (count('broken') > 0) say('warning: fix or remove the broken links. This is a warning only: nothing was stopped.')
  }
}
catch (error) {
  say(`links: check skipped (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`)
}
// Open sockets of a slow host must not keep the process alive. Always 0: warnings only.
process.exit(0)
