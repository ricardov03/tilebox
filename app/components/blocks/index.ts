/**
 * Block components. WP2.
 * `BLOCK_COMPONENTS` maps a block type to its component for the editor (WP3).
 * `BlockRenderer` is what BentoGrid (WP1) renders inside each <li>.
 */
import type { Component } from 'vue'
import type { BlockType } from '~~/types/profile'
import BlockRenderer from './BlockRenderer.vue'
import LinkBlock from './LinkBlock.vue'
import SocialBlock from './SocialBlock.vue'
import ImageBlock from './ImageBlock.vue'
import TextBlock from './TextBlock.vue'
import SectionBlock from './SectionBlock.vue'
import MapBlock from './MapBlock.vue'
import VideoBlock from './VideoBlock.vue'

export const BLOCK_COMPONENTS: Readonly<Record<BlockType, Component>> = {
  link: LinkBlock,
  social: SocialBlock,
  image: ImageBlock,
  text: TextBlock,
  section: SectionBlock,
  map: MapBlock,
  video: VideoBlock,
}

export { BlockRenderer, LinkBlock, SocialBlock, ImageBlock, TextBlock, SectionBlock, MapBlock, VideoBlock }
export { default as Tile } from './Tile.vue'
export * from './media'

/** Nuxt scans this file as a component named `Blocks`. Point it at the renderer so that name is usable. */
export default BlockRenderer
