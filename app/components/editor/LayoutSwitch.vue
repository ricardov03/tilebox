<!-- Desktop | Mobile toggle. Picks which layout order the editor edits. -->
<script setup lang="ts">
import type { LayoutKey } from '~/composables/useEditor'

const model = defineModel<LayoutKey>({ required: true })

const options: { value: LayoutKey, label: string, hint: string }[] = [
  { value: 'desktop', label: 'Desktop', hint: '4 columns' },
  { value: 'mobile', label: 'Mobile', hint: '2 columns' },
]
</script>

<template>
  <div
    role="group"
    aria-label="Layout to edit"
    class="inline-flex rounded-full border border-line bg-ground p-1"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="model === option.value"
      :title="option.hint"
      :class="model === option.value ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'"
      class="min-h-11 rounded-full px-4 text-sm font-medium transition-colors motion-reduce:transition-none"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
