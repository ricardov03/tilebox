import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { profilePath, ROOT } from './content/resolve'
import { parseProfile } from './types/profile'
import { FONT_PRESETS } from './app/utils/presets'
import { NETWORKS, UI_ICONS } from './app/utils/networks'

// The profile is read here at config time (PLAN.md 5.4). content/resolve.ts
// picks content/profile.json (yours, not tracked) or the tracked example.
// A preset or icon change in the file needs a dev server restart.
const PROFILE_PATH = profilePath()
const profile = parseProfile(JSON.parse(readFileSync(PROFILE_PATH, 'utf8')))

/**
 * `public/<dir>/manifest.json` is written by scripts/fetch-favicons.ts (pregenerate)
 * and is not tracked. On a fresh clone, before that script runs, the alias points
 * at an empty module so `nuxt dev` and `nuxt typecheck` still work.
 */
function manifestOrEmpty(dir: 'icons' | 'thumbs'): string {
  const file = resolve(ROOT, `public/${dir}/manifest.json`)
  return existsSync(file) ? file : resolve(ROOT, 'app/components/blocks/empty-manifest.ts')
}

/** Files that may be missing in a fresh clone, resolved once at config time. The app imports them by these names. */
const FILE_ALIASES = {
  '#profile': PROFILE_PATH,
  '#manifest/icons': manifestOrEmpty('icons'),
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

/** Every icon the public page can need: profile blocks + social map + UI icons. */
function iconsIn(data: typeof profile): string[] {
  const icons = new Set<string>()
  for (const block of data.blocks) {
    if ('icon' in block && block.icon) icons.add(block.icon)
    if (block.type === 'social') icons.add(NETWORKS[block.network].icon)
  }
  Object.values(NETWORKS).forEach(n => icons.add(n.icon))
  Object.values(UI_ICONS).forEach(i => icons.add(i))
  return [...icons].sort()
}

export default defineNuxtConfig({
  modules: ['@nuxt/fonts', '@nuxt/icon', '@nuxt/eslint'],
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
      /** Absolute site URL for og:image and og:url. Set `NUXT_PUBLIC_SITE_URL` in the host's build env. */
      siteUrl: '',
    },
  },
  alias: FILE_ALIASES,

  routeRules: {
    '/edit': { prerender: false },
    '/api/**': { prerender: false },
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
