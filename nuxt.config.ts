import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { profilePath, ROOT } from './content/resolve'
import { PUBLIC_PROFILE_TEMPLATE } from './modules/public-profile'
import { parseProfile } from './types/profile'
import { FONT_PRESETS } from './app/utils/presets'
import { NETWORKS, UI_ICONS } from './app/utils/networks'
import { allBrandIcons, brandIconFor } from './app/utils/brand-icons'

// The profile is read here at config time (PLAN.md 5.4). content/resolve.ts
// picks content/profile.json (yours, not tracked) or the tracked example.
// A preset or icon change in the file needs a dev server restart.
// The app never imports this file: `#profile` is the sanitized copy that
// modules/public-profile.ts writes to `.nuxt/` (no hidden email in the bundle).
const profile = parseProfile(JSON.parse(readFileSync(profilePath(), 'utf8')))

/**
 * `public/thumbs/manifest.json` (YouTube thumbnails of video blocks) is written by
 * scripts/fetch-links.ts (pregenerate) and is not tracked. On a fresh clone, before that
 * script runs, the alias points at an empty module so `nuxt dev` and `nuxt typecheck` still work.
 * Link tiles need no manifest: their local files are fields of the block (WP10a).
 */
function manifestOrEmpty(dir: 'thumbs'): string {
  const file = resolve(ROOT, `public/${dir}/manifest.json`)
  return existsSync(file) ? file : resolve(ROOT, 'app/components/blocks/empty-manifest.ts')
}

/** Files that may be missing in a fresh clone, resolved once at config time. The app imports them by these names. */
const FILE_ALIASES = {
  '#profile': resolve(ROOT, '.nuxt', PUBLIC_PROFILE_TEMPLATE),
  '#manifest/thumbs': manifestOrEmpty('thumbs'),
}

/** tsconfig `paths` for the aliases above. Nuxt drops the extension when it derives paths from `alias`; a `.json` target needs it. */
const FILE_ALIAS_PATHS = Object.fromEntries(
  Object.entries(FILE_ALIASES).map(([name, file]) => [name, [relative(resolve(ROOT, '.nuxt'), file).split('\\').join('/')]]),
)

/** Font families for the chosen font preset only. Other presets are not downloaded. */
function fontsFor(presetId: typeof profile.profile.theme.fonts) {
  const preset = FONT_PRESETS[presetId]
  const byFamily = new Map<string, Set<number>>()
  for (const role of [preset.display, preset.body, preset.mono]) {
    const weights = byFamily.get(role.family) ?? new Set<number>()
    role.weights.forEach(w => weights.add(w))
    byFamily.set(role.family, weights)
  }
  return [...byFamily.entries()].map(([name, weights]) => ({
    name,
    provider: 'google' as const,
    weights: [...weights].sort((a, b) => a - b),
    styles: ['normal' as const],
    global: true,
  }))
}

/**
 * Every icon the public page can need: profile blocks + social map + UI icons.
 * A link block without `icon` gets its brand icon from the URL (app/utils/brand-icons.ts):
 * only the brands this profile uses go in the bundle, not the whole map.
 * Hidden blocks are skipped: the build drops them (`toPublicProfile`).
 */
function iconsIn(data: typeof profile, withHidden = false): string[] {
  const icons = new Set<string>()
  for (const block of data.blocks) {
    if (block.hidden && !withHidden) continue
    if ('icon' in block && block.icon) icons.add(block.icon)
    if (block.type === 'social') icons.add(NETWORKS[block.network].icon)
    if (block.type === 'link' && !block.icon) {
      const brand = brandIconFor(block.url)
      if (brand) icons.add(brand)
    }
  }
  Object.values(NETWORKS).forEach(n => icons.add(n.icon))
  Object.values(UI_ICONS).forEach(i => icons.add(i))
  return [...icons].sort()
}

/**
 * Folders under `public/` with files made from other people's bytes (fetched icons and images, uploads).
 * A file there is only an `<img>` source. Opened directly it must never act as a page of this origin:
 * no script, no network, sandboxed. `public/_headers` says the same for the static host (docs/security.md).
 */
const UNTRUSTED_ASSET_DIRS = ['icons', 'thumbs', 'blocks', 'site', 'site-uploads'] as const
const UNTRUSTED_ASSET_HEADERS = {
  'Content-Security-Policy': 'default-src \'none\'; style-src \'unsafe-inline\'; sandbox',
  'X-Content-Type-Options': 'nosniff',
}

export default defineNuxtConfig({
  modules: ['@nuxt/fonts', '@nuxt/icon', '@nuxt/eslint'],
  // `nuxt dev` only: the editor previews any pasted URL and hidden blocks at once, so every
  // brand icon is bundled there. The built site gets only the icons of its own profile.
  $development: {
    icon: { clientBundle: { icons: [...allBrandIcons(), ...iconsIn(profile, true)] } },
  },
  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: profile.profile.name,
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      /**
       * Absolute site URL for the canonical link, og:url, og:image and JSON-LD.
       * `NUXT_PUBLIC_SITE_URL` (the host's build env, `npm run publish` sets it) wins over `site.url` of the profile.
       */
      siteUrl: '',
    },
  },
  alias: FILE_ALIASES,

  routeRules: {
    '/edit': { prerender: false },
    '/api/**': { prerender: false },
    // The same headers as `public/_headers` (the static host reads that file), for `nuxt dev`.
    ...Object.fromEntries(UNTRUSTED_ASSET_DIRS.map(dir => [`/${dir}/**`, { headers: UNTRUSTED_ASSET_HEADERS }])),
  },

  features: {
    // One page, one CSS file: inline it and drop the render-blocking request.
    inlineStyles: true,
  },
  compatibilityDate: '2025-07-15',

  nitro: {
    prerender: {
      crawlLinks: true,
      autoSubfolderIndex: false,
      ignore: ['/edit', '/api'],
    },
  },
  vite: { plugins: [tailwindcss()] },

  typescript: {
    strict: true,
    tsConfig: { compilerOptions: { paths: FILE_ALIAS_PATHS } },
    // scripts/ and types/ are not app code. Typecheck them with the node project.
    nodeTsConfig: {
      include: ['../scripts/**/*', '../types/**/*', '../tests/**/*', '../playwright.config.ts'],
    },
  },

  eslint: {
    config: { stylistic: true },
  },

  fonts: {
    families: fontsFor(profile.profile.theme.fonts),
    // presets.css lists every preset's family in --font-* variables.
    // Do not scan them, or every preset would be downloaded. `global: true` above covers the active preset.
    processCSSVariables: false,
  },

  icon: {
    provider: 'none', // no runtime calls to api.iconify.design
    mode: 'svg', // line-md icons animate. CSS mask mode kills that.
    clientBundle: {
      scan: true,
      sizeLimitKb: 256,
      icons: iconsIn(profile),
    },
  },
})
