<!--
  Video tile. YouTube: build-time thumbnail + a real play button. The iframe loads only after a click.
  Other URLs: a link tile with the play icon.
-->
<script setup lang="ts">
import type { VideoBlock } from '~~/types/profile'
import { UI_ICONS } from '~/utils/networks'
import thumbManifest from '#manifest/thumbs'
import { hostOf, thumbPath, youtubeEmbedUrl, youtubeId } from './media'
import Tile from './Tile.vue'

const props = defineProps<{ block: VideoBlock }>()

/** `public/thumbs/manifest.json` (written by `scripts/fetch-favicons.ts`), or an empty map when the file is missing. */
const THUMBS: Readonly<Record<string, string>> = thumbManifest

const title = computed(() => props.block.title ?? 'Video')
const host = computed(() => hostOf(props.block.url))
const videoId = computed(() => youtubeId(props.block.url))
const thumbnail = computed(() => props.block.thumbnail ?? (videoId.value ? thumbPath(videoId.value, THUMBS) : null))

/** Only true after the visitor clicks. So the iframe never renders at build time. */
const playing = ref(false)
const embedUrl = computed(() => (videoId.value && playing.value ? youtubeEmbedUrl(videoId.value) : null))
</script>

<template>
  <Tile
    v-if="videoId"
    :padded="false"
    clip
  >
    <div class="relative min-h-0 flex-1 bg-photo">
      <iframe
        v-if="embedUrl"
        :src="embedUrl"
        :title="title"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowfullscreen
        class="absolute inset-0 size-full border-0"
      />
      <template v-else>
        <img
          v-if="thumbnail"
          :src="thumbnail"
          alt=""
          loading="lazy"
          decoding="async"
          class="absolute inset-0 size-full object-cover"
        >
        <button
          type="button"
          :aria-label="`Play ${title}`"
          class="absolute inset-0 flex items-center justify-center"
          @click="playing = true"
        >
          <span class="flex size-14 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Icon
              :name="UI_ICONS.play"
              class="size-7"
              aria-hidden="true"
            />
          </span>
        </button>
      </template>
    </div>
    <div class="flex flex-col gap-0.5 px-5 py-4 md:px-7 md:py-5">
      <span class="truncate text-lg font-semibold leading-[1.3] md:text-xl">{{ title }}</span>
      <span class="truncate text-sm text-muted md:text-[15px]">{{ host }}</span>
    </div>
  </Tile>

  <Tile
    v-else
    :href="block.url"
  >
    <Icon
      :name="UI_ICONS.play"
      class="size-9 text-accent md:size-11"
    />
    <div class="flex min-w-0 flex-col gap-0.5 md:gap-1">
      <span class="text-lg font-semibold leading-[1.3] md:text-xl">{{ title }}</span>
      <span class="truncate text-sm text-muted md:text-[15px]">{{ host }}</span>
    </div>
  </Tile>
</template>
