<!--
  TEMPORARY stub from WP1. WP2 replaces this file with the real renderer.
  It only proves the grid: one tile per block with the block type as text.
-->
<script setup lang="ts">
import type { Block } from '~~/types/profile'

defineProps<{ block: Block }>()
</script>

<template>
  <div class="flex h-full items-end rounded-tile border border-line bg-tile p-5 font-mono text-sm text-muted md:p-7">
    {{ block.type }}
  </div>
</template>
