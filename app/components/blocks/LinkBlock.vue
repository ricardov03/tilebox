<!--
  Link tile. PLAN.md 5.6, 8 (WP2) and WP10a.
  Icon, in order: the owner's `icon`, the brand icon from the URL, the local
  favicon file, `line-md:link` (`resolveLinkIcon` in ./media.ts).
  Plain tile: top row icon + domain + arrow, bottom title + description.
  Featured look (`linkImageLayout`): the website's image, a local file, fills the
  top (2x2, 1x2) or the right third (2x1). Text and image never overlap, so the
  text stays on token colors. 1x1 never shows the image.
  `spotlight`: one gentle attention animation, transform only, 1 cycle per 6 s.
-->
<script setup lang="ts">
import type { LinkBlock } from '~~/types/profile'
import { UI_ICONS } from '~/utils/networks'
import { sizeToSpan } from '~/utils/sizes'
import { domainLabel, linkImageLayout, resolveLinkIcon, type TileVariant } from './media'
import Tile from './Tile.vue'

const props = withDefaults(defineProps<{
  block: LinkBlock
  /** True for a tile near the top of the page: its image loads eagerly with high fetch priority. */
  priority?: boolean
}>(), { priority: false })

const variant = computed<TileVariant>(() => {
  if (props.block.accent) return 'accent'
  if (props.block.pop) return 'pop'
  return 'tile'
})

const domain = computed(() => domainLabel(props.block.url))
const icon = computed(() => resolveLinkIcon(props.block))
const wide = computed(() => sizeToSpan(props.block.size).cols === 2)
const imageLayout = computed(() => linkImageLayout(props.block))

/** A broken image file hides itself. The `bg-photo` area stays. */
const failed = ref(false)
const img = useTemplateRef<HTMLImageElement>('img')
onMounted(() => {
  const el = img.value
  if (el && el.complete && el.naturalWidth === 0) failed.value = true
})

const META_CLASSES: Record<TileVariant, string> = {
  tile: 'text-muted',
  accent: 'text-accent-soft',
  pop: 'text-pop-ink/85',
}

const spotlightClass = computed(() =>
  props.block.spotlight ? `spotlight spotlight-${props.block.spotlight} motion-reduce:animate-none` : '',
)
</script>

<template>
  <Tile
    :href="block.url"
    :variant="variant"
    :padded="imageLayout === null"
    :clip="imageLayout !== null"
    :class="[spotlightClass, imageLayout === 'side' ? 'flex-row!' : '']"
    :data-spotlight="block.spotlight"
  >
    <div
      :class="imageLayout === null
        ? 'contents'
        : ['flex min-h-0 min-w-0 flex-col justify-between gap-3 p-5 md:p-7', imageLayout === 'side' ? 'order-1 h-full flex-1' : 'order-2 shrink-0']"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <Icon
            v-if="icon.kind === 'icon'"
            :name="icon.name"
            class="size-9 shrink-0 md:size-11"
          />
          <img
            v-else
            :src="icon.src"
            alt=""
            width="44"
            height="44"
            loading="lazy"
            decoding="async"
            class="size-9 shrink-0 rounded-lg md:size-11"
          >
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
          :class="[
            wide ? 'text-[26px] leading-[1.05] md:text-[34px]' : 'text-base leading-[1.3] md:text-lg',
            imageLayout === null ? '' : 'line-clamp-2',
          ]"
        >{{ block.title }}</span>
        <span
          v-if="block.description"
          class="text-sm leading-[1.4] md:text-base"
          :class="[META_CLASSES[variant], imageLayout === null ? '' : 'line-clamp-2']"
        >{{ block.description }}</span>
      </div>
    </div>

    <div
      v-if="imageLayout !== null"
      data-link-image
      class="relative bg-photo"
      :class="imageLayout === 'side' ? 'order-2 h-full w-1/3 shrink-0' : 'order-1 min-h-0 w-full flex-1'"
    >
      <img
        v-if="!failed"
        ref="img"
        :src="block.image"
        :alt="block.imageAlt ?? ''"
        :loading="priority ? 'eager' : 'lazy'"
        :fetchpriority="priority ? 'high' : undefined"
        decoding="async"
        class="absolute inset-0 size-full object-cover"
        @error="failed = true"
      >
    </div>
  </Tile>
</template>

<style>
/*
 * Spotlight: the move takes the first part of a 6 s cycle, then the tile rests.
 * Transform only: no layout shift. The hover lift uses `translate`, so both work.
 * The first cycle waits for the page-load stagger.
 */
@keyframes spotlight-pop {
  0%, 14%, 100% { transform: scale(1); }
  4% { transform: scale(1.04); }
  9% { transform: scale(0.99); }
}

@keyframes spotlight-wobble {
  0%, 16%, 100% { transform: rotate(0deg); }
  3% { transform: rotate(-2deg); }
  7% { transform: rotate(2deg); }
  11% { transform: rotate(-1deg); }
}

@keyframes spotlight-buzz {
  0%, 12%, 100% { transform: translateX(0); }
  2%, 6%, 10% { transform: translateX(-2px); }
  4%, 8% { transform: translateX(2px); }
}

.spotlight {
  animation-duration: 6s;
  animation-timing-function: ease-in-out;
  animation-delay: 1.2s;
  animation-iteration-count: infinite;
}

.spotlight-pop { animation-name: spotlight-pop; }
.spotlight-wobble { animation-name: spotlight-wobble; }
.spotlight-buzz { animation-name: spotlight-buzz; }

@media (prefers-reduced-motion: reduce) {
  .spotlight {
    animation: none;
  }
}
</style>
