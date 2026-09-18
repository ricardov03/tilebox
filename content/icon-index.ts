/**
 * The LOCAL icon index. WP18, PLAN.md section 5.5. No network, ever.
 *
 * Reads the two installed packs (`ICON_SETS` of app/utils/icon-sets.ts) from
 * `node_modules/@iconify-json/<set>/icons.json` and answers three questions:
 * - `iconStatus()` / `iconProblem()`: may this name be used? ONE rule for the save route
 *   (server/utils/editor.ts) and `scripts/check-icons.ts`: allowed set AND exists AND not hidden.
 * - `searchIcons()`: the editor's icon search (`GET /api/icons/search`).
 * - `buildIconSvg()`: the preview of one icon (`GET /api/icons/svg`).
 *
 * An icon marked `hidden: true` is left out everywhere: simple-icons marks the brands it
 * removed this way (linkedin, slack, amazon) and a later pack update drops them. An alias is
 * hidden when any icon on its parent chain is hidden.
 * simple-icons ships no brand titles in its Iconify pack (`metadata.json` is empty), so the
 * search words are the icon names only.
 *
 * The packs are found with `createRequire` from `ROOT` (content/resolve.ts), never from this
 * file's own location: Nitro bundles it into `.nuxt/`. No Vue or Nuxt imports: the server
 * routes (dev only, dynamic import), the scripts (tsx) and the tests use this file.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { z } from 'zod'
import { ICON_NAME_RE, ICON_SETS, ICON_SETS_TEXT, iconSetOf, iconSetUrl, type IconSet } from '../app/utils/icon-sets'
import { NETWORKS, UI_ICONS } from '../app/utils/networks'
import { ROOT } from './resolve'

/** The longest query the search reads. The rest is cut off. */
export const MAX_ICON_QUERY = 64
/** The most names one search returns. */
export const ICON_SEARCH_LIMIT = 48
/** An alias chain longer than this is treated as broken. The packs use one hop. */
const MAX_ALIAS_HOPS = 5
const DEFAULT_SIZE = 16

const IconDataSchema = z.object({
  body: z.string(),
  hidden: z.boolean().optional(),
  left: z.number().optional(),
  top: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
})
const AliasSchema = z.object({
  parent: z.string(),
  hidden: z.boolean().optional(),
})
/** The parts of `@iconify-json/<set>/icons.json` this file needs. */
const IconPackSchema = z.object({
  icons: z.record(z.string(), IconDataSchema),
  aliases: z.record(z.string(), AliasSchema).optional(),
  left: z.number().optional(),
  top: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
})
type IconPack = z.infer<typeof IconPackSchema>

/** One drawable icon: the body and its view box. */
export interface ResolvedIcon {
  body: string
  left: number
  top: number
  width: number
  height: number
  hidden: boolean
}

/** Only successful loads are cached. A failed load is retried on the next call (the pack may get installed). */
const packCache = new Map<IconSet, IconPack>()

function loadPack(set: IconSet): IconPack | null {
  const cached = packCache.get(set)
  if (cached) return cached
  try {
    const require = createRequire(resolve(ROOT, 'package.json'))
    const file = require.resolve(`@iconify-json/${set}/icons.json`)
    const parsed = IconPackSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    if (!parsed.success) return null
    packCache.set(set, parsed.data)
    return parsed.data
  }
  catch {
    return null
  }
}

/** The icon or the alias `name` of a pack, its parent chain followed. `undefined` when it does not exist. */
function resolveInPack(pack: IconPack, name: string): ResolvedIcon | undefined {
  let current = name
  let hidden = false
  for (let hop = 0; hop <= MAX_ALIAS_HOPS; hop++) {
    if (Object.hasOwn(pack.icons, current)) {
      const icon = pack.icons[current]
      if (!icon) return undefined
      return {
        body: icon.body,
        left: icon.left ?? pack.left ?? 0,
        top: icon.top ?? pack.top ?? 0,
        width: icon.width ?? pack.width ?? DEFAULT_SIZE,
        height: icon.height ?? pack.height ?? DEFAULT_SIZE,
        hidden: hidden || icon.hidden === true,
      }
    }
    const alias = pack.aliases && Object.hasOwn(pack.aliases, current) ? pack.aliases[current] : undefined
    if (!alias) return undefined
    hidden ||= alias.hidden === true
    current = alias.parent
  }
  return undefined
}

export type IconStatus = 'ok' | 'foreign' | 'no-pack' | 'missing' | 'hidden'

/** `foreign`: not a name of the two sets. `no-pack`: the pack is not installed. `missing`, `hidden`: see the file header. */
export function iconStatus(name: string): IconStatus {
  const set = iconSetOf(name)
  if (!set) return 'foreign'
  const pack = loadPack(set)
  if (!pack) return 'no-pack'
  const icon = resolveInPack(pack, name.slice(set.length + 1))
  if (!icon) return 'missing'
  return icon.hidden ? 'hidden' : 'ok'
}

const BROWSE = `Browse ${ICON_SETS.map(iconSetUrl).join(' and ')}`

/** One line that says what is wrong with an icon name and where to find a good one. `null` = the icon is fine. */
export function iconProblem(name: string): string | null {
  const status = iconStatus(name)
  if (status === 'ok') return null
  const set = iconSetOf(name)
  const reason = {
    'foreign': `is not supported: tilebox uses only ${ICON_SETS_TEXT} (a name looks like ${ICON_SETS[0]}:github)`,
    'no-pack': `cannot be checked: the pack @iconify-json/${set} is not installed. Run: npm ci`,
    'missing': `does not exist in ${set}`,
    'hidden': `is marked hidden in ${set}: the brand was removed and a later update drops the icon. Pick another one`,
  }[status]
  return `Icon "${name}" ${reason}. ${BROWSE}`
}

interface IndexEntry {
  /** `prefix:name`. */
  full: string
  setOrder: number
  name: string
  /** The name without its hyphens: `twitter-x` -> `twitterx`. */
  compact: string
  segments: string[]
}

export interface IconSetStats {
  set: IconSet
  /** Keys of `icons` plus keys of `aliases`. */
  names: number
  hidden: number
  indexed: number
}

interface IconIndex {
  entries: IndexEntry[]
  visible: Set<string>
  stats: IconSetStats[]
}

let cachedIndex: IconIndex | undefined

function buildIndex(): IconIndex {
  const entries: IndexEntry[] = []
  const stats: IconSetStats[] = []
  ICON_SETS.forEach((set, setOrder) => {
    const pack = loadPack(set)
    if (!pack) throw new Error(`The icon pack @iconify-json/${set} is not installed or not a valid Iconify pack. Run: npm ci`)
    const names = [...Object.keys(pack.icons), ...Object.keys(pack.aliases ?? {})]
    let hidden = 0
    let indexed = 0
    for (const name of names) {
      const full = `${set}:${name}`
      const icon = resolveInPack(pack, name)
      if (!icon || icon.hidden || !ICON_NAME_RE.test(full)) {
        hidden += icon?.hidden ? 1 : 0
        continue
      }
      indexed++
      entries.push({ full, setOrder, name, compact: name.replaceAll('-', ''), segments: name.split('-') })
    }
    stats.push({ set, names: names.length, hidden, indexed })
  })
  // The order inside one rank: line-md first, then the shorter name, then the alphabet.
  entries.sort((a, b) => a.setOrder - b.setOrder || a.name.length - b.name.length || a.name.localeCompare(b.name, 'en'))
  return { entries, visible: new Set(entries.map(entry => entry.full)), stats }
}

/** Built once per process. Throws one clear line when a pack is missing. */
function iconIndex(): IconIndex {
  cachedIndex ??= buildIndex()
  return cachedIndex
}

/** Per set: how many names the pack has, how many are hidden, how many the search knows. Builds the index. */
export function iconIndexStats(): IconSetStats[] {
  return iconIndex().stats
}

/** Shown for an empty query, so the grid is never blank: the UI icons, then the networks. */
export function defaultIcons(): string[] {
  const { visible } = iconIndex()
  const names = [...Object.values(UI_ICONS), ...Object.values(NETWORKS).map(network => network.icon)]
  return [...new Set<string>(names)].filter(name => visible.has(name)).slice(0, ICON_SEARCH_LIMIT)
}

/** Lower case, trimmed, cut to `MAX_ICON_QUERY`. */
export function normalizeIconQuery(query: string): string {
  return query.toLowerCase().trim().slice(0, MAX_ICON_QUERY).trim()
}

/** 0 exact, 1 starts with, 2 every token starts a name segment, 3 contains. `undefined` = no match. */
function rankOf(entry: IndexEntry, tokens: string[], hyphened: string, compact: string): number | undefined {
  if (entry.name === hyphened || entry.compact === compact) return 0
  if (entry.name.startsWith(hyphened) || entry.compact.startsWith(compact)) return 1
  if (tokens.every(token => entry.segments.some(segment => segment.startsWith(token)))) return 2
  if (entry.name.includes(hyphened) || entry.compact.includes(compact)) return 3
  return undefined
}

export interface IconSearchResult {
  icons: string[]
  sets: readonly IconSet[]
  /** Every match, before the cut to `ICON_SEARCH_LIMIT`. */
  total: number
}

/**
 * The local search. Tokens are split on spaces and hyphens, so `you tube` finds `youtube` and
 * `twitter x` finds `twitter-x`. Rank: exact name, name starts with the query, every token
 * starts a name segment, name contains the query. Inside one rank: `line-md` first, then the
 * shorter name, then the alphabet. A full name (`line-md:github`) that exists comes first; a
 * prefix that is not one of the two sets (`lucide:mail`) is dropped and the rest is searched.
 */
export function searchIcons(query: string): IconSearchResult {
  const { entries, visible } = iconIndex()
  const q = normalizeIconQuery(query)
  if (!q) {
    const icons = defaultIcons()
    return { icons, sets: ICON_SETS, total: icons.length }
  }
  const exact = ICON_NAME_RE.test(q) && visible.has(q) ? q : undefined
  const term = q.includes(':') ? q.slice(q.indexOf(':') + 1) : q
  const tokens = term.replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
  const ranked: { full: string, rank: number }[] = []
  if (tokens.length) {
    const hyphened = tokens.join('-')
    const compact = tokens.join('')
    for (const entry of entries) {
      if (entry.full === exact) continue
      const rank = rankOf(entry, tokens, hyphened, compact)
      if (rank !== undefined) ranked.push({ full: entry.full, rank })
    }
    // `entries` is already in tie-break order and `sort` is stable.
    ranked.sort((a, b) => a.rank - b.rank)
  }
  const all = [...(exact ? [exact] : []), ...ranked.map(item => item.full)]
  return { icons: all.slice(0, ICON_SEARCH_LIMIT), sets: ICON_SETS, total: all.length }
}

/** A body that could act as a page is refused. The two packs have none: this is the second layer. */
const UNSAFE_BODY = /<script|<foreignObject|\son[a-z]+\s*=|javascript:|<iframe|<!ENTITY/i
const HEX_COLOR = /^[0-9a-f]{6}$/i

/**
 * The icon as one SVG document, from the local pack. `null` for a name outside the two sets,
 * a missing icon and a hidden icon. `color` is six hex digits without `#`: an `<img>` cannot
 * inherit `currentColor`, so the editor passes its ink color. Without it the SVG keeps `currentColor`.
 */
export function buildIconSvg(name: string, color?: string): string | null {
  const set = iconSetOf(name)
  if (!set) return null
  const pack = loadPack(set)
  if (!pack) return null
  const icon = resolveInPack(pack, name.slice(set.length + 1))
  if (!icon || icon.hidden || UNSAFE_BODY.test(icon.body)) return null
  const body = color !== undefined && HEX_COLOR.test(color) ? icon.body.replaceAll('currentColor', `#${color.toLowerCase()}`) : icon.body
  const box = `${icon.left} ${icon.top} ${icon.width} ${icon.height}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${icon.width}" height="${icon.height}" viewBox="${box}">${body}</svg>\n`
}
