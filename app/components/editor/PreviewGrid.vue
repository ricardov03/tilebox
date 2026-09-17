<!--
  Static preview grid (no drag). Used as the SSR/fallback surface and by
  BlockGridEditor before the drag library loads. Same grid rules as
  PLAN.md 4: 4 columns on desktop, 2 on mobile, sections span a full row.
  The integration agent (WP5) may swap this for the real BentoGrid.
-->
<script setup lang="ts">
import type { Block } from '~~/types/profile'

defineProps<{
  blocks: Block[]
  columns: 2 | 4
  selectedId: string | null
}>()

const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <ul
    :class="columns === 4 ? 'grid-cols-4 auto-rows-[clamp(120px,13vw,240px)] gap-4 xl:gap-5' : 'grid-cols-2 auto-rows-[173px] gap-4'"
    class="grid list-none p-0"
  >
    <EditorPreviewTile
      v-for="block in blocks"
      :key="block.id"
      :block="block"
      :selected="block.id === selectedId"
      :draggable="false"
      @select="emit('select', $event)"
    />
  </ul>
</template>
