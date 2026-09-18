<!--
  Drag-and-drop preview grid. Client only. Loads vue-draggable-plus with a
  dynamic import so the library never touches the public bundle.
  Reorders the ids of the CURRENT layout only (desktop or mobile).
  Options follow PLAN.md 4 (SortableJS #2335 mitigation).
  The profile tile is the first <li>. It has no data-id, and `draggable`
  is `li[data-id]`, so Sortable never moves it and never counts it.
-->
<script setup lang="ts">
import type { Component } from 'vue'
import type { Block, PublicProfileInfo } from '~~/types/profile'

const props = defineProps<{
  blocks: Block[]
  columns: 2 | 4
  profile: PublicProfileInfo
  selectedId: string | null
  /** The tile whose delete confirm is open. */
  confirmingId: string | null
}>()

const emit = defineEmits<{
  reorder: [ids: string[]]
  select: [id: string]
  requestDelete: [id: string]
  confirmDelete: [id: string]
  cancelDelete: []
  toggleHidden: [id: string]
}>()

/** `null` until the dynamic import resolves, or when it fails. The static grid renders then. */
const Draggable = shallowRef<Component | null>(null)

onMounted(async () => {
  try {
    const mod = await import('vue-draggable-plus')
    Draggable.value = mod.VueDraggable
  }
  catch {
    Draggable.value = null
  }
})

/**
 * Local copy for VueDraggable's v-model. The `blocks` prop is never
 * mutated: a drop replaces the copy and the new order goes up as ids.
 */
const list = ref<Block[]>([...props.blocks])
watch(() => props.blocks, (next) => {
  list.value = [...next]
})

function onReorder(next: Block[]) {
  list.value = next
  emit('reorder', next.map(b => b.id))
}

/**
 * From the SortableJS README (grid example): compare horizontally when both
 * tiles sit in the same row, vertically when either one spans the full row.
 */
function direction(_evt: Event, target: HTMLElement | null, dragEl: HTMLElement): 'horizontal' | 'vertical' {
  if (!target) return 'vertical'
  if (target.dataset.full || dragEl.dataset.full) return 'vertical'
  return 'horizontal'
}
</script>

<template>
  <component
    :is="Draggable"
    v-if="Draggable"
    :model-value="list"
    tag="ul"
    :animation="150"
    :swap-threshold="0.65"
    :invert-swap="true"
    :force-fallback="true"
    :fallback-tolerance="4"
    handle="[data-drag-handle]"
    filter="[data-no-drag]"
    :prevent-on-filter="false"
    draggable="li[data-id]"
    :direction="direction"
    ghost-class="opacity-40"
    chosen-class="scale-[1.02]"
    :class="PREVIEW_GRID_CLASSES[columns]"
    class="grid list-none auto-rows-auto gap-[var(--gap)] p-0"
    @update:model-value="onReorder"
  >
    <li
      data-profile
      class="col-span-2 row-span-2 h-[calc(var(--row)*2+var(--gap))]"
    >
      <ProfileHeader
        :profile="profile"
        small
      />
    </li>
    <EditorPreviewTile
      v-for="block in list"
      :key="block.id"
      :block="block"
      :selected="block.id === selectedId"
      :draggable="true"
      :confirming="block.id === confirmingId"
      @select="emit('select', $event)"
      @request-delete="emit('requestDelete', $event)"
      @confirm-delete="emit('confirmDelete', $event)"
      @cancel-delete="emit('cancelDelete')"
      @toggle-hidden="emit('toggleHidden', $event)"
    />
  </component>
  <EditorPreviewGrid
    v-else
    :blocks="blocks"
    :columns="columns"
    :profile="profile"
    :selected-id="selectedId"
    :confirming-id="confirmingId"
    @select="emit('select', $event)"
    @request-delete="emit('requestDelete', $event)"
    @confirm-delete="emit('confirmDelete', $event)"
    @cancel-delete="emit('cancelDelete')"
    @toggle-hidden="emit('toggleHidden', $event)"
  />
</template>
