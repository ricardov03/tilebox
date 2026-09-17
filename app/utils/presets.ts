/**
 * Design presets. Source of truth for colors and fonts.
 * `scripts/build-presets.ts` turns this file into `app/assets/css/presets.css`.
 * `scripts/check-contrast.ts` checks WCAG contrast for every preset.
 * Values come from PLAN.md section 5.
 */

export const COLOR_ROLES = [
  'ground',
  'tile',
  'line',
  'ink',
  'muted',
  'accent',
  'accent-ink',
  'accent-soft',
  'pop',
  'pop-ink',
  'dot',
  'photo',
  'hover',
] as const

export type ColorRole = (typeof COLOR_ROLES)[number]

export type ColorSet = Record<ColorRole, string>

export interface ColorPreset {
  label: string
  light: ColorSet
  dark: ColorSet
}

export const COLOR_PRESET_IDS = ['condomera', 'lunchbox', 'night'] as const
export type ColorPresetId = (typeof COLOR_PRESET_IDS)[number]

export const COLOR_PRESETS: Record<ColorPresetId, ColorPreset> = {
  condomera: {
    label: 'CONDOMERA',
    light: {
      'ground': '#EEF4F8',
      'tile': '#FFFFFF',
      'line': 'rgba(12,74,110,0.10)',
      'ink': '#0B1F33',
      'muted': '#4A6075',
      'accent': '#0C4A6E',
      'accent-ink': '#FFFFFF',
      'accent-soft': '#BAE6FD',
      'pop': '#0369A1',
      'pop-ink': '#FFFFFF',
      'dot': '#0EA5E9',
      'photo': '#C7DEEC',
      'hover': '#0369A1',
    },
    dark: {
      'ground': '#081726',
      'tile': '#0F2438',
      'line': '#1E3A55',
      'ink': '#EAF3FA',
      'muted': '#9FB6CA',
      'accent': '#38BDF8',
      'accent-ink': '#081726',
      'accent-soft': '#0A3D5C',
      'pop': '#38BDF8',
      'pop-ink': '#081726',
      'dot': '#38BDF8',
      'photo': '#16324B',
      'hover': '#7DD3FC',
    },
  },
  lunchbox: {
    label: 'Lunchbox',
    light: {
      'ground': '#E8EBE4',
      'tile': '#FFFFFF',
      'line': 'rgba(27,33,28,0.08)',
      'ink': '#1B211C',
      'muted': '#5A635B',
      'accent': '#3E6B3B',
      'accent-ink': '#FFFFFF',
      'accent-soft': '#DCE5D6',
      'pop': '#F0C24B',
      'pop-ink': '#1B211C',
      'dot': '#F0C24B',
      'photo': '#C9D3C2',
      'hover': '#3E6B3B',
    },
    dark: {
      'ground': '#161A17',
      'tile': '#1F2521',
      'line': 'rgba(238,241,236,0.10)',
      'ink': '#EEF1EC',
      'muted': '#A5ADA6',
      'accent': '#5C8F58',
      'accent-ink': '#0F140F',
      'accent-soft': '#0F1A0D',
      'pop': '#F0C24B',
      'pop-ink': '#1B211C',
      'dot': '#F0C24B',
      'photo': '#2A332C',
      'hover': '#8FBF8B',
    },
  },
  night: {
    label: 'Night',
    light: {
      'ground': '#F2F3F6',
      'tile': '#FFFFFF',
      'line': '#DDE1EA',
      'ink': '#131826',
      'muted': '#5B6478',
      'accent': '#F3B33D',
      'accent-ink': '#131826',
      'accent-soft': '#0C4A6E',
      'pop': '#F3B33D',
      'pop-ink': '#131826',
      'dot': '#F3B33D',
      'photo': '#232B40',
      'hover': '#855400',
    },
    dark: {
      'ground': '#131826',
      'tile': '#1B2233',
      'line': '#2B3448',
      'ink': '#EEF1F7',
      'muted': '#9AA3B8',
      'accent': '#F3B33D',
      'accent-ink': '#131826',
      'accent-soft': '#0C4A6E',
      'pop': '#F3B33D',
      'pop-ink': '#131826',
      'dot': '#F3B33D',
      'photo': '#232B40',
      'hover': '#F3B33D',
    },
  },
}

export interface FontRole {
  /** Google Fonts family name. */
  family: string
  /** Weights to download. */
  weights: number[]
  /** Extra CSS for this role, for example `font-variation-settings`. */
  style?: string
}

export interface FontPreset {
  label: string
  display: FontRole
  body: FontRole
  mono: FontRole
}

export const FONT_PRESET_IDS = ['geist', 'lunchbox', 'night'] as const
export type FontPresetId = (typeof FONT_PRESET_IDS)[number]

export const FONT_PRESETS: Record<FontPresetId, FontPreset> = {
  geist: {
    label: 'Geist',
    display: { family: 'Geist', weights: [600], style: 'letter-spacing: -0.04em' },
    body: { family: 'Geist', weights: [400, 500] },
    mono: { family: 'Geist Mono', weights: [400, 500] },
  },
  lunchbox: {
    label: 'Lunchbox',
    display: {
      family: 'Fraunces',
      weights: [500],
      style: 'font-variation-settings: "opsz" 144, "SOFT" 40; letter-spacing: -0.03em',
    },
    body: { family: 'Instrument Sans', weights: [400, 500, 600] },
    mono: { family: 'IBM Plex Mono', weights: [400, 500] },
  },
  night: {
    label: 'Night',
    display: {
      family: 'Bricolage Grotesque',
      weights: [700],
      style: 'font-variation-settings: "opsz" 96; letter-spacing: -0.045em',
    },
    body: { family: 'Bricolage Grotesque', weights: [400, 500] },
    mono: { family: 'JetBrains Mono', weights: [400, 500] },
  },
}

/** Generic fallback stacks appended after the Google Fonts family. */
export const FONT_FALLBACKS = {
  display: 'ui-sans-serif, system-ui, sans-serif',
  body: 'ui-sans-serif, system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const

export function fontStack(role: FontRole, kind: keyof typeof FONT_FALLBACKS): string {
  return `'${role.family}', ${FONT_FALLBACKS[kind]}`
}
