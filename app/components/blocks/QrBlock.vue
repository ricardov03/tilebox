<!--
  QR code of the page (WP11). `/site/qr.svg` is a LOCAL file the build drew
  from the site URL (content/site-extras.ts, uqr). No QR library and no network
  call on the page. The build drops this block when the file does not exist.
  The code always has the light colors on a solid ground: a light-on-dark QR
  code does not scan on many phones, so dark mode keeps the light square.
  In the editor preview the file may not exist yet: the tile then says why.
-->
<script setup lang="ts">
import type { QrBlock } from '~~/types/profile'
import { resolveSiteUrl, siteHost } from '~/utils/site-head'
import Tile from './Tile.vue'

const props = defineProps<{ block: QrBlock }>()

/** The one path the build writes (content/site-files.ts `SITE_EXTRA_FILES.qrCode`). */
const QR_CODE_PATH = '/site/qr.svg'

const { profile } = useProfile()
const host = siteHost(resolveSiteUrl(useRuntimeConfig().public.siteUrl, profile.site))
const caption = computed(() => props.block.caption ?? host)

const failed = ref(false)
const img = useTemplateRef<HTMLImageElement>('img')
onMounted(() => {
  const el = img.value
  if (el && el.complete && el.naturalWidth === 0) failed.value = true
})
</script>

<template>
  <Tile
    class="items-center gap-2 p-4! md:gap-3 md:p-5!"
    data-qr-tile
  >
    <p
      v-if="failed"
      class="m-auto text-center text-sm text-muted"
    >
      The QR code shows after a build with a site URL.
    </p>
    <img
      v-else
      ref="img"
      :src="QR_CODE_PATH"
      alt="QR code of this page"
      width="256"
      height="256"
      loading="lazy"
      decoding="async"
      class="min-h-0 w-auto flex-1 rounded-xl object-contain [image-rendering:pixelated]"
      @error="failed = true"
    >
    <span
      v-if="caption && !failed"
      class="max-w-full shrink-0 truncate font-mono text-[13px] text-muted md:text-sm"
    >{{ caption }}</span>
  </Tile>
</template>
