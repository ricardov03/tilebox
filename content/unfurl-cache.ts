/**
 * The small, dependency-free half of the link preview engine (WP10a).
 * Paths, URL normalization, the cache file and "which local files does this
 * link have". Node built-ins only: `modules/public-profile.ts` loads this at
 * config time, and it must not pull the network code of ./unfurl.ts.
 *
 * Paths come from `ROOT` in ./resolve.ts, never from this file's location:
 * Nitro bundles this module into `.nuxt/` (NOTES.md, WP7 regression fix).
 */
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import { brandIconFor } from '../app/utils/brand-icons'
import { LOCAL_ICON_PATH, LOCAL_THUMB_PATH } from '../types/local-paths'
import { localIconPath, localThumbPath, type Block, type LinkBlock, type Profile } from '../types/profile'
import { ROOT } from './resolve'

/** Where the engine writes. All of it is ignored by git. Tests pass their own folders. */
export interface UnfurlDirs {
  /** Served as `/icons/*`. */
  icons: string
  /** Served as `/thumbs/*`. */
  thumbs: string
  /** The cache file. */
  cache: string
}

export const DEFAULT_DIRS: UnfurlDirs = {
  icons: resolve(ROOT, 'public/icons'),
  thumbs: resolve(ROOT, 'public/thumbs'),
  cache: resolve(ROOT, '.tilebox/unfurl-cache.json'),
}

export const MAX_URL_CHARS = 2048
/** A cache entry is fresh for 30 days. */
export const FRESH_MS = 30 * 24 * 60 * 60 * 1000

/** Longest `imageAlt`. The same number caps the fetched description (content/unfurl.ts). */
export const IMAGE_ALT_MAX = 200

const isoDate = z.string().min(1).max(40).refine(value => Number.isFinite(Date.parse(value)), 'must be a date')

/** What the engine found. Every file is a local public path, never a remote URL. */
export const UnfurlDataSchema = z.object({
  /** The normalized URL that was asked for. */
  url: z.string().min(1).max(MAX_URL_CHARS),
  /** The URL after redirects. */
  finalUrl: z.string().min(1).max(8192),
  title: z.string().max(300).optional(),
  description: z.string().max(500).optional(),
  siteName: z.string().max(300).optional(),
  themeColor: z.string().max(64).optional(),
  /** `/icons/<hash>.png`. Always a PNG the engine drew itself. The SAME pattern as `favicon` in types/profile.ts. */
  favicon: localIconPath.optional(),
  /** `/thumbs/<hash>.webp`. Only when the image was asked for. The SAME pattern as `image` in types/profile.ts. */
  image: localThumbPath.optional(),
  imageAlt: z.string().max(IMAGE_ALT_MAX).optional(),
  source: z.enum(['oembed', 'html', 'brand']),
  fetchedAt: isoDate,
  /** One short line for the editor, for example why only the brand icon is there. */
  note: z.string().max(300).optional(),
}).strict()
export type UnfurlData = z.infer<typeof UnfurlDataSchema>

export const CacheEntrySchema = z.object({
  data: UnfurlDataSchema,
  /** Was the image step run for this entry? An entry without it cannot answer a `showImage` request. */
  imageTried: z.boolean(),
  etag: z.string().max(1024).optional(),
  lastModified: z.string().max(128).optional(),
}).strict()
export type CacheEntry = z.infer<typeof CacheEntrySchema>

interface CacheFile {
  version: 1
  entries: Record<string, CacheEntry>
}

/**
 * Only http and https. Credentials and the fragment are removed. At most 2048
 * characters. The result is the cache key. `null` = not a URL the engine takes.
 */
export function normalizeUrl(input: string): string | null {
  const text = input.trim()
  if (!text || text.length > MAX_URL_CHARS) return null
  let parsed: URL
  try {
    parsed = new URL(text)
  }
  catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname) return null
  parsed.username = ''
  parsed.password = ''
  parsed.hash = ''
  const href = parsed.href
  return href.length > MAX_URL_CHARS ? null : href
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCache(text: string): CacheFile {
  const empty: CacheFile = { version: 1, entries: {} }
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.entries)) return empty
    const entries: Record<string, CacheEntry> = {}
    for (const [key, value] of Object.entries(parsed.entries)) {
      // Anyone (or anything) can edit this file. An entry that does not fit the schema is dropped, silently.
      const entry = CacheEntrySchema.safeParse(value)
      if (entry.success && key.length <= MAX_URL_CHARS) entries[key] = entry.data
    }
    return { version: 1, entries }
  }
  catch {
    return empty
  }
}

/** The whole cache. A missing or broken file is an empty cache. */
export function readCacheSync(dirs: UnfurlDirs = DEFAULT_DIRS): Record<string, CacheEntry> {
  if (!existsSync(dirs.cache)) return {}
  try {
    return parseCache(readFileSync(dirs.cache, 'utf8')).entries
  }
  catch {
    return {}
  }
}

/** One writer at a time, so two requests never write half of each other's file. */
let writeQueue: Promise<void> = Promise.resolve()

/** Reads the file again, sets or removes one entry, writes through a tmp file + rename. */
export function updateCache(key: string, entry: CacheEntry | null, dirs: UnfurlDirs = DEFAULT_DIRS): Promise<void> {
  const job = writeQueue.then(async () => {
    const entries = new Map(Object.entries(readCacheSync(dirs)))
    if (entry) entries.set(key, entry)
    else entries.delete(key)
    const file: CacheFile = { version: 1, entries: Object.fromEntries(entries) }
    const tmp = `${dirs.cache}.${process.pid}.tmp`
    try {
      await mkdir(dirname(dirs.cache), { recursive: true })
      await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, 'utf8')
      await rename(tmp, dirs.cache)
    }
    catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined)
      throw error
    }
  })
  // The cache is a convenience. A failed write must not break the queue or the caller.
  writeQueue = job.catch(() => undefined)
  return writeQueue
}

/**
 * `/icons/x.png` -> the file in `dirs.icons`, `/thumbs/x.webp` -> the file in `dirs.thumbs`.
 * `null` for any other path: the same two patterns as the profile contract (types/local-paths.ts),
 * so `/icons/x.svg`, `/icons/x.html` or `/thumbs/manifest.json` never count as a link file.
 */
export function localFileOf(publicPath: string, dirs: UnfurlDirs = DEFAULT_DIRS): string | null {
  if (typeof publicPath !== 'string') return null
  const name = publicPath.slice(publicPath.lastIndexOf('/') + 1)
  if (LOCAL_ICON_PATH.test(publicPath)) return resolve(dirs.icons, name)
  if (LOCAL_THUMB_PATH.test(publicPath)) return resolve(dirs.thumbs, name)
  return null
}

export function localFileExists(publicPath: string | undefined, dirs: UnfurlDirs = DEFAULT_DIRS): boolean {
  if (!publicPath) return false
  const file = localFileOf(publicPath, dirs)
  return file !== null && existsSync(file)
}

/**
 * Does this link block still need the engine? `enrich` on, and a file it should have is not on disk.
 * A tile with its own `icon` or a brand icon never shows a favicon, so none is needed.
 */
export function linkNeedsFetch(block: LinkBlock, dirs: UnfurlDirs = DEFAULT_DIRS): boolean {
  if (!block.enrich) return false
  if (block.showImage && !localFileExists(block.image, dirs)) return true
  if (block.icon || brandIconFor(block.url)) return false
  return !localFileExists(block.favicon, dirs)
}

/**
 * The files a link block can really show, for the build.
 * A path in the block counts only when the file is on disk. When it is not
 * (fresh machine, profile written by hand), the path from the cache is used,
 * which `npm run fetch:links` fills. A file that is missing everywhere is
 * dropped, so the page never points at a 404.
 */
function withLocalFiles(block: LinkBlock, cache: Record<string, CacheEntry>, dirs: UnfurlDirs): LinkBlock {
  const { favicon, image, imageAlt, ...rest } = block
  if (!block.enrich) return rest
  const key = normalizeUrl(block.url)
  const cached = key ? cache[key]?.data : undefined
  const pick = (own: string | undefined, fromCache: string | undefined) =>
    [own, fromCache].find(path => localFileExists(path, dirs))
  const nextFavicon = pick(favicon, cached?.favicon)
  const nextImage = block.showImage ? pick(image, cached?.image) : undefined
  const nextAlt = nextImage ? (imageAlt ?? cached?.imageAlt) : undefined
  return {
    ...rest,
    ...(nextFavicon ? { favicon: nextFavicon } : {}),
    ...(nextImage ? { image: nextImage } : {}),
    ...(nextAlt ? { imageAlt: nextAlt } : {}),
  }
}

/** The profile with every link block's `favicon` and `image` checked against the disk. Does not change its input. */
export function withLocalLinkFiles(profile: Profile, dirs: UnfurlDirs = DEFAULT_DIRS): Profile {
  if (!profile.blocks.some(block => block.type === 'link' && (block.enrich || block.favicon || block.image))) return profile
  const cache = readCacheSync(dirs)
  const blocks: Block[] = profile.blocks.map(block => (block.type === 'link' ? withLocalFiles(block, cache, dirs) : block))
  return { ...profile, blocks }
}
