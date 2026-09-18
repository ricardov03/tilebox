<!--
  Photo tile. The image covers the tile. `bg-photo` shows while it loads or if it is missing.
  Caption sits bottom-left on a soft scrim only if `caption` is set. PLAN.md 5.6.
-->
<script setup lang="ts">
import type { ImageBlock } from '~~/types/profile'
import { isHttpUrl } from './media'
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

/** Author credit. The link renders only for an http(s) author URL. */
const credit = computed(() => {
  const source = props.block.source
  if (!source?.author) return null
  const url = source.authorUrl && isHttpUrl(source.authorUrl) ? source.authorUrl : null
  return { author: source.author, url }
})
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
    <img
      v-if="!failed"
      ref="img"
      :src="block.src"
      :alt="block.alt"
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
        class="font-mono text-xs text-ground/85"
      >
        Photo by
        <a
          v-if="credit.url"
          :href="credit.url"
          target="_blank"
          rel="noopener noreferrer"
          class="underline underline-offset-2"
        >{{ credit.author }}</a>
        <template v-else>{{ credit.author }}</template>
      </span>
    </div>
  </Tile>
</template>
