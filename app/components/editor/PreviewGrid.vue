<!--
  Static preview grid (no drag). The SSR fallback and what BlockGridEditor
  shows before the drag library loads. Same grid rules as BentoGrid: the
  profile tile first (2x2), 4 columns on desktop, 2 on mobile, sections
  span a full row, row tracks are auto and tiles carry their height.
-->
<script setup lang="ts">
import type { Block, PublicProfileInfo } from '~~/types/profile'

defineProps<{
  blocks: Block[]
  columns: 2 | 4
  profile: PublicProfileInfo
  selectedId: string | null
  /** The tile whose delete confirm is open. */
  confirmingId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  requestDelete: [id: string]
  confirmDelete: [id: string]
  cancelDelete: []
}>()
</script>

<template>
  <ul
    :class="PREVIEW_GRID_CLASSES[columns]"
    class="grid list-none auto-rows-auto gap-[var(--gap)] p-0"
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
      v-for="block in blocks"
      :key="block.id"
      :block="block"
      :selected="block.id === selectedId"
      :draggable="false"
      :confirming="block.id === confirmingId"
      @select="emit('select', $event)"
      @request-delete="emit('requestDelete', $event)"
      @confirm-delete="emit('confirmDelete', $event)"
      @cancel-delete="emit('cancelDelete')"
    />
  </ul>
</template>
