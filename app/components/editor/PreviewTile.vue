<!--
  One tile in the editor preview. A light stand-in for the real block
  components (WP2). Shows type, title and size. The body is a button that
  selects the block; the grip is the drag handle for BlockGridEditor.
-->
<script setup lang="ts">
import type { Block } from '~~/types/profile'
import { SIZE_CLASSES } from '~/utils/sizes'
import { NETWORKS } from '~/utils/networks'

const props = defineProps<{
  block: Block
  selected: boolean
  draggable: boolean
}>()

const emit = defineEmits<{ select: [id: string] }>()

const spanClass = computed(() =>
  props.block.type === 'section' ? 'col-span-full' : SIZE_CLASSES[props.block.size],
)

const surfaceClass = computed(() => {
  const b = props.block
  if (b.type === 'link' && b.accent) return 'bg-accent text-accent-ink'
  if (b.type === 'link' && b.pop) return 'bg-pop text-pop-ink'
  if (b.type === 'image') return 'bg-photo text-ink'
  return 'bg-tile text-ink'
})

const subtleClass = computed(() => {
  const b = props.block
  if (b.type === 'link' && b.accent) return 'text-accent-soft'
  if (b.type === 'link' && b.pop) return 'text-pop-ink opacity-80'
  return 'text-muted'
})

const icon = computed(() => {
  const b = props.block
  if (b.type === 'link') return b.icon ?? null
  if (b.type === 'social') return NETWORKS[b.network].icon
  return null
})

const sizeLabel = computed(() => (props.block.type === 'section' ? 'row' : props.block.size))
</script>

<template>
  <li
    :data-id="block.id"
    :data-full="block.type === 'section' ? 'true' : undefined"
    :class="[spanClass, block.type === 'section' ? 'min-h-14' : '']"
    class="relative"
  >
    <button
      type="button"
      :aria-pressed="selected"
      :aria-label="`Edit ${BLOCK_TYPE_LABELS[block.type]} block: ${blockSummary(block)}`"
      :class="[
        surfaceClass,
        block.type === 'section' ? 'items-end justify-start px-2 pb-1 pt-4 !border-0 !bg-transparent' : 'rounded-tile border border-line p-4 sm:p-5',
        selected ? 'outline-2 outline-offset-2 outline-accent' : '',
      ]"
      class="flex size-full flex-col justify-between overflow-hidden text-left transition-transform duration-150 motion-reduce:transition-none hover:-translate-y-0.5 focus-visible:outline-2"
      @click="emit('select', block.id)"
    >
      <template v-if="block.type === 'image'">
        <img
          :src="block.src"
          :alt="block.alt"
          class="absolute inset-0 size-full object-cover"
          draggable="false"
        >
        <span class="relative rounded-full bg-tile px-3 py-1 font-mono text-xs text-ink">image · {{ sizeLabel }}</span>
        <span
          v-if="block.caption"
          class="relative rounded-full bg-tile px-3 py-1 text-sm font-medium text-ink"
        >{{ block.caption }}</span>
      </template>
      <template v-else-if="block.type === 'section'">
        <span class="font-display text-lg font-semibold text-ink">{{ block.title }}</span>
      </template>
      <template v-else>
        <span
          :class="subtleClass"
          class="flex items-center gap-2 font-mono text-xs"
        >
          <Icon
            v-if="icon"
            :name="icon"
            class="size-5 shrink-0"
            :aria-hidden="true"
          />
          <span>{{ block.type }} · {{ sizeLabel }}</span>
        </span>
        <span class="line-clamp-3 font-display text-base font-semibold sm:text-lg">{{ blockSummary(block) }}</span>
      </template>
    </button>
    <span
      v-if="draggable"
      data-drag-handle
      role="button"
      tabindex="-1"
      aria-hidden="true"
      class="absolute right-2 top-2 flex size-11 cursor-grab select-none items-center justify-center rounded-full bg-tile/90 text-muted active:cursor-grabbing"
      :class="block.type === 'section' ? 'top-1' : ''"
    >
      <svg
        viewBox="0 0 20 20"
        class="size-5"
        fill="currentColor"
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
    </span>
  </li>
</template>
