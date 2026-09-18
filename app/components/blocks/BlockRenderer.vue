<!--
  Picks the component for a block by `block.type`. Fills the <li> BentoGrid renders.
  Every branch is explicit so vue-tsc narrows the union and an unknown type renders nothing.
-->
<script setup lang="ts">
import type { Block } from '~~/types/profile'
import LinkBlock from './LinkBlock.vue'
import SocialBlock from './SocialBlock.vue'
import ImageBlock from './ImageBlock.vue'
import TextBlock from './TextBlock.vue'
import SectionBlock from './SectionBlock.vue'
import MapBlock from './MapBlock.vue'
import VideoBlock from './VideoBlock.vue'

withDefaults(defineProps<{
  block: Block
  /** Image tiles and featured link tiles near the top of the page load their image eagerly (LCP). Other types ignore it. */
  priority?: boolean
}>(), { priority: false })
</script>

<template>
  <LinkBlock
    v-if="block.type === 'link'"
    :block="block"
    :priority="priority"
  />
  <SocialBlock
    v-else-if="block.type === 'social'"
    :block="block"
  />
  <ImageBlock
    v-else-if="block.type === 'image'"
    :block="block"
    :priority="priority"
  />
  <TextBlock
    v-else-if="block.type === 'text'"
    :block="block"
  />
  <SectionBlock
    v-else-if="block.type === 'section'"
    :block="block"
  />
  <MapBlock
    v-else-if="block.type === 'map'"
    :block="block"
  />
  <VideoBlock
    v-else-if="block.type === 'video'"
    :block="block"
  />
  <!-- An unknown type renders nothing. -->
</template>
