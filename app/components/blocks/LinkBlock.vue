<!--
  Link tile. PLAN.md 5.6 and 8 (WP2).
  Top row: icon (or build-time favicon, or `line-md:link`) + domain + arrow.
  Bottom: title + optional description.
-->
<script setup lang="ts">
import type { LinkBlock } from '~~/types/profile'
import { UI_ICONS } from '~/utils/networks'
import { sizeToSpan } from '~/utils/sizes'
import iconManifest from '~~/public/icons/manifest.json'
import { domainLabel, faviconPath, hostOf, type TileVariant } from './media'
import Tile from './Tile.vue'

const props = defineProps<{ block: LinkBlock }>()

/** Written by `scripts/fetch-favicons.ts` at build time. Static import: the fallback is decided at build. */
const FAVICONS: Readonly<Record<string, string>> = iconManifest

const variant = computed<TileVariant>(() => {
  if (props.block.accent) return 'accent'
  if (props.block.pop) return 'pop'
  return 'tile'
})

const domain = computed(() => domainLabel(props.block.url))
const favicon = computed(() => (props.block.icon ? null : faviconPath(hostOf(props.block.url), FAVICONS)))
const wide = computed(() => sizeToSpan(props.block.size).cols === 2)

const META_CLASSES: Record<TileVariant, string> = {
  tile: 'text-muted',
  accent: 'text-accent-soft',
  pop: 'text-pop-ink/85',
}
</script>

<template>
  <Tile
    :href="block.url"
    :variant="variant"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <Icon
          v-if="block.icon"
          :name="block.icon"
          class="size-9 shrink-0 md:size-11"
        />
        <img
          v-else-if="favicon"
          :src="favicon"
          alt=""
          width="44"
          height="44"
          loading="lazy"
          decoding="async"
          class="size-9 shrink-0 rounded-lg md:size-11"
        >
        <Icon
          v-else
          :name="UI_ICONS.link"
          class="size-9 shrink-0 md:size-11"
        />
        <span
          v-if="!block.icon"
          class="truncate font-mono text-[13px] font-medium md:text-sm"
          :class="META_CLASSES[variant]"
        >{{ domain }}</span>
      </div>
      <Icon
        :name="UI_ICONS.external"
        class="size-[22px] shrink-0 md:size-6"
      />
    </div>

    <div class="flex min-w-0 flex-col gap-1 md:gap-1.5">
      <span
        class="font-display font-semibold"
        :class="wide
          ? 'text-[26px] leading-[1.05] md:text-[34px]'
          : 'text-base leading-[1.3] md:text-lg'"
      >{{ block.title }}</span>
      <span
        v-if="block.description"
        class="text-sm leading-[1.4] md:text-base"
        :class="META_CLASSES[variant]"
      >{{ block.description }}</span>
    </div>
  </Tile>
</template>
