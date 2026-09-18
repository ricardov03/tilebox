/**
 * Build-time fetch for link tiles and video tiles. `npm run fetch:links`
 * (`fetch:favicons` is an alias), runs in `pregenerate`. Reads the profile
 * content/resolve.ts picks. Never writes the profile.
 *
 * - Link blocks with `enrich: true` whose local files are missing: the link
 *   preview engine (content/unfurl.ts) runs again and fills `public/icons/`,
 *   `public/thumbs/` and `.tilebox/unfurl-cache.json`. The build then takes the
 *   paths from the cache (`withLocalLinkFiles` in content/unfurl-cache.ts).
 *   A link with `enrich` off makes no request at all.
 * - YouTube video blocks: hqdefault.jpg -> public/thumbs/<id>.jpg, listed in
 *   public/thumbs/manifest.json { id -> file } (the `#manifest/thumbs` alias).
 *   The download goes through the engine's guarded request (`fetchPicture`):
 *   address check, redirects by hand, 5 MB limit while reading, written again as a JPEG.
 *
 * Existing files are kept. A network error prints one line and never fails the build.
 * The fetched files are not tracked (they come from your profile).
 *
 * Last step: files in `public/icons/` and `public/thumbs/` that no block of the
 * profile and no fresh cache entry uses are removed (`pruneLinkFiles`), so the
 * folders do not grow for ever and no orphan ships with the site.
 *
 * Debug one link: `npm run fetch:links -- --url https://nuxt.com [--image] [--force]`
 * prints the engine's answer as JSON. It is a REAL run of the engine: it writes
 * `.tilebox/unfurl-cache.json` and the fetched files in `public/icons/` and
 * `public/thumbs/`. It does not read or write the profile, and it does not prune.
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { profilePath, ROOT } from '../content/resolve'
import { fetchPicture, unfurl } from '../content/unfurl'
import { linkNeedsFetch, pruneLinkFiles } from '../content/unfurl-cache'
import { parseProfile } from '../types/profile'
import { youtubeId } from '../app/components/blocks/media'

/** Largest body accepted. A YouTube thumbnail is under 100 KB. The engine stops reading at this size. */
const MAX_BYTES = 5 * 1024 * 1024
const THUMBS_DIR = resolve(ROOT, 'public/thumbs')

const THUMB_URL = (id: string) => `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`

interface Job {
  /** Manifest key: the video id. */
  key: string
  file: string
  dir: string
  url: string
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

/** Downloads one file. Returns true when the file is on disk afterwards. */
async function download(job: Job): Promise<boolean> {
  const target = resolve(job.dir, job.file)
  if (await exists(target)) return true
  try {
    // Never a raw `fetch`: the engine checks the address of every hop and counts the bytes while it reads.
    const picture = await fetchPicture(job.url, { maxBytes: MAX_BYTES })
    if (!picture.ok) {
      process.stdout.write(`skip ${job.key}: ${picture.reason}\n`)
      return false
    }
    await writeFile(target, picture.body)
    process.stdout.write(`got  ${job.key} -> ${job.file}\n`)
    return true
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stdout.write(`skip ${job.key}: ${message}\n`)
    return false
  }
}

async function writeManifest(dir: string, entries: Map<string, string>): Promise<void> {
  const sorted = Object.fromEntries([...entries.entries()].sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(resolve(dir, 'manifest.json'), `${JSON.stringify(sorted, null, 2)}\n`)
}

async function run(): Promise<void> {
  const raw = await readFile(profilePath(), 'utf8')
  const profile = parseProfile(JSON.parse(raw))
  await mkdir(THUMBS_DIR, { recursive: true })

  // Link previews. One after the other: a personal page has a few links, and one host is never hit twice at once.
  // `linkNeedsFetch()` is false for a link without a URL (WP17: incomplete, the build leaves it out).
  const links = profile.blocks.flatMap(block => (block.type === 'link' && block.url && linkNeedsFetch(block) ? [{ url: block.url, showImage: block.showImage ?? false }] : []))
  let linksOk = 0
  for (const link of links) {
    const result = await unfurl(link.url, { showImage: link.showImage })
    if (result.ok) linksOk++
    else process.stdout.write(`skip ${link.url}: ${result.reason}\n`)
  }

  const thumbJobs = new Map<string, Job>()
  for (const block of profile.blocks) {
    if (block.type !== 'video' || !block.url) continue
    const id = youtubeId(block.url)
    if (!id || thumbJobs.has(id)) continue
    thumbJobs.set(id, { key: id, file: `${id}.jpg`, dir: THUMBS_DIR, url: THUMB_URL(id) })
  }
  const results = await Promise.all([...thumbJobs.values()].map(async job => [job, await download(job)] as const))
  const thumbs = new Map(results.filter(([, ok]) => ok).map(([job]) => [job.key, job.file]))
  await writeManifest(THUMBS_DIR, thumbs)

  // Housekeeping: what nothing uses any more goes. The thumbnails of the video tiles stay, also when today's download failed.
  const removed = await pruneLinkFiles(profile, { keepThumbs: [...thumbJobs.values()].map(job => job.file) })

  process.stdout.write(`OK  link previews ${linksOk}/${links.length}, thumbnails ${thumbs.size}/${thumbJobs.size}${removed.length ? `, ${removed.length} unused files removed` : ''}\n`)
}

/** `--url <link> [--image] [--force]`: print the engine's answer for one link. Writes the cache and the fetched files. */
async function debugOne(args: string[]): Promise<boolean> {
  const at = args.indexOf('--url')
  const url = at === -1 ? undefined : args[at + 1]
  if (!url) return false
  const result = await unfurl(url, { showImage: args.includes('--image'), force: args.includes('--force') })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return true
}

try {
  if (!(await debugOne(process.argv.slice(2)))) await run()
}
catch (error) {
  // Never fail the build. A missing file falls back to the brand icon or `line-md:link`, and to `bg-photo`.
  const message = error instanceof Error ? error.message : String(error)
  process.stdout.write(`fetch-links skipped: ${message}\n`)
}
