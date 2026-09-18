<!-- Desktop | Mobile radio group. Picks which layout order the editor edits. Arrow keys move between the two. -->
<script setup lang="ts">
import type { LayoutKey } from '~/composables/useEditor'

const model = defineModel<LayoutKey>({ required: true })

const options: { value: LayoutKey, label: string, hint: string }[] = [
  { value: 'desktop', label: 'Desktop', hint: '4 columns' },
  { value: 'mobile', label: 'Mobile', hint: '2 columns' },
]

const buttons = useTemplateRef<HTMLButtonElement[]>('buttons')

/** Roving focus: arrows and Home/End pick the next option and focus it. */
function onKeydown(event: KeyboardEvent) {
  const index = options.findIndex(option => option.value === model.value)
  let next = index
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = options.length - 1
  else return
  event.preventDefault()
  const option = options[next]
  if (!option) return
  model.value = option.value
  buttons.value?.[next]?.focus()
}
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Layout to edit"
    class="inline-flex rounded-full border border-line bg-ground p-1"
    @keydown="onKeydown"
  >
    <button
      v-for="option in options"
      ref="buttons"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :tabindex="model === option.value ? 0 : -1"
      :title="option.hint"
      :class="[FOCUS_RING, model === option.value ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink']"
      class="min-h-11 rounded-full px-4 text-sm font-medium transition-colors motion-reduce:transition-none"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
