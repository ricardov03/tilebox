<!--
  Ordered list of blocks for the current layout, plus the add-block menu.
  Up/down buttons reorder without a mouse. Click a row to edit it.
  Every row ends with a delete button. It swaps the row's right side for the
  inline confirm. After a cancel the focus goes back to that delete button.
-->
<script setup lang="ts">
import type { Block, BlockType } from '~~/types/profile'
import { UI_ICONS } from '~/utils/networks'

defineProps<{
  blocks: Block[]
  selectedId: string | null
  /** The row whose delete confirm is open. */
  confirmingId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  add: [type: BlockType]
  move: [id: string, delta: -1 | 1]
  requestDelete: [id: string]
  confirmDelete: [id: string]
  cancelDelete: []
}>()

const rows = useTemplateRef<HTMLOListElement>('rows')

/** The confirm is gone after the next render, and the delete button is back: focus it. */
async function cancelDelete(id: string) {
  emit('cancelDelete')
  await nextTick()
  rows.value?.querySelector<HTMLButtonElement>(`[data-delete-block="${CSS.escape(id)}"]`)?.focus()
}

const menuOpen = ref(false)
const menuRoot = useTemplateRef<HTMLElement>('menuRoot')
const menuButton = useTemplateRef<HTMLButtonElement>('menuButton')

function add(type: BlockType) {
  emit('add', type)
  menuOpen.value = false
}

/** Escape closes the menu and returns focus to its button. */
function onMenuKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !menuOpen.value) return
  event.preventDefault()
  menuOpen.value = false
  menuButton.value?.focus()
}

/** A click outside the button and the menu closes it. */
function onDocumentClick(event: MouseEvent) {
  if (!menuOpen.value) return
  const target = event.target
  if (target instanceof Node && menuRoot.value?.contains(target)) return
  menuOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))

const rowClass = `flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 text-left ${FOCUS_RING}`
const deleteClass = `flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-ground hover:text-pop ${FOCUS_RING}`
const arrowClass = `size-11 shrink-0 rounded-xl text-muted hover:bg-ground hover:text-ink disabled:opacity-30 ${FOCUS_RING}`
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      ref="menuRoot"
      class="relative"
      @keydown="onMenuKeydown"
    >
      <button
        ref="menuButton"
        type="button"
        data-add-block
        :aria-expanded="menuOpen"
        aria-haspopup="true"
        aria-controls="add-block-menu"
        :class="FOCUS_RING"
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
          :class="FOCUS_RING"
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
      ref="rows"
      class="flex list-none flex-col gap-1 p-0"
    >
      <li
        v-for="(block, index) in blocks"
        :key="block.id"
        class="flex items-center gap-1"
      >
        <button
          type="button"
          :data-select-block="block.id"
          :aria-pressed="block.id === selectedId"
          :class="[rowClass, block.id === selectedId ? 'border-accent bg-ground' : 'border-transparent hover:bg-ground']"
          @click="emit('select', block.id)"
        >
          <span class="w-14 shrink-0 font-mono text-xs text-muted">{{ block.type }}</span>
          <span class="min-w-0 flex-1 truncate text-sm text-ink">{{ blockSummary(block) }}</span>
          <span class="shrink-0 font-mono text-xs text-muted">{{ block.type === 'section' ? 'row' : block.size }}</span>
        </button>
        <EditorDeleteConfirm
          v-if="block.id === confirmingId"
          :label="blockSummary(block)"
          class="shrink-0"
          @confirm="emit('confirmDelete', block.id)"
          @cancel="cancelDelete(block.id)"
        />
        <template v-else>
          <button
            type="button"
            :disabled="index === 0"
            :aria-label="`Move ${blockSummary(block)} up`"
            :class="arrowClass"
            @click="emit('move', block.id, -1)"
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            :disabled="index === blocks.length - 1"
            :aria-label="`Move ${blockSummary(block)} down`"
            :class="arrowClass"
            @click="emit('move', block.id, 1)"
          >
            <span aria-hidden="true">↓</span>
          </button>
          <button
            type="button"
            :data-delete-block="block.id"
            :aria-label="`Delete ${blockSummary(block)}`"
            :class="deleteClass"
            @click="emit('requestDelete', block.id)"
          >
            <Icon
              :name="UI_ICONS.trash"
              class="size-5"
              :aria-hidden="true"
            />
          </button>
        </template>
      </li>
    </ol>
  </div>
</template>
