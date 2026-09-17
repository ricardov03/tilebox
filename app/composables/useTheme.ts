/**
 * Theme mode: `system | light | dark`.
 *
 * - Initial value comes from `profile.theme.mode`.
 * - A visitor's choice is stored in localStorage under `tilebox:theme`.
 * - The resolved mode (`light | dark`) is written to `<html data-theme>`.
 * - For `system`, `prefers-color-scheme` decides and changes are followed.
 *
 * No flash on load: the prerendered HTML carries `data-theme` only when the
 * mode is fixed. A tiny inline script in `<head>` sets the attribute from
 * localStorage or `matchMedia` before the first paint. On the client this
 * composable reads the stored mode during setup, writes the attribute
 * directly (never through unhead) and keeps it in sync, so hydration cannot
 * overwrite what the inline script set.
 *
 * Call it in `app.vue` first (it installs there). Other components may call
 * it again to read state or cycle the mode.
 */
import type { Theme } from '~~/types/profile'
import { COLOR_PRESETS } from '~/utils/presets'

export type ThemeMode = Theme['mode']
export type ResolvedTheme = Exclude<ThemeMode, 'system'>

export const THEME_STORAGE_KEY = 'tilebox:theme'
/** Cycle order of the toggle: system -> light -> dark -> system. */
export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark']
const MEDIA_DARK = '(prefers-color-scheme: dark)'

/** Runs before paint. Keep under 300 bytes. Same rules as `readStoredMode` + `resolve`. */
const INLINE_SCRIPT = `!function(){var m,d=document.documentElement;try{m=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}`
  + `d.dataset.theme=m==="light"||m==="dark"?m:m==="system"||!d.dataset.theme?matchMedia("${MEDIA_DARK}").matches?"dark":"light":d.dataset.theme}()`

function isMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

function readStoredMode(): ThemeMode | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return isMode(value) ? value : null
  }
  catch {
    return null
  }
}

function writeStoredMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  }
  catch {
    // Private mode or storage blocked. The choice lives for this page view only.
  }
}

/** One install per Nuxt app instance (one per request on the server, one on the client). */
const installed = new WeakSet<object>()

export function useTheme() {
  const nuxtApp = useNuxtApp()
  const { profile } = useProfile()
  const theme = profile.profile.theme
  const preset = COLOR_PRESETS[theme.colors]

  const mode = useState<ThemeMode>('tilebox:theme:mode', () => theme.mode)
  const systemDark = useState<boolean>('tilebox:theme:system-dark', () => false)

  const resolved = computed<ResolvedTheme>(() =>
    mode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : mode.value,
  )

  function setMode(next: ThemeMode): void {
    mode.value = next
    writeStoredMode(next)
  }

  /** The mode after `mode` in the cycle order. */
  const nextMode = computed<ThemeMode>(() => {
    const index = THEME_MODES.indexOf(mode.value)
    return THEME_MODES[(index + 1) % THEME_MODES.length] ?? 'system'
  })

  /** system -> light -> dark -> system */
  function cycle(): void {
    setMode(nextMode.value)
  }

  if (!installed.has(nuxtApp)) {
    installed.add(nuxtApp)

    // Head: inline script, color-scheme and theme-color. Reactive to the mode.
    useHead(computed(() => ({
      meta: [
        { key: 'color-scheme', name: 'color-scheme', content: mode.value === 'system' ? 'light dark' : mode.value },
        ...(mode.value === 'system'
          ? [
              { key: 'theme-color-light', name: 'theme-color', media: '(prefers-color-scheme: light)', content: preset.light.ground },
              { key: 'theme-color-dark', name: 'theme-color', media: '(prefers-color-scheme: dark)', content: preset.dark.ground },
            ]
          : [{ key: 'theme-color', name: 'theme-color', content: preset[mode.value].ground }]),
      ],
      script: [{ key: 'tilebox-theme', innerHTML: INLINE_SCRIPT, tagPosition: 'head' as const }],
    })))

    // Server only: a fixed mode is prerendered. `system` leaves the attribute to the inline script.
    if (import.meta.server && theme.mode !== 'system') {
      useServerHead({ htmlAttrs: { 'data-theme': theme.mode } })
    }

    if (import.meta.client) {
      // Read everything during setup, before any child renders, so the toggle
      // shows the stored mode at its first client paint.
      const media = window.matchMedia(MEDIA_DARK)
      systemDark.value = media.matches
      const stored = readStoredMode()
      if (stored) mode.value = stored

      const onMediaChange = (event: MediaQueryListEvent) => {
        systemDark.value = event.matches
      }
      media.addEventListener('change', onMediaChange)
      onScopeDispose(() => media.removeEventListener('change', onMediaChange))

      // Straight to the DOM, immediately. Hydration does not touch attributes
      // that no vnode owns, so the inline script's value is never reverted.
      watch(resolved, (value) => {
        document.documentElement.dataset.theme = value
      }, { immediate: true })
    }
  }

  return { mode: readonly(mode), resolved, nextMode, setMode, cycle }
}
