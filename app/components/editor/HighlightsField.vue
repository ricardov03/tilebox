<!--
  Up to 3 highlights (the short lines under the bio). One input per slot,
  with a character counter. The inputs keep their place while you type;
  the model only gets the non-empty lines, so an empty input is never saved.
-->
<script setup lang="ts">
import { HIGHLIGHT_MAX_CHARS, HIGHLIGHTS_MAX } from '~~/types/profile'

const model = defineModel<string[]>({ required: true })

const slots = ref<string[]>([])

function fill(values: readonly string[]): string[] {
  return Array.from({ length: HIGHLIGHTS_MAX }, (_, i) => values[i] ?? '')
}

function filled(values: readonly string[]): string[] {
  return values.map(v => v.trim()).filter(v => v.length > 0)
}

// Re-sync only when the model changed from outside (load, undo), not on our own emit.
watch(model, (next) => {
  if (JSON.stringify(filled(slots.value)) !== JSON.stringify(next)) slots.value = fill(next)
}, { immediate: true, deep: true })

function onInput(index: number, event: Event) {
  const control = formControl(event)
  if (!control) return
  slots.value[index] = control.value.slice(0, HIGHLIGHT_MAX_CHARS)
  model.value = filled(slots.value)
}

const inputClass = INPUT_CLASS
</script>

<template>
  <fieldset class="flex flex-col gap-2 border-0 p-0">
    <legend :class="LABEL_CLASS">
      Highlights <span class="font-normal text-muted">(up to {{ HIGHLIGHTS_MAX }}, shown under the bio)</span>
    </legend>
    <div
      v-for="(value, i) in slots"
      :key="i"
      class="flex items-center gap-2"
    >
      <label
        :for="`p-highlight-${i}`"
        class="sr-only"
      >Highlight {{ i + 1 }}</label>
      <input
        :id="`p-highlight-${i}`"
        :value="value"
        type="text"
        :maxlength="HIGHLIGHT_MAX_CHARS"
        :placeholder="`Highlight ${i + 1}`"
        :class="inputClass"
        class="min-w-0 flex-1"
        @input="onInput(i, $event)"
      >
      <span
        class="w-12 shrink-0 text-right font-mono text-xs text-muted"
        aria-hidden="true"
      >{{ value.length }}/{{ HIGHLIGHT_MAX_CHARS }}</span>
    </div>
    <p class="text-xs text-muted">
      Short lines work best. With 3 highlights, each one gets a single line on phones (about 40 characters).
    </p>
  </fieldset>
</template>
