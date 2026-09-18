/**
 * WP18: two icon sets, local search. No browser, no internet, no dev server.
 * The list of sets (app/utils/icon-sets.ts), the local index (content/icon-index.ts),
 * the profile migration (content/migrate.ts) and the installed packs (package.json).
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { resolveLinkIcon } from '../../app/components/blocks/media'
import { allBrandIcons } from '../../app/utils/brand-icons'
import { ICON_NAME_RE, ICON_SETS, ICON_SETS_MESSAGE, iconSetOf, isAllowedIconName } from '../../app/utils/icon-sets'
import { NETWORKS, UI_ICONS } from '../../app/utils/networks'
import {
  buildIconSvg,
  defaultIcons,
  ICON_SEARCH_LIMIT,
  iconIndexStats,
  iconProblem,
  iconStatus,
  MAX_ICON_QUERY,
  searchIcons,
} from '../../content/icon-index'
import { foreignIconAdvice, foreignIcons, migrateIconsText, removedIconLine } from '../../content/migrate'
import type { Profile } from '../../types/profile'
import {
  BlockSchema,
  blockDropReason,
  incompleteMessage,
  incompleteReason,
  LinkBlockSchema,
  ProfileSchema,
  toPublicProfile,
} from '../../types/profile'
import { ROOT } from './helpers'

const prefixOf = (name: string) => name.slice(0, name.indexOf(':'))

test.describe('the list of icon sets', () => {
  test('two sets, line-md first, and one pattern for a name', () => {
    expect([...ICON_SETS]).toEqual(['line-md', 'simple-icons'])
    expect(ICON_NAME_RE.source).toBe('^(line-md|simple-icons):[a-z0-9]+(?:-[a-z0-9]+)*$')
    for (const name of ['line-md:github', 'simple-icons:whatsapp', 'line-md:twitter-x-alt', 'simple-icons:1password']) {
      expect(isAllowedIconName(name), name).toBe(true)
    }
    expect(iconSetOf('line-md:github')).toBe('line-md')
    expect(iconSetOf('simple-icons:github')).toBe('simple-icons')
  })

  test('another set and a bad shape are refused', () => {
    const bad = ['lucide:mail', 'mdi:home', 'line-md', 'line-md:', 'github', 'line-md:GitHub', 'line-md:a--b', 'line-md:-a', 'line-md:a-', ' line-md:github', 'line-md:github ', 'xline-md:github', 'line-md:a:b', '', 7, null, undefined]
    for (const name of bad) {
      expect(isAllowedIconName(name), String(name)).toBe(false)
      expect(iconSetOf(name), String(name)).toBeUndefined()
    }
  })

  test('the profile schema uses the same rule and names the two sets', () => {
    expect(LinkBlockSchema.shape.icon.safeParse('line-md:github').success).toBe(true)
    const refused = LinkBlockSchema.shape.icon.safeParse('lucide:mail')
    expect(refused.success).toBe(false)
    expect(refused.error?.issues[0]?.message).toBe('Use an icon from line-md or simple-icons')
  })

  test('package.json installs exactly the packs of ICON_SETS, and they are on disk', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>
    const listed = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
      .flatMap(group => Object.keys(pkg[group] ?? {}))
      .filter(name => name.startsWith('@iconify-json/'))
      .sort()
    expect(listed).toEqual(ICON_SETS.map(set => `@iconify-json/${set}`).sort())
    expect(readdirSync(resolve(ROOT, 'node_modules/@iconify-json')).filter(name => !name.startsWith('.')).sort()).toEqual([...ICON_SETS].sort())
  })

  test('every icon the code names is usable: UI_ICONS, NETWORKS, the brand map', () => {
    const names = [...Object.values(UI_ICONS), ...Object.values(NETWORKS).map(network => network.icon), ...allBrandIcons()]
    for (const name of names) {
      expect(isAllowedIconName(name), name).toBe(true)
      expect(iconProblem(name), name).toBeNull()
    }
  })
})

test.describe('the local index', () => {
  test('builds fast, and a query over both sets is fast', () => {
    const startBuild = performance.now()
    const stats = iconIndexStats()
    const buildMs = performance.now() - startBuild
    expect(buildMs).toBeLessThan(1500)
    expect(stats.map(item => item.set)).toEqual([...ICON_SETS])
    for (const item of stats) {
      expect(item.indexed, item.set).toBeGreaterThan(1000)
      expect(item.indexed + item.hidden, item.set).toBe(item.names)
    }
    for (const q of ['a', 'github', 'you tube', 'line-md:github', 'zzzzzz']) {
      const start = performance.now()
      searchIcons(q)
      expect(performance.now() - start, q).toBeLessThan(50)
    }
  })

  test('hidden icons are left out: the brands simple-icons removed, and an alias of a hidden icon', () => {
    expect(iconStatus('simple-icons:linkedin')).toBe('hidden')
    expect(iconStatus('line-md:linkedin')).toBe('ok')
    const { icons } = searchIcons('linkedin')
    expect(icons).toContain('line-md:linkedin')
    expect(icons).not.toContain('simple-icons:linkedin')
    // `amazonaws` is an alias of `amazonwebservices`, which is hidden.
    expect(iconStatus('simple-icons:amazonaws')).toBe('hidden')
    expect(searchIcons('amazonaws').icons).not.toContain('simple-icons:amazonaws')
    for (const q of ['slack', 'amazon', 'twitter']) {
      for (const name of searchIcons(q).icons) expect(iconStatus(name), name).toBe('ok')
    }
  })

  test('an alias that is not hidden is found', () => {
    // `line-md:arrow-long-diagonal` is an alias of `arrows-long-diagonal`.
    expect(iconStatus('line-md:arrow-long-diagonal')).toBe('ok')
    expect(searchIcons('arrow-long-diagonal').icons[0]).toBe('line-md:arrow-long-diagonal')
  })

  test('ranking for "git": the exact name, then "starts with" (line-md first), never a name that only contains it', () => {
    const { icons, total, sets } = searchIcons('git')
    expect([...sets]).toEqual([...ICON_SETS])
    expect(icons[0]).toBe('simple-icons:git')
    expect(icons.slice(1, 5)).toEqual(['line-md:github', 'line-md:github-loop', 'line-md:github-twotone', 'line-md:github-twotone-loop'])
    expect(prefixOf(icons[5] ?? '')).toBe('simple-icons')
    const firstContains = icons.findIndex(name => !name.slice(name.indexOf(':') + 1).startsWith('git'))
    const lastStarts = icons.findLastIndex(name => name.slice(name.indexOf(':') + 1).startsWith('git'))
    if (firstContains !== -1) expect(firstContains).toBeGreaterThan(lastStarts)
    expect(total).toBeGreaterThanOrEqual(icons.length)
  })

  test('ranking for "github": line-md before simple-icons in the same rank, then the shorter name', () => {
    const { icons } = searchIcons('github')
    expect(icons.slice(0, 3)).toEqual(['line-md:github', 'simple-icons:github', 'line-md:github-loop'])
  })

  test('ranking for "mail": names that start with it come before names that contain it', () => {
    const { icons } = searchIcons('mail')
    const name = (full: string) => full.slice(full.indexOf(':') + 1)
    expect(name(icons[0] ?? '').startsWith('mail')).toBe(true)
    const email = icons.indexOf('line-md:email')
    expect(email).toBeGreaterThan(-1)
    for (const before of icons.slice(0, email)) expect(name(before).startsWith('mail'), before).toBe(true)
    // Inside the "contains" rank: the shorter name first.
    expect(icons.indexOf('line-md:email')).toBeLessThan(icons.indexOf('line-md:email-plus'))
    // `mail` cannot show the set tie-break: line-md has 48 `email-*` icons, so no simple-icons
    // "contains" match fits in one page. `tube` has 16 matches, all in the "contains" rank.
    const tube = searchIcons('tube').icons
    expect(tube[0]).toBe('line-md:youtube')
    expect(tube.indexOf('line-md:peertube')).toBeLessThan(tube.indexOf('line-md:peertube-alt'))
    expect(tube.findLastIndex(full => full.startsWith('line-md:'))).toBeLessThan(tube.findIndex(full => full.startsWith('simple-icons:')))
  })

  test('ranking for "you tube": tokens are joined, so both youtube icons come first', () => {
    const { icons } = searchIcons('you tube')
    expect(icons.slice(0, 2)).toEqual(['line-md:youtube', 'simple-icons:youtube'])
    expect(icons.slice(2).every(name => name.includes('youtube'))).toBe(true)
    expect(searchIcons('twitter x').icons[0]).toBe('line-md:twitter-x')
    expect(searchIcons('  YouTube ').icons[0]).toBe('line-md:youtube')
  })

  test('a full name that exists is the first result', () => {
    expect(searchIcons('simple-icons:github').icons.slice(0, 2)).toEqual(['simple-icons:github', 'line-md:github'])
    expect(searchIcons('line-md:github-loop').icons[0]).toBe('line-md:github-loop')
    // A full name of a hidden or missing icon is not invented.
    expect(searchIcons('simple-icons:linkedin').icons).toEqual(['line-md:linkedin'])
    expect(searchIcons('line-md:not-an-icon-name').icons).toEqual([])
  })

  test('another set in the query is dropped: only names of the two sets come back', () => {
    const { icons } = searchIcons('lucide:mail')
    expect(icons.length).toBeGreaterThan(0)
    expect(icons).toEqual(searchIcons('mail').icons)
    for (const name of icons) expect(isAllowedIconName(name), name).toBe(true)
  })

  test('an empty query returns the default list, never a blank grid', () => {
    for (const q of ['', '   ']) {
      const { icons, total } = searchIcons(q)
      expect(icons).toEqual(defaultIcons())
      expect(total).toBe(icons.length)
      expect(icons.length).toBeGreaterThan(10)
      expect(icons.length).toBeLessThanOrEqual(ICON_SEARCH_LIMIT)
      expect(new Set(icons).size).toBe(icons.length)
      expect(icons).toContain(UI_ICONS.link)
      expect(icons).toContain(NETWORKS.github.icon)
      for (const name of icons) expect(iconStatus(name), name).toBe('ok')
    }
  })

  test('at most 48 names, the query is cut to 64 characters, and odd input matches nothing', () => {
    const many = searchIcons('a')
    expect(many.icons.length).toBe(ICON_SEARCH_LIMIT)
    expect(many.total).toBeGreaterThan(ICON_SEARCH_LIMIT)
    expect(MAX_ICON_QUERY).toBe(64)
    const padding = ' '.repeat(MAX_ICON_QUERY - 'github'.length)
    // The text after character 64 is never read.
    expect(searchIcons(`github${padding}zzzz`).icons).toEqual(searchIcons('github').icons)
    expect(searchIcons('z'.repeat(5000)).icons).toEqual([])
    for (const q of ['!!!', '../../etc/passwd', '<script>', ':', '::', '%00']) {
      for (const name of searchIcons(q).icons) expect(isAllowedIconName(name), `${q} -> ${name}`).toBe(true)
    }
    expect(searchIcons('!!!').icons).toEqual([])
  })
})

test.describe('one rule for the save route and check:icons', () => {
  test('foreign set, missing icon, hidden icon: each message names the two sets and where to browse', () => {
    expect(iconStatus('lucide:mail')).toBe('foreign')
    expect(iconStatus('line-md:not-an-icon-name')).toBe('missing')
    expect(iconProblem('line-md:github')).toBeNull()
    for (const name of ['lucide:mail', 'line-md:not-an-icon-name', 'simple-icons:linkedin']) {
      const problem = iconProblem(name) ?? ''
      expect(problem, name).toContain(`Icon "${name}"`)
      expect(problem, name).toContain('https://icones.js.org/collection/line-md')
      expect(problem, name).toContain('https://icones.js.org/collection/simple-icons')
    }
    expect(iconProblem('lucide:mail')).toContain('only line-md and simple-icons')
    expect(iconProblem('simple-icons:linkedin')).toContain('hidden')
  })
})

test.describe('the SVG of one icon', () => {
  test('a valid SVG document from the local pack, with currentColor and nothing that runs', () => {
    for (const name of ['line-md:github', 'simple-icons:whatsapp', 'line-md:arrow-long-diagonal']) {
      const svg = buildIconSvg(name) ?? ''
      expect(svg, name).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="24" height="24" viewBox="0 0 24 24">.+<\/svg>\n$/s)
      expect(svg, name).toContain('currentColor')
      expect(svg, name).not.toMatch(/<script|<foreignObject|\son[a-z]+\s*=|javascript:|<iframe|https?:\/\/(?!www\.w3\.org\/2000\/svg")/i)
      expect(svg.match(/<svg/g)?.length, name).toBe(1)
    }
  })

  test('a color replaces currentColor; a bad color is ignored', () => {
    const tinted = buildIconSvg('line-md:github', 'A1B2C3') ?? ''
    expect(tinted).toContain('#a1b2c3')
    expect(tinted).not.toContain('currentColor')
    expect(buildIconSvg('line-md:github', '"/><script>')).toBe(buildIconSvg('line-md:github'))
  })

  test('another set, a missing icon and a hidden icon give null', () => {
    for (const name of ['lucide:mail', 'line-md:not-an-icon-name', 'simple-icons:linkedin', 'simple-icons:amazonaws', '../x', '']) {
      expect(buildIconSvg(name), name).toBeNull()
    }
  })
})

test.describe('the editor routes ask no other host', () => {
  test('the search route, the svg route and the index import no network code', () => {
    const files = ['server/api/icons/search.get.ts', 'server/api/icons/svg.get.ts', 'content/icon-index.ts', 'app/utils/icon-sets.ts']
    for (const file of files) {
      const source = readFileSync(resolve(ROOT, file), 'utf8')
      const code = source.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')
      expect(code, file).not.toMatch(/\bfetch\s*\(|\$fetch|ofetch|undici|node:https?|node:net|node:dns|node:tls|XMLHttpRequest|WebSocket|api\.iconify\.design/)
      const imports = [...code.matchAll(/from\s+'([^']+)'|import\('([^']+)'\)/g)].map(match => match[1] ?? match[2] ?? '')
      const allowed = /^(zod|node:fs|node:module|node:path|\.\.?\/|~~\/(content\/icon-index|app\/utils\/icon-sets)$)/
      for (const name of imports) expect(name, `${file} imports ${name}`).toMatch(allowed)
    }
  })
})

test.describe('the profile migration', () => {
  const profileText = (): string => {
    const data = JSON.parse(readFileSync(resolve(ROOT, 'content/profile.example.json'), 'utf8')) as { blocks: Record<string, unknown>[] }
    const links = data.blocks.filter(block => block.type === 'link')
    const [first, second] = links
    if (!first || !second) throw new Error('The example profile needs two link blocks for this test.')
    // `icon` in the middle of the block, and `icon` as the LAST key (the byte-stable path cannot cut that one).
    first.icon = 'lucide:mail'
    delete second.icon
    second.icon = 'mdi:home'
    return `${JSON.stringify(data, null, 2)}\n`
  }

  test('removes an icon of another set from a temp profile, says so once per block, and is idempotent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tilebox-icons-'))
    try {
      const file = join(dir, 'profile.json')
      writeFileSync(file, profileText(), 'utf8')
      const before = JSON.parse(readFileSync(file, 'utf8')) as { blocks: { id: string, icon?: string }[] }
      expect(foreignIcons(before).map(item => item.icon)).toEqual(['lucide:mail', 'mdi:home'])

      const result = migrateIconsText(readFileSync(file, 'utf8'))
      expect(result).not.toBeNull()
      if (!result) return
      writeFileSync(file, result.text, 'utf8')
      expect(result.removed.map(removedIconLine)).toEqual(before.blocks
        .filter(block => block.icon === 'lucide:mail' || block.icon === 'mdi:home')
        .map(block => `profile: removed icon "${block.icon}" from block ${block.id} (only line-md and simple-icons are supported)`))

      const after = JSON.parse(readFileSync(file, 'utf8')) as { blocks: { id: string, icon?: string }[] }
      expect(after.blocks.length).toBe(before.blocks.length)
      for (const block of after.blocks) if (block.icon !== undefined) expect(isAllowedIconName(block.icon), block.id).toBe(true)
      // Nothing else changed.
      const stripped = { ...before, blocks: before.blocks.map(block => (isAllowedIconName(block.icon) ? block : Object.fromEntries(Object.entries(block).filter(([key]) => key !== 'icon')))) }
      expect(after).toEqual(stripped)
      // 2-space JSON and a final newline, the shape the editor writes.
      expect(readFileSync(file, 'utf8')).toBe(`${JSON.stringify(after, null, 2)}\n`)
      // A second run has nothing to do.
      expect(migrateIconsText(readFileSync(file, 'utf8'))).toBeNull()
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('cuts only the icon line when it can, so a hand-made file keeps its own layout', () => {
    const text = '{\n\t"profile": {},\n\t"blocks": [\n\t\t{ "id": "a", "type": "link",\n\t\t\t"icon": "lucide:mail",\n\t\t\t"url": "https://example.com" }\n\t]\n}\n'
    const result = migrateIconsText(text)
    expect(result?.text).toBe('{\n\t"profile": {},\n\t"blocks": [\n\t\t{ "id": "a", "type": "link",\n\t\t\t"url": "https://example.com" }\n\t]\n}\n')
  })

  test('leaves the two sets, a name without a prefix and other files alone', () => {
    expect(migrateIconsText(readFileSync(resolve(ROOT, 'content/profile.example.json'), 'utf8'))).toBeNull()
    expect(migrateIconsText('{"profile":{},"blocks":[{"id":"a","icon":"line-md:github"},{"id":"b","icon":"github"}]}')).toBeNull()
    expect(migrateIconsText('not json')).toBeNull()
    expect(migrateIconsText('[]')).toBeNull()
    expect(foreignIconAdvice({ id: 'b1', icon: 'lucide:mail' })).toContain('npm run ensure:profile')
  })
})

/**
 * WP19: WP17 (every field optional, the `incomplete` drop reason) and WP18 (icons
 * from the two sets only) met for the first time on this branch. These tests hold
 * the two seams that meeting created.
 */
test.describe('WP19: the relaxed schema keeps the icon rule', () => {
  /** Every block schema of the union that HAS an `icon` field. A new block type is covered by itself. */
  const iconBlocks = BlockSchema.options.filter(option => 'icon' in option.shape)
  const sizeFor = (type: string) => (type === 'qr' ? '2x2' : '1x1')

  test('every block type with an icon refuses another set, whatever WP17 made optional', () => {
    expect(iconBlocks.length).toBeGreaterThan(0)
    for (const option of iconBlocks) {
      const type = option.shape.type.value
      for (const bad of ['lucide:mail', 'mdi:home', 'github', 'line-md', '', ' line-md:github']) {
        const parsed = option.safeParse({ id: 'b1', type, size: sizeFor(type), icon: bad })
        expect(parsed.success, `${type} + ${JSON.stringify(bad)}`).toBe(false)
        const issue = parsed.error?.issues.find(item => item.path[0] === 'icon')
        expect(issue?.message, `${type} + ${JSON.stringify(bad)}`).toBe(ICON_SETS_MESSAGE)
      }
      // The same block WITH an allowed icon and NOTHING else is valid: WP17's relaxation is real.
      expect(option.safeParse({ id: 'b1', type, size: sizeFor(type), icon: 'line-md:github' }).success, type).toBe(true)
    }
  })

  test('an emptied icon is never accepted as "": the key has to be absent', () => {
    // WP17 removes a key instead of writing "". The schema is the second layer.
    expect(LinkBlockSchema.safeParse({ id: 'b1', type: 'link', size: '1x1', icon: '' }).success).toBe(false)
    expect(LinkBlockSchema.safeParse({ id: 'b1', type: 'link', size: '1x1' }).success).toBe(true)
  })

  test('a whole saved profile with nothing but a name still refuses a foreign icon', () => {
    // The most relaxed file WP17 allows: no handle, no bio, no email, a link with no title and no url.
    const minimal = {
      profile: { name: 'Ada', theme: { colors: 'condomera', fonts: 'geist', mode: 'system' } },
      blocks: [{ id: 'b1', type: 'link', size: '1x1' } as Record<string, unknown>],
      layout: { desktop: ['b1'], mobile: ['b1'] },
    }
    expect(ProfileSchema.safeParse(minimal).success).toBe(true)

    minimal.blocks[0]!.icon = 'lucide:mail'
    const parsed = ProfileSchema.safeParse(minimal)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.some(issue => issue.message === ICON_SETS_MESSAGE)).toBe(true)

    // The allowed one passes in the same minimal file: only the icon rule refused it.
    minimal.blocks[0]!.icon = 'simple-icons:github'
    expect(ProfileSchema.safeParse(minimal).success).toBe(true)
  })
})

test.describe('WP19: an icon the migration removed never makes a block incomplete', () => {
  /** The example profile with a foreign icon on one https link block, as an old file would have it. */
  function oldProfileText(): { text: string, blockId: string, url: string } {
    const data = JSON.parse(readFileSync(resolve(ROOT, 'content/profile.example.json'), 'utf8')) as {
      blocks: Record<string, unknown>[]
    }
    const link = data.blocks.find(block => block.type === 'link' && typeof block.url === 'string'
      && (block.url as string).startsWith('https://'))
    if (!link) throw new Error('The example profile needs a link block with an https URL.')
    link.icon = 'lucide:mail'
    return { text: `${JSON.stringify(data, null, 2)}\n`, blockId: link.id as string, url: link.url as string }
  }

  function migrated(): Profile {
    const result = migrateIconsText(oldProfileText().text)
    if (!result) throw new Error('the migration had work to do')
    return ProfileSchema.parse(JSON.parse(result.text))
  }

  test('the migration removes the icon, the block stays valid and is NOT incomplete', () => {
    const { text, blockId } = oldProfileText()
    const result = migrateIconsText(text)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.removed.map(item => item.icon)).toEqual(['lucide:mail'])

    const block = ProfileSchema.parse(JSON.parse(result.text)).blocks.find(item => item.id === blockId)
    expect(block, blockId).toBeDefined()
    if (!block) return
    expect('icon' in block ? block.icon : undefined).toBeUndefined()
    // The seam: the icon is gone, but an icon is not an ESSENTIAL value, so the
    // tile is complete and the build keeps it.
    expect(incompleteReason(block)).toBeNull()
    expect(incompleteMessage(block)).toBeNull()
    expect(blockDropReason(block, new Date('2026-06-01T00:00:00Z'))).toBeNull()
  })

  test('it still renders: the automatic icon takes over, and it is a legal name', () => {
    const { blockId, url } = oldProfileText()
    const block = migrated().blocks.find(item => item.id === blockId)
    if (!block || block.type !== 'link') throw new Error('the migrated link block')

    const icon = resolveLinkIcon(block)
    // Never "manual": the own icon is gone. The brand icon of the URL, the local
    // favicon or the default link icon takes its place.
    if (icon.kind === 'icon') {
      expect(icon.source).not.toBe('manual')
      expect(isAllowedIconName(icon.name), icon.name).toBe(true)
      expect(iconProblem(icon.name), icon.name).toBeNull()
    }
    // With the foreign icon still on it, the picture came from that icon instead.
    const before = resolveLinkIcon({ ...block, icon: 'lucide:mail' })
    expect(before).toEqual({ kind: 'icon', name: 'lucide:mail', source: 'manual' })
    expect(icon).not.toEqual(before)
    expect(url.startsWith('https://')).toBe(true)
  })

  test('the build keeps the migrated block on the page, and no foreign name reaches it', () => {
    const { blockId } = oldProfileText()
    const published = toPublicProfile(migrated(), undefined, undefined, { now: new Date('2026-06-01T00:00:00Z') })
    const tile = published.blocks.find(item => item.id === blockId)
    expect(tile, `${blockId} must still be on the page`).toBeDefined()
    expect(published.layout.desktop).toContain(blockId)
    for (const item of published.blocks) {
      if ('icon' in item && typeof item.icon === 'string') expect(isAllowedIconName(item.icon), item.icon).toBe(true)
    }
  })
})
