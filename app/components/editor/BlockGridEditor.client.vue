<!--
  Drag-and-drop preview grid. Client only. Loads vue-draggable-plus with a
  dynamic import so the library never touches the public bundle.
  Reorders the ids of the CURRENT layout only (desktop or mobile).
  Options follow PLAN.md 4 (SortableJS #2335 mitigation).
-->
<script setup lang="ts">
import type { Component } from 'vue'
import type { Block } from '~~/types/profile'

const props = defineProps<{
  blocks: Block[]
  columns: 2 | 4
  selectedId: string | null
}>()

const emit = defineEmits<{
  reorder: [ids: string[]]
  select: [id: string]
}>()

const Draggable = shallowRef<Component | null>(null)
const loadFailed = ref(false)

onMounted(async () => {
  try {
    const mod = await import('vue-draggable-plus')
    Draggable.value = mod.VueDraggable
  }
  catch {
    loadFailed.value = true
  }
})

/** v-model for VueDraggable. Set = the new order, sent up as ids. */
const list = computed<Block[]>({
  get: () => props.blocks,
  set: (next) => {
    emit('reorder', next.map(b => b.id))
  },
})

/**
 * From the SortableJS README (grid example): compare horizontally when both
 * tiles sit in the same row, vertically when either one spans the full row.
 */
function direction(_evt: Event, target: HTMLElement | null, dragEl: HTMLElement): 'horizontal' | 'vertical' {
  if (!target) return 'vertical'
  if (target.dataset.full || dragEl.dataset.full) return 'vertical'
  return 'horizontal'
}

const gridClass = computed(() =>
  props.columns === 4
    ? 'grid-cols-4 auto-rows-[clamp(120px,13vw,240px)] gap-4 xl:gap-5'
    : 'grid-cols-2 auto-rows-[173px] gap-4',
)
</script>

<template>
  <component
    :is="Draggable"
    v-if="Draggable"
    v-model="list"
    tag="ul"
    :animation="150"
    :swap-threshold="0.65"
    :invert-swap="true"
    :force-fallback="true"
    :fallback-tolerance="4"
    handle="[data-drag-handle]"
    :direction="direction"
    ghost-class="opacity-40"
    chosen-class="scale-[1.02]"
    :class="gridClass"
    class="grid list-none p-0"
  >
    <EditorPreviewTile
      v-for="block in blocks"
      :key="block.id"
      :block="block"
      :selected="block.id === selectedId"
      :draggable="true"
      @select="emit('select', $event)"
    />
  </component>
  <EditorPreviewGrid
    v-else
    :blocks="blocks"
    :columns="columns"
    :selected-id="selectedId"
    @select="emit('select', $event)"
  />
</template>
