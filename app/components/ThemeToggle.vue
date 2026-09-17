<script setup lang="ts">
import type { ThemeMode } from '~/composables/useTheme'

const { mode, cycle } = useTheme()

const ICONS: Record<ThemeMode, string> = {
  system: 'line-md:monitor',
  light: 'line-md:sunny',
  dark: 'line-md:moon',
}
const LABELS: Record<ThemeMode, string> = {
  system: 'system',
  light: 'light',
  dark: 'dark',
}
const NEXT: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

const label = computed(() => `Theme: ${LABELS[mode.value]}. Switch to ${LABELS[NEXT[mode.value]]}.`)
</script>

<template>
  <button
    type="button"
    class="fixed top-4 right-4 z-10 flex size-11 items-center justify-center rounded-full border border-line bg-tile text-ink transition-colors duration-150 hover:text-hover md:top-6 md:right-6"
    :aria-label="label"
    :title="label"
    @click="cycle"
  >
    <!-- Client only: the stored mode is known after mount. Avoids a hydration mismatch. -->
    <ClientOnly>
      <Icon
        :name="ICONS[mode]"
        class="size-[22px]"
        aria-hidden="true"
      />
      <template #fallback>
        <span
          class="size-[22px]"
          aria-hidden="true"
        />
      </template>
    </ClientOnly>
  </button>
</template>
