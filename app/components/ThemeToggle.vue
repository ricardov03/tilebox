<script setup lang="ts">
import type { ThemeMode } from '~/composables/useTheme'
import { UI_ICONS } from '~/utils/networks'

const { mode, nextMode, cycle } = useTheme()

const ICONS: Record<ThemeMode, string> = {
  system: UI_ICONS.themeSystem,
  light: UI_ICONS.themeLight,
  dark: UI_ICONS.themeDark,
}

const label = computed(() => `Theme: ${mode.value}. Switch to ${nextMode.value}.`)
const buttonClass = 'fixed top-4 right-4 z-10 flex size-11 items-center justify-center rounded-full border border-line bg-tile text-ink transition-colors duration-150 hover:text-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:top-6 md:right-6'
</script>

<template>
  <!--
    The whole button is client only. The stored mode is read on the client,
    so the label and icon would not match the prerendered markup. The
    fallback keeps the same box so nothing moves when it swaps in.
  -->
  <ClientOnly>
    <button
      type="button"
      :class="buttonClass"
      :aria-label="label"
      @click="cycle"
    >
      <Icon
        :name="ICONS[mode]"
        class="size-[22px]"
        :aria-hidden="true"
      />
    </button>
    <template #fallback>
      <button
        type="button"
        :class="buttonClass"
        aria-label="Theme"
        disabled
      >
        <span
          class="size-[22px]"
          :aria-hidden="true"
        />
      </button>
    </template>
  </ClientOnly>
</template>
