<!--
  One tile in the editor preview. Renders the real block component
  (BlockRenderer) inside the <li> the grid and the drag library need.
  Three controls float top-right on hover, focus or selection, and always on
  touch screens (`hover: none`): Edit (selects the block), Delete and the drag
  grip (`[data-drag-handle]`, drag grid only). Delete is the shared small red
  outlined trash button (EditorDeleteButton, with a `tile` plate behind it: a
  tile can hold a photo). It opens the inline confirm
  as a small overlay inside the tile. Delete and the confirm carry
  `data-no-drag` (the drag grid filters them out) and `data-editor-control`.
  Clicks on the tile body are caught by the preview wrapper in edit.vue, which
  selects the block and stops links from navigating.
  A hidden block (WP10a) is dimmed and carries an eye-off badge. The Hide / Show
  control sits next to Delete. Its name says the action ("Hide x" / "Show x"); it has
  no `aria-pressed`, because `[data-editor-control][aria-pressed]` finds the Edit control.
  The build leaves hidden blocks out. An INCOMPLETE block (WP17: a link without a URL, an image without a
  file) is dimmed the same way and carries the "Incomplete: ..." badge of BlockRowBadges: the build leaves it out too.
-->
<script setup lang="ts">
import { incompleteReason, type Block } from '~~/types/profile'
import { SIZE_CLASSES, sizeToSpan } from '~/utils/sizes'
import { UI_ICONS } from '~/utils/networks'
import { BlockRenderer } from '~/components/blocks'

const props = defineProps<{
  block: Block
  selected: boolean
  draggable: boolean
  /** The inline delete confirm is open on this tile. */
  confirming: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  requestDelete: [id: string]
  confirmDelete: [id: string]
  cancelDelete: []
  toggleHidden: [id: string]
}>()

/** EditorDeleteButton exposes `focus()`. */
const deleteButton = useTemplateRef<{ focus: () => void }>('deleteButton')

/** The controls come back after the next render: focus the delete button again. */
async function cancelDelete() {
  emit('cancelDelete')
  await nextTick()
  deleteButton.value?.focus()
}

/** Same rules as BentoGrid: row tracks are auto, the tile carries its own height. */
const ROW_1 = 'h-[var(--row)]'
const ROW_2 = 'h-[calc(var(--row)*2+var(--gap))]'

const incomplete = computed(() => incompleteReason(props.block) !== null)
const isSection = computed(() => props.block.type === 'section')
const spanClass = computed(() =>
  props.block.type === 'section' ? 'col-span-full row-auto' : SIZE_CLASSES[props.block.size],
)
const heightClass = computed(() => {
  if (props.block.type === 'section') return 'h-auto'
  return sizeToSpan(props.block.size).rows === 2 ? ROW_2 : ROW_1
})

const controlClass = 'flex size-11 items-center justify-center rounded-full border border-line bg-tile/90 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
</script>

<template>
  <li
    :data-id="block.id"
    :data-full="isSection ? 'true' : undefined"
    :class="[spanClass, heightClass, isSection ? 'min-h-14' : '']"
    class="group relative"
  >
    <div
      :class="[selected ? 'outline-2 outline-offset-2 outline-accent' : '', block.hidden || incomplete ? 'opacity-40' : '']"
      class="h-full rounded-tile"
    >
      <BlockRenderer :block="block" />
    </div>

    <span
      v-if="block.hidden"
      data-hidden-badge
      :class="isSection ? 'top-1/2 -translate-y-1/2' : 'bottom-2'"
      class="pointer-events-none absolute left-2 flex items-center gap-1 rounded-full border border-line bg-tile px-2 py-1 font-mono text-xs text-ink"
    >
      <Icon
        :name="UI_ICONS.hidden"
        class="size-4"
        :aria-hidden="true"
      />
      Hidden
    </span>
    <EditorBlockRowBadges
      :block="block"
      schedule-only
      :class="isSection ? 'top-1/2 -translate-y-1/2' : 'bottom-2'"
      class="pointer-events-none absolute right-2"
    />

    <!-- The inline delete confirm, over the top of the tile. -->
    <div
      v-if="confirming"
      data-editor-control
      data-no-drag
      :class="isSection ? 'top-1/2 -translate-y-1/2' : 'top-2'"
      class="absolute inset-x-2 z-10 flex justify-end"
    >
      <EditorDeleteConfirm
        :label="blockSummary(block)"
        :stacked="!isSection"
        class="max-w-full rounded-3xl border border-line bg-tile p-1 shadow-lg"
        @confirm="emit('confirmDelete', block.id)"
        @cancel="cancelDelete"
      />
    </div>

    <!-- Top-right, shown on hover, focus or when selected, so the tile reads like the real one. Always shown without hover (touch). -->
    <div
      v-else
      :class="[
        isSection ? 'inset-y-0 my-auto h-11' : 'top-2 flex-wrap',
        selected ? 'opacity-100' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
      ]"
      class="pointer-events-none absolute left-2 right-2 flex items-center justify-end gap-1 transition-opacity motion-reduce:transition-none [@media(hover:none)]:opacity-100 [&>button]:pointer-events-auto"
    >
      <button
        type="button"
        data-editor-control
        :aria-pressed="selected"
        :aria-label="`Edit ${BLOCK_TYPE_LABELS[block.type]} block: ${blockSummary(block)}`"
        :class="controlClass"
        @click="emit('select', block.id)"
      >
        <Icon
          :name="UI_ICONS.edit"
          class="size-5"
          :aria-hidden="true"
        />
      </button>
      <button
        type="button"
        data-editor-control
        data-no-drag
        :data-hide-tile="block.id"
        :aria-label="`${block.hidden ? 'Show' : 'Hide'} ${blockSummary(block)}`"
        :class="controlClass"
        @click.stop="emit('toggleHidden', block.id)"
      >
        <Icon
          :name="block.hidden ? UI_ICONS.shown : UI_ICONS.hidden"
          class="size-5"
          :aria-hidden="true"
        />
      </button>
      <EditorDeleteButton
        ref="deleteButton"
        data-editor-control
        data-no-drag
        backed
        :label="blockSummary(block)"
        @click.stop="emit('requestDelete', block.id)"
      />
      <button
        v-if="draggable"
        type="button"
        data-editor-control
        data-drag-handle
        aria-label="Drag to reorder"
        :class="controlClass"
        class="cursor-grab select-none active:cursor-grabbing"
      >
        <svg
          viewBox="0 0 20 20"
          class="size-5"
          fill="currentColor"
          :aria-hidden="true"
        >
          <circle
            cx="7"
            cy="5"
            r="1.5"
          />
          <circle
            cx="13"
            cy="5"
            r="1.5"
          />
          <circle
            cx="7"
            cy="10"
            r="1.5"
          />
          <circle
            cx="13"
            cy="10"
            r="1.5"
          />
          <circle
            cx="7"
            cy="15"
            r="1.5"
          />
          <circle
            cx="13"
            cy="15"
            r="1.5"
          />
        </svg>
      </button>
    </div>
  </li>
</template>
