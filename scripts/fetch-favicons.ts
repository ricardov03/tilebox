/**
 * Build-time fetch of link favicons and YouTube thumbnails.
 * - Link blocks without `icon`: Google favicon service -> public/icons/<sha1(host).slice(0,12)>.png
 * - YouTube video blocks: hqdefault.jpg -> public/thumbs/<id>.jpg
 * Existing files are kept. Network errors log one line and never fail the build.
 * Writes public/icons/manifest.json { host -> file } and public/thumbs/manifest.json { id -> file }.
 * Commit the manifests and the fetched files. `npm run fetch:favicons`, runs in `pregenerate`.
 */
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseProfile } from '../types/profile'
import { hostOf, youtubeId } from '../app/components/blocks/media'

const TIMEOUT_MS = 5000
/** Largest body accepted. A favicon is a few KB, a YouTube thumbnail under 100 KB. */
const MAX_BYTES = 5 * 1024 * 1024
const ICONS_DIR = resolve(process.cwd(), 'public/icons')
const THUMBS_DIR = resolve(process.cwd(), 'public/thumbs')

const FAVICON_URL = (host: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
const THUMB_URL = (id: string) => `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`

interface Job {
  /** Manifest key: host for favicons, video id for thumbnails. */
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
    const response = await fetch(job.url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !type.startsWith('image/')) {
      process.stdout.write(`skip ${job.key}: HTTP ${response.status} ${type || 'no content-type'}\n`)
      return false
    }
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > MAX_BYTES) {
      process.stdout.write(`skip ${job.key}: body is ${declared} bytes, limit ${MAX_BYTES}\n`)
      return false
    }
    const body = Buffer.from(await response.arrayBuffer())
    if (body.byteLength > MAX_BYTES) {
      process.stdout.write(`skip ${job.key}: body is ${body.byteLength} bytes, limit ${MAX_BYTES}\n`)
      return false
    }
    await writeFile(target, body)
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
  const raw = await readFile(resolve(process.cwd(), 'content/profile.json'), 'utf8')
  const profile = parseProfile(JSON.parse(raw))
  await mkdir(ICONS_DIR, { recursive: true })
  await mkdir(THUMBS_DIR, { recursive: true })

  const faviconJobs = new Map<string, Job>()
  const thumbJobs = new Map<string, Job>()

  for (const block of profile.blocks) {
    if (block.type === 'link' && !block.icon) {
      const host = hostOf(block.url)
      if (!host || faviconJobs.has(host)) continue
      faviconJobs.set(host, {
        key: host,
        file: `${createHash('sha1').update(host).digest('hex').slice(0, 12)}.png`,
        dir: ICONS_DIR,
        url: FAVICON_URL(host),
      })
    }
    if (block.type === 'video') {
      const id = youtubeId(block.url)
      if (!id || thumbJobs.has(id)) continue
      thumbJobs.set(id, {
        key: id,
        file: `${id}.jpg`,
        dir: THUMBS_DIR,
        url: THUMB_URL(id),
      })
    }
  }

  /** Downloads every job at once. Keeps the ones that are on disk afterwards. */
  const fetched = async (jobs: Map<string, Job>): Promise<Map<string, string>> => {
    const results = await Promise.all([...jobs.values()].map(async job => [job, await download(job)] as const))
    return new Map(results.filter(([, ok]) => ok).map(([job]) => [job.key, job.file]))
  }
  const [icons, thumbs] = await Promise.all([fetched(faviconJobs), fetched(thumbJobs)])

  await writeManifest(ICONS_DIR, icons)
  await writeManifest(THUMBS_DIR, thumbs)
  process.stdout.write(`OK  favicons ${icons.size}/${faviconJobs.size}, thumbnails ${thumbs.size}/${thumbJobs.size}\n`)
}

try {
  await run()
}
catch (error) {
  // Never fail the build. Missing files fall back to `line-md:link` and `bg-photo` in the components.
  const message = error instanceof Error ? error.message : String(error)
  process.stdout.write(`fetch-favicons skipped: ${message}\n`)
}
