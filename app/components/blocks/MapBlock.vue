<!--
  Map tile. A plain link to the map URL. No map JS.
-->
<script setup lang="ts">
import type { MapBlock } from '~~/types/profile'
import { UI_ICONS } from '~/utils/networks'
import Tile from './Tile.vue'

defineProps<{ block: MapBlock }>()
</script>

<template>
  <Tile
    :href="block.url"
    :aria-label="`${block.label} on the map`"
  >
    <Icon
      :name="UI_ICONS.map"
      class="size-[34px] text-accent md:size-10"
    />
    <div class="flex min-w-0 flex-col gap-0.5 md:gap-1">
      <span class="text-base font-semibold leading-[1.3] md:text-lg">{{ block.label }}</span>
      <span
        v-if="block.sublabel"
        class="truncate font-mono text-[13px] text-muted md:text-sm"
      >{{ block.sublabel }}</span>
    </div>
  </Tile>
</template>
