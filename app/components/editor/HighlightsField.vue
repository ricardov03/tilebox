<!--
  Up to 3 highlights (the short lines under the bio). One `EditorTextField`
  per slot, with a character counter. The slots keep their place while you
  type; the model only gets the non-empty lines, so an empty input is never saved.
-->
<script setup lang="ts">
import { HIGHLIGHT_MAX_CHARS, HIGHLIGHTS_MAX } from '~~/types/profile'

const model = defineModel<string[]>({ required: true })

/** The checked value of every slot. '' = an empty slot. */
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

function setSlot(index: number, value: string) {
  slots.value[index] = value
  model.value = filled(slots.value)
}

/** `maxlength` stops the keys. This stops a long paste in a browser that does not. */
function tooLong(value: string): string | undefined {
  return value.length > HIGHLIGHT_MAX_CHARS ? `At most ${HIGHLIGHT_MAX_CHARS} characters` : undefined
}

const trimmed = (text: string) => text.trim()
</script>

<template>
  <fieldset class="flex flex-col gap-2 border-0 p-0">
    <legend :class="LABEL_CLASS">
      Highlights <span class="font-normal text-muted">(up to {{ HIGHLIGHTS_MAX }}, shown under the bio)</span>
    </legend>
    <EditorTextField
      v-for="(value, i) in slots"
      :id="`p-highlight-${i}`"
      :key="i"
      :label="`Highlight ${i + 1}`"
      label-hidden
      :model-value="value"
      :counter="HIGHLIGHT_MAX_CHARS"
      :placeholder="`Highlight ${i + 1}`"
      :validate="tooLong"
      :normalize="trimmed"
      @commit="setSlot(i, $event)"
    />
    <p class="text-xs text-muted">
      Short lines work best. With 3 highlights, each one gets a single line on phones (about 40 characters).
    </p>
  </fieldset>
</template>
