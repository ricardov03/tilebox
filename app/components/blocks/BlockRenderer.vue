<!--
  Picks the component for a block by `block.type`. Fills the <li> BentoGrid renders.
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

defineProps<{ block: Block }>()
</script>

<template>
  <LinkBlock
    v-if="block.type === 'link'"
    :block="block"
  />
  <SocialBlock
    v-else-if="block.type === 'social'"
    :block="block"
  />
  <ImageBlock
    v-else-if="block.type === 'image'"
    :block="block"
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
    v-else
    :block="block"
  />
</template>
