/**
 * Social network map. PLAN.md section 5.5.
 * `network` in a social block is a key of this map.
 */

export interface NetworkInfo {
  /** Full Iconify name, for example `line-md:github`. */
  icon: string
  label: string
}

export const NETWORK_IDS = [
  'github',
  'linkedin',
  'x',
  'instagram',
  'youtube',
  'tiktok',
  'discord',
  'telegram',
  'mastodon',
  'spotify',
  'reddit',
  'facebook',
  'email',
  'whatsapp',
  'dribbble',
  'behance',
  'medium',
] as const

export type NetworkId = (typeof NETWORK_IDS)[number]

export const NETWORKS: Record<NetworkId, NetworkInfo> = {
  github: { icon: 'line-md:github', label: 'GitHub' },
  linkedin: { icon: 'line-md:linkedin', label: 'LinkedIn' },
  x: { icon: 'line-md:twitter-x', label: 'X' },
  instagram: { icon: 'line-md:instagram', label: 'Instagram' },
  youtube: { icon: 'line-md:youtube', label: 'YouTube' },
  tiktok: { icon: 'line-md:tiktok', label: 'TikTok' },
  discord: { icon: 'line-md:discord', label: 'Discord' },
  telegram: { icon: 'line-md:telegram', label: 'Telegram' },
  mastodon: { icon: 'line-md:mastodon', label: 'Mastodon' },
  spotify: { icon: 'line-md:spotify', label: 'Spotify' },
  reddit: { icon: 'line-md:reddit', label: 'Reddit' },
  facebook: { icon: 'line-md:facebook', label: 'Facebook' },
  email: { icon: 'line-md:email', label: 'Email' },
  whatsapp: { icon: 'simple-icons:whatsapp', label: 'WhatsApp' },
  dribbble: { icon: 'simple-icons:dribbble', label: 'Dribbble' },
  behance: { icon: 'simple-icons:behance', label: 'Behance' },
  medium: { icon: 'simple-icons:medium', label: 'Medium' },
}

/** Icons the UI itself uses, outside of profile.json. PLAN.md section 5.5. */
export const UI_ICONS = {
  link: 'line-md:link',
  external: 'line-md:external-link',
  map: 'line-md:map-marker',
  play: 'line-md:play',
  home: 'line-md:home',
  /** ThemeToggle: system, light, dark. */
  themeSystem: 'line-md:monitor',
  themeLight: 'line-md:sunny',
  themeDark: 'line-md:moon',
} as const
