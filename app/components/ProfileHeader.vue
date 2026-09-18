<script setup lang="ts">
import type { PublicProfileInfo } from '~~/types/profile'
import { UI_ICONS } from '~/utils/networks'

/** The public shape: `email` is set only when the owner chose to show it. */
const props = defineProps<{ profile: PublicProfileInfo }>()

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

/** Phones: three highlights get one line each, one or two get two lines. From md up: two lines. */
const highlightClamp = computed(() =>
  props.profile.highlights.length > 2 ? 'line-clamp-1 md:line-clamp-2' : 'line-clamp-2',
)
</script>

<template>
  <div class="flex h-full flex-col justify-between gap-2 overflow-hidden rounded-tile border border-line bg-tile p-6 md:gap-3 md:p-9">
    <img
      v-if="profile.avatar"
      :src="profile.avatar"
      alt=""
      width="96"
      height="96"
      :class="compact ? 'size-10 md:size-16' : 'size-16 md:size-24'"
      class="shrink-0 rounded-full bg-photo object-cover"
    >
    <div
      v-else
      :class="compact ? 'size-10 text-base md:size-16 md:text-[25px]' : 'size-16 text-[25px] md:size-24 md:text-[38px]'"
      class="flex shrink-0 items-center justify-center rounded-full bg-accent font-display text-accent-soft [font-weight:var(--font-display-weight)]"
      aria-hidden="true"
    >
      {{ initials }}
    </div>

    <div
      :class="compact ? 'gap-2 md:gap-3' : 'gap-2.5 md:gap-3.5'"
      class="flex min-h-0 flex-col"
    >
      <h1
        :class="compact ? 'text-4xl md:text-[56px]' : 'text-[42px] md:text-[68px]'"
        class="font-display leading-none [font-weight:var(--font-display-weight)]"
      >
        {{ profile.name }}
      </h1>
      <p
        :class="compact ? 'line-clamp-3 md:text-[17px]' : 'md:text-[19px]'"
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
          <span :class="highlightClamp">{{ highlight }}</span>
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
