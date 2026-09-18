<script setup lang="ts">
import type { Block, PublicProfile, PublicProfileInfo } from '~~/types/profile'
import { SIZE_CLASSES, sizeToSpan } from '~/utils/sizes'
import BlockRenderer from '~/components/blocks/BlockRenderer.vue'

/** `types/profile.ts` exports no `Layout` type. Derived here. */
type Layout = PublicProfile['layout']

const props = defineProps<{
  blocks: Block[]
  layout: Layout
  profile: PublicProfileInfo
  /** The share button of the profile tile (WP11). */
  share?: boolean
}>()

interface Tile {
  block: Block
  /** Grid span classes for desktop. */
  spanClass: string
  /** Explicit height class. Row tracks are `auto`, so a section row stays short. */
  heightClass: string
  /** Position on phones. Applied with CSS `order` below `lg` (the 4-column breakpoint). */
  mobileOrder: number
  /** Position in DOM order. Drives the page-load stagger from lg up (phones use mobileOrder). */
  index: number
  /** Near the top on phones: an image tile here is a likely LCP element and loads eagerly. */
  priority: boolean
}

/** Tiles at mobile position 1..3 sit in the first phone screen next to the profile tile. */
const PRIORITY_MOBILE_ORDERS = 3

const ROW_1 = 'h-[var(--row)]'
const ROW_2 = 'h-[calc(var(--row)*2+var(--gap))]'

const tiles = computed<Tile[]>(() => {
  const byId = new Map(props.blocks.map(block => [block.id, block]))
  const mobile = props.layout.mobile ?? props.layout.desktop
  return props.layout.desktop.flatMap((id, i) => {
    const block = byId.get(id)
    if (!block) return []
    // The profile tile is order 0. Blocks start at 1. Unknown ids keep desktop position.
    const mobileIndex = mobile.indexOf(id)
    const mobileOrder = (mobileIndex === -1 ? i : mobileIndex) + 1
    const index = i + 1
    const priority = mobileOrder <= PRIORITY_MOBILE_ORDERS
    const tile: Tile = block.type === 'section'
      ? { block, spanClass: 'col-span-full row-auto', heightClass: 'h-auto', mobileOrder, index, priority }
      : {
          block,
          spanClass: SIZE_CLASSES[block.size],
          heightClass: sizeToSpan(block.size).rows === 2 ? ROW_2 : ROW_1,
          mobileOrder,
          index,
          priority,
        }
    return [tile]
  })
})
</script>

<template>
  <ul
    class="grid auto-rows-auto grid-cols-2 gap-[var(--gap)] [--gap:12px] [--row:173px] md:[--gap:20px] md:[--row:240px] lg:grid-cols-4"
    aria-label="Tiles"
  >
    <li
      class="tile-in col-span-2 row-span-2"
      :class="ROW_2"
      style="--i: 0"
    >
      <ProfileHeader
        :profile="profile"
        :share="share"
      />
    </li>
    <li
      v-for="tile in tiles"
      :key="tile.block.id"
      class="tile-in max-lg:[order:var(--order-m)]"
      :class="[tile.spanClass, tile.heightClass]"
      :style="{ '--i': tile.index, '--order-m': tile.mobileOrder }"
      :data-ends-at="tile.block.endsAt"
    >
      <BlockRenderer
        :block="tile.block"
        :priority="tile.priority"
      />
    </li>
  </ul>
</template>

<style>
/* Page-load stagger: one time, 300ms per tile, 40ms apart. `backwards` frees the transform after it ends so the hover lift in Tile.vue works. */
@keyframes tile-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tile-in {
  animation: tile-in 300ms ease-out backwards;
  animation-delay: calc(var(--i, 0) * 40ms);
}

/* Below lg the tiles show in the phone order, so they enter in that order too. */
@media (max-width: 1023.98px) {
  .tile-in {
    animation-delay: calc(var(--order-m, var(--i, 0)) * 40ms);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tile-in {
    animation: none;
  }
}
</style>
