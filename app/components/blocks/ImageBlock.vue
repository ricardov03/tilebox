<!--
  Photo tile. The image covers the tile. `bg-photo` shows while it loads or if it is missing.
  Caption sits bottom-left on a soft scrim only if `caption` is set. PLAN.md 5.6.
  A stock photo (`source`) shows its credit on the same scrim: "Photo by {author} on Pexels", the
  author and the provider are links (WP12, `imageCredit()` in ./media.ts). Always shown for Pexels.
-->
<script setup lang="ts">
import type { ImageBlock } from '~~/types/profile'
import { imageCredit } from './media'
import Tile from './Tile.vue'

const props = withDefaults(defineProps<{
  block: ImageBlock
  /** True for a tile near the top of the page: eager load with high fetch priority (LCP). */
  priority?: boolean
}>(), { priority: false })

/** Hide a broken image so the `bg-photo` placeholder shows instead. */
const failed = ref(false)
const img = useTemplateRef<HTMLImageElement>('img')

// A missing file can fail before hydration attaches the @error listener. Check once on mount.
onMounted(() => {
  const el = img.value
  if (el && el.complete && el.naturalWidth === 0) failed.value = true
})

/** "Photo by {author} on {provider}". Links render only for http(s) URLs. */
const credit = computed(() => imageCredit(props.block.source))
const creditLink = 'rounded-sm text-ground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ground'
</script>

<template>
  <Tile
    :padded="false"
    clip
  >
    <div
      class="absolute inset-0 bg-photo"
      aria-hidden="true"
    />
    <!-- No `alt` (WP17) = `alt=""`: a decorative image, never the file name. No `src` = the editor preview of an incomplete block. -->
    <img
      v-if="block.src && !failed"
      ref="img"
      :src="block.src"
      :alt="block.alt ?? ''"
      :loading="priority ? 'eager' : 'lazy'"
      :fetchpriority="priority ? 'high' : undefined"
      decoding="async"
      class="absolute inset-0 size-full object-cover"
      @error="failed = true"
    >
    <div
      v-if="block.caption || credit"
      class="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-ink/60 p-5 text-ground md:p-7"
    >
      <span
        v-if="block.caption"
        class="font-display text-[22px] font-semibold leading-tight md:text-[26px]"
      >{{ block.caption }}</span>
      <span
        v-if="credit"
        data-photo-credit
        class="font-mono text-xs text-ground/85"
      >
        <template v-if="credit.author">
          {{ 'Photo by ' }}<a
            v-if="credit.authorUrl"
            :href="credit.authorUrl"
            target="_blank"
            rel="noopener noreferrer"
            :class="creditLink"
          >{{ credit.author }}</a><template v-else>{{ credit.author }}</template>
        </template>
        <template v-else>{{ 'Photo' }}</template>
        <template v-if="credit.provider">
          {{ ' on ' }}<a
            v-if="credit.providerUrl"
            :href="credit.providerUrl"
            target="_blank"
            rel="noopener noreferrer"
            :class="creditLink"
          >{{ credit.provider }}</a><template v-else>{{ credit.provider }}</template>
        </template>
      </span>
    </div>
  </Tile>
</template>
