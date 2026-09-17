<!--
  Text tile. Title, plain paragraphs (split on blank lines, no markdown), footnote at the bottom.
-->
<script setup lang="ts">
import type { TextBlock } from '~~/types/profile'
import Tile from './Tile.vue'

const props = defineProps<{ block: TextBlock }>()

const paragraphs = computed(() =>
  props.block.body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0),
)
</script>

<template>
  <Tile>
    <div class="flex min-h-0 flex-col gap-3 overflow-hidden md:gap-4">
      <h2
        v-if="block.title"
        class="font-display text-[22px] font-semibold leading-[1.1] md:text-[26px]"
      >
        {{ block.title }}
      </h2>
      <div class="flex flex-col gap-2 text-sm leading-[1.5] text-muted md:text-base md:leading-[1.55]">
        <p
          v-for="(paragraph, index) in paragraphs"
          :key="index"
        >
          {{ paragraph }}
        </p>
      </div>
    </div>
    <span
      v-if="block.footnote"
      class="mt-3 font-mono text-xs text-muted md:text-[13px]"
    >{{ block.footnote }}</span>
  </Tile>
</template>
