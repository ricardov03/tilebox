<!--
  Section heading. Full row, not a tile: heading + a 1px rule to its right.
-->
<script setup lang="ts">
import type { SectionBlock } from '~~/types/profile'

defineProps<{ block: SectionBlock }>()
</script>

<template>
  <div class="flex h-full min-h-0 w-full items-center gap-4 py-2">
    <!-- No title = an incomplete block (WP17). Only the editor preview renders it: no empty heading. -->
    <h2
      v-if="block.title"
      class="font-display text-[22px] font-semibold leading-[1.1] md:text-[26px]"
    >
      {{ block.title }}
    </h2>
    <span
      class="h-px flex-1 bg-line"
      aria-hidden="true"
    />
  </div>
</template>
