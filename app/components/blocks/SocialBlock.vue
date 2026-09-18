<!--
  Social tile. Brand icon from the NETWORKS map. The whole tile is the link.
  No aria-label: the visible text (network name + handle) is the accessible name.
  `rel="me"`: the link says "this profile is mine" (identity check on Mastodon and others).
-->
<script setup lang="ts">
import type { SocialBlock } from '~~/types/profile'
import { NETWORKS } from '~/utils/networks'
import Tile from './Tile.vue'

const props = defineProps<{ block: SocialBlock }>()

const network = computed(() => NETWORKS[props.block.network])
</script>

<template>
  <Tile
    :href="block.url"
    rel="me"
  >
    <Icon
      :name="network.icon"
      class="size-9 md:size-11"
    />
    <div class="flex min-w-0 flex-col gap-0.5 md:gap-1">
      <span class="text-base font-semibold leading-[1.3] md:text-lg">{{ network.label }}</span>
      <span
        v-if="block.label"
        class="truncate font-mono text-[13px] text-muted md:text-sm"
      >{{ block.label }}</span>
    </div>
  </Tile>
</template>
