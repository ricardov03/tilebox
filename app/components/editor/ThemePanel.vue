<!--
  Theme tab. Three color preset cards, three font preset cards, mode switch.
  Swatch colors come from COLOR_PRESETS (data, not hard-coded hex).
  Font labels render in the preset's display family when the browser has
  it; otherwise they fall back to the system stack.
-->
<script setup lang="ts">
import type { Theme } from '~~/types/profile'
import {
  COLOR_PRESET_IDS,
  COLOR_PRESETS,
  FONT_PRESET_IDS,
  FONT_PRESETS,
  fontStack,
  type ColorPresetId,
  type FontPresetId,
} from '~/utils/presets'

const model = defineModel<Theme>({ required: true })

const modes: { value: Theme['mode'], label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const SWATCH_ROLES = ['ground', 'tile', 'accent', 'pop'] as const

function setColors(colors: ColorPresetId) {
  model.value = { ...model.value, colors }
}

function setFonts(fonts: FontPresetId) {
  model.value = { ...model.value, fonts }
}

function setMode(mode: Theme['mode']) {
  model.value = { ...model.value, mode }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <fieldset class="flex flex-col gap-2 border-0 p-0">
      <legend class="mb-1 text-sm font-medium text-ink">
        Colors
      </legend>
      <div class="grid grid-cols-1 gap-2">
        <button
          v-for="id in COLOR_PRESET_IDS"
          :key="id"
          type="button"
          :aria-pressed="model.colors === id"
          :class="model.colors === id ? 'border-accent' : 'border-line hover:border-accent'"
          class="flex min-h-11 items-center gap-3 rounded-2xl border bg-ground p-2 text-left"
          @click="setColors(id)"
        >
          <span
            class="flex h-10 w-24 shrink-0 overflow-hidden rounded-lg border border-line"
            aria-hidden="true"
          >
            <span
              v-for="role in SWATCH_ROLES"
              :key="role"
              class="flex-1"
              :style="{ background: COLOR_PRESETS[id][model.mode === 'dark' ? 'dark' : 'light'][role] }"
            />
          </span>
          <span class="flex-1 text-sm font-medium text-ink">{{ COLOR_PRESETS[id].label }}</span>
          <span class="font-mono text-xs text-muted">{{ id }}</span>
        </button>
      </div>
    </fieldset>

    <fieldset class="flex flex-col gap-2 border-0 p-0">
      <legend class="mb-1 text-sm font-medium text-ink">
        Fonts
      </legend>
      <div class="grid grid-cols-1 gap-2">
        <button
          v-for="id in FONT_PRESET_IDS"
          :key="id"
          type="button"
          :aria-pressed="model.fonts === id"
          :class="model.fonts === id ? 'border-accent' : 'border-line hover:border-accent'"
          class="flex min-h-11 items-center gap-3 rounded-2xl border bg-ground p-3 text-left"
          @click="setFonts(id)"
        >
          <span
            class="text-2xl leading-none text-ink"
            :style="{ fontFamily: fontStack(FONT_PRESETS[id].display, 'display') }"
          >Aa</span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-sm font-medium text-ink">{{ FONT_PRESETS[id].label }}</span>
            <span class="truncate font-mono text-xs text-muted">{{ FONT_PRESETS[id].display.family }} · {{ FONT_PRESETS[id].body.family }} · {{ FONT_PRESETS[id].mono.family }}</span>
          </span>
        </button>
      </div>
      <p class="text-xs text-muted">
        A new font preset downloads after you save and restart <code class="font-mono">npm run dev</code>.
      </p>
    </fieldset>

    <fieldset class="flex flex-col gap-2 border-0 p-0">
      <legend class="mb-1 text-sm font-medium text-ink">
        Mode
      </legend>
      <div
        role="group"
        aria-label="Color mode"
        class="inline-flex self-start rounded-full border border-line bg-ground p-1"
      >
        <button
          v-for="mode in modes"
          :key="mode.value"
          type="button"
          :aria-pressed="model.mode === mode.value"
          :class="model.mode === mode.value ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'"
          class="min-h-11 rounded-full px-4 text-sm font-medium"
          @click="setMode(mode.value)"
        >
          {{ mode.label }}
        </button>
      </div>
    </fieldset>
  </div>
</template>
