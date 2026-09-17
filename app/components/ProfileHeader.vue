<script setup lang="ts">
import type { ProfileInfo } from '~~/types/profile'

const props = defineProps<{ profile: ProfileInfo }>()

/** "Ricardo Vargas" -> "RV". One letter for a single word. */
const initials = computed(() =>
  props.profile.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join(''),
)
</script>

<template>
  <div class="flex h-full flex-col justify-between rounded-tile border border-line bg-tile p-6 md:p-9">
    <img
      v-if="profile.avatar"
      :src="profile.avatar"
      alt=""
      width="96"
      height="96"
      class="size-16 rounded-full bg-photo object-cover md:size-24"
    >
    <div
      v-else
      class="flex size-16 items-center justify-center rounded-full bg-accent font-display text-[25px] text-accent-soft [font-weight:var(--font-display-weight)] md:size-24 md:text-[38px]"
      aria-hidden="true"
    >
      {{ initials }}
    </div>

    <div class="flex flex-col gap-2.5 md:gap-3.5">
      <h1 class="font-display text-[42px] leading-none [font-weight:var(--font-display-weight)] md:text-[68px]">
        {{ profile.name }}
      </h1>
      <p class="max-w-[34ch] text-base leading-[1.45] text-muted md:text-[19px]">
        {{ profile.bio }}
      </p>
      <p
        v-if="profile.status"
        class="flex items-center gap-2 text-sm font-medium md:mt-1.5 md:gap-2.5 md:text-[15px]"
      >
        <span
          class="size-2.5 shrink-0 rounded-full bg-dot"
          aria-hidden="true"
        />
        <span>{{ profile.status }}</span>
      </p>
    </div>
  </div>
</template>
