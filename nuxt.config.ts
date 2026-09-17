import tailwindcss from '@tailwindcss/vite'
import profileJson from './content/profile.json'
import { parseProfile } from './types/profile'
import { FONT_PRESETS } from './app/utils/presets'
import { NETWORKS, UI_ICONS } from './app/utils/networks'

// profile.json is read here at config time (PLAN.md 5.4).
// A preset or icon change in profile.json needs a dev server restart.
const profile = parseProfile(profileJson)

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

  routeRules: {
    '/edit': { prerender: false },
    '/api/**': { prerender: false },
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
    // scripts/ and types/ are not app code. Typecheck them with the node project.
    nodeTsConfig: {
      include: ['../scripts/**/*', '../types/**/*'],
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
