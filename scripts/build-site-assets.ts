/**
 * Favicon set, web manifest and social preview image. `npm run build:site-assets`,
 * runs in `predev` and `pregenerate` after `fetch:avatar`. Writes `public/site/`
 * (not tracked), plus the contact card and the QR code of WP11. No network.
 * Never fails the build: on a problem the page keeps the tracked `/favicon.ico`
 * and `/og.png`, and one line says why.
 *
 * The logic lives in content/site-assets.ts and content/site-extras.ts, shared
 * with the dev-only route `POST /api/site/assets`.
 */
import { readFile } from 'node:fs/promises'
import { profilePath } from '../content/resolve'
import { parseProfile, type Profile } from '../types/profile'

const firstLine = (error: unknown) => (error instanceof Error ? error.message.split('\n')[0] : String(error))

/** WP11: the contact card and the QR code. Its own try: a problem here never hides the summary line of the favicon set. */
async function extras(profile: Profile): Promise<string[]> {
  try {
    const { buildSiteExtras } = await import('../content/site-extras')
    return (await buildSiteExtras({ profile, envSiteUrl: process.env.NUXT_PUBLIC_SITE_URL })).messages
  }
  catch (error) {
    return [`site: contact card and QR code skipped (${firstLine(error)})`]
  }
}

async function main(): Promise<string[]> {
  // Loaded here, not at the top: a broken sharp install must not stop the build either.
  const { buildSiteAssets } = await import('../content/site-assets')
  const profile = parseProfile(JSON.parse(await readFile(profilePath(), 'utf8')))
  const result = await buildSiteAssets({ profile, envSiteUrl: process.env.NUXT_PUBLIC_SITE_URL })
  const summary = `site: favicon from ${result.faviconSource}, social image ${result.ogSource} (${result.files.length} files in public/site/)`
  return [...result.messages, summary, ...(await extras(profile))]
}

try {
  process.stdout.write(`${(await main()).join('\n')}\n`)
}
catch (error) {
  // check:profile already reports a broken file. This script never stops a build.
  process.stdout.write(`site: skipped (${firstLine(error)}), the page keeps /favicon.ico and /og.png\n`)
}
