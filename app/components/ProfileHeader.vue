<script setup lang="ts">
import type { PublicProfileInfo } from '~~/types/profile'
import { UI_ICONS } from '~/utils/networks'

const props = defineProps<{
  /** The public shape: `email` is set only when the owner chose to show it. */
  profile: PublicProfileInfo
  /**
   * Editor preview only. Its tiles are lower than the real desktop tile
   * (the preview row shrinks with the pane), so the compact scale stays at
   * the phone sizes there, at every viewport width.
   */
  small?: boolean
}>()

/** "Ricardo Vargas" -> "RV". One letter for a single word. */
const initials = computed(() =>
  props.profile.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join(''),
)

/**
 * The tile has a fixed height (500px desktop, 358px phone). With highlights or
 * a visible email the header switches to a compact scale, and every part gets
 * a line limit, so the worst case (long bio, 3 long highlights, email, status)
 * still fits. Without them the header keeps the original scale. NOTES.md, WP9.
 */
const compact = computed(() => props.profile.highlights.length > 0 || Boolean(props.profile.email))

type Part = 'avatar' | 'initials' | 'stack' | 'name' | 'bio' | 'highlight'

/** Original scale: no highlights, no visible email. */
const ROOMY: Record<Part, string> = {
  avatar: 'size-16 md:size-24',
  initials: 'size-16 text-[25px] md:size-24 md:text-[38px]',
  stack: 'gap-2.5 md:gap-3.5',
  name: 'text-[42px] md:text-[68px]',
  bio: 'md:text-[19px]',
  highlight: '',
}
/** Compact scale, phone sizes. Three highlights get one line each, one or two get two lines. */
const COMPACT: Record<Part, string> = {
  avatar: 'size-10',
  initials: 'size-10 text-base',
  stack: 'gap-2',
  name: 'text-4xl',
  bio: 'line-clamp-3',
  highlight: 'line-clamp-2',
}
/** Compact scale, what `md` adds on the real page. Two lines for every highlight. */
const COMPACT_MD: Record<Part, string> = {
  avatar: 'md:size-16',
  initials: 'md:size-16 md:text-[25px]',
  stack: 'md:gap-3',
  name: 'md:text-[56px]',
  bio: 'md:text-[17px]',
  highlight: 'md:line-clamp-2',
}

const classes = computed<Record<Part, string>>(() => {
  if (!compact.value) return ROOMY
  const base = { ...COMPACT, highlight: props.profile.highlights.length > 2 ? 'line-clamp-1' : 'line-clamp-2' }
  if (props.small) return base
  const both = (part: Part) => `${base[part]} ${COMPACT_MD[part]}`
  return {
    avatar: both('avatar'),
    initials: both('initials'),
    stack: both('stack'),
    name: both('name'),
    bio: both('bio'),
    highlight: both('highlight'),
  }
})
</script>

<template>
  <div class="flex h-full flex-col justify-between gap-2 overflow-hidden rounded-tile border border-line bg-tile p-6 md:gap-3 md:p-9">
    <img
      v-if="profile.avatar"
      :src="profile.avatar"
      alt=""
      width="96"
      height="96"
      :class="classes.avatar"
      class="shrink-0 rounded-full bg-photo object-cover"
    >
    <div
      v-else
      :class="classes.initials"
      class="flex shrink-0 items-center justify-center rounded-full bg-accent font-display text-accent-soft [font-weight:var(--font-display-weight)]"
      aria-hidden="true"
    >
      {{ initials }}
    </div>

    <div
      :class="classes.stack"
      class="flex min-h-0 flex-col"
    >
      <h1
        :class="classes.name"
        class="font-display leading-none [font-weight:var(--font-display-weight)]"
      >
        {{ profile.name }}
      </h1>
      <p
        :class="classes.bio"
        class="max-w-[34ch] text-base leading-[1.45] text-muted"
      >
        {{ profile.bio }}
      </p>
      <ul
        v-if="profile.highlights.length"
        class="flex list-none flex-col gap-1 p-0 md:gap-1.5"
        aria-label="Highlights"
      >
        <li
          v-for="(highlight, i) in profile.highlights"
          :key="i"
          class="flex items-baseline gap-2 text-sm leading-[1.4] text-ink md:gap-2.5 md:text-[15px]"
        >
          <span
            class="size-1.5 shrink-0 -translate-y-0.5 rounded-full bg-accent"
            aria-hidden="true"
          />
          <span :class="classes.highlight">{{ highlight }}</span>
        </li>
      </ul>
      <a
        v-if="profile.email"
        :href="`mailto:${profile.email}`"
        class="flex max-w-full items-center gap-2 self-start rounded-sm font-mono text-sm leading-5 text-muted hover:text-hover"
      >
        <Icon
          :name="UI_ICONS.email"
          class="size-4 shrink-0"
          :aria-hidden="true"
        />
        <span class="truncate">{{ profile.email }}</span>
      </a>
      <p
        v-if="profile.status"
        :class="compact ? '' : 'md:mt-1.5'"
        class="flex items-center gap-2 text-sm font-medium md:gap-2.5 md:text-[15px]"
      >
        <span
          class="size-2.5 shrink-0 animate-pulse rounded-full bg-dot motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span :class="compact ? 'truncate' : ''">{{ profile.status }}</span>
      </p>
    </div>
  </div>
</template>
