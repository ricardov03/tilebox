<!--
  Ordered list of blocks for the current layout, plus the add-block menu.
  Up/down buttons reorder without a mouse. Click a row to edit it.
-->
<script setup lang="ts">
import type { Block, BlockType } from '~~/types/profile'

defineProps<{
  blocks: Block[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  add: [type: BlockType]
  move: [id: string, delta: -1 | 1]
}>()

const menuOpen = ref(false)

function add(type: BlockType) {
  emit('add', type)
  menuOpen.value = false
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="relative">
      <button
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="add-block-menu"
        class="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90"
        @click="menuOpen = !menuOpen"
      >
        <span aria-hidden="true">+</span> Add block
      </button>
      <div
        v-show="menuOpen"
        id="add-block-menu"
        class="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-ground p-2"
      >
        <button
          v-for="type in BLOCK_TYPES"
          :key="type"
          type="button"
          class="min-h-11 rounded-xl border border-line bg-tile px-3 text-left text-sm font-medium text-ink hover:border-accent"
          @click="add(type)"
        >
          {{ BLOCK_TYPE_LABELS[type] }}
        </button>
      </div>
    </div>

    <p
      v-if="blocks.length === 0"
      class="text-sm text-muted"
    >
      No blocks yet. Add one.
    </p>

    <ol
      v-else
      class="flex list-none flex-col gap-1 p-0"
    >
      <li
        v-for="(block, index) in blocks"
        :key="block.id"
        class="flex items-center gap-1"
      >
        <button
          type="button"
          :aria-pressed="block.id === selectedId"
          :class="block.id === selectedId ? 'border-accent bg-ground' : 'border-transparent hover:bg-ground'"
          class="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 text-left"
          @click="emit('select', block.id)"
        >
          <span class="w-14 shrink-0 font-mono text-xs text-muted">{{ block.type }}</span>
          <span class="min-w-0 flex-1 truncate text-sm text-ink">{{ blockSummary(block) }}</span>
          <span class="shrink-0 font-mono text-xs text-muted">{{ block.type === 'section' ? 'row' : block.size }}</span>
        </button>
        <button
          type="button"
          :disabled="index === 0"
          :aria-label="`Move ${blockSummary(block)} up`"
          class="size-11 shrink-0 rounded-xl text-muted hover:bg-ground hover:text-ink disabled:opacity-30"
          @click="emit('move', block.id, -1)"
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          :disabled="index === blocks.length - 1"
          :aria-label="`Move ${blockSummary(block)} down`"
          class="size-11 shrink-0 rounded-xl text-muted hover:bg-ground hover:text-ink disabled:opacity-30"
          @click="emit('move', block.id, 1)"
        >
          <span aria-hidden="true">↓</span>
        </button>
      </li>
    </ol>
  </div>
</template>
