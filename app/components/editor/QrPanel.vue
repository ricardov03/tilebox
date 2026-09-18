<!--
  Site tab (WP11): the QR code of the page. The build draws `/site/qr.svg` from
  the site URL (`NUXT_PUBLIC_SITE_URL`, else the "Site URL" field above).
  "Make the QR code" sends the DRAFT to the dev-only route `POST /api/site/assets`
  (the same builder as the build). Downloads: the SVG file, and a 1024 px PNG from
  the dev-only route `GET /api/site/qr.png` (sharp). Nothing here reaches the public page.
-->
<script setup lang="ts">
import type { Profile } from '~~/types/profile'
import { isSiteUrl } from '~~/types/site'
import type { SiteAssetsMade } from '~/composables/useSiteAssets'
import { resolveSiteUrl } from '~/utils/site-head'

const { draft, site } = useSiteDraft()

/** `NUXT_PUBLIC_SITE_URL` of this dev server, when set. It wins over the field of the Site tab, as in the build. */
const envSiteUrl = useRuntimeConfig().public.siteUrl
const siteUrl = computed(() => resolveSiteUrl(envSiteUrl, site.value))
const canMake = computed(() => isSiteUrl(siteUrl.value))
const hasTile = computed(() => draft.value?.blocks.some(block => block.type === 'qr') ?? false)

/** One stamp and one "URL inside the file" for this panel and the Site panel: both call the same route. */
const assets = useSiteAssets()
const { bust } = assets
const previewOk = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
/** The URL inside the file, when this session made it ("Make the QR code" here, or "Regenerate" of the Site panel). */
const madeFor = computed(() => assets.qrUrl.value || null)
/** The URL a new code would open. */
const wanted = computed(() => `${siteUrl.value}/`)
/**
 * What the panel knows about `public/site/qr.svg`:
 * - `current`: made in this session for the URL of the draft.
 * - `stale`: made in this session for ANOTHER URL (the Site URL changed after). No download: a printed code lasts.
 * - `unknown`: a file of the last build or an earlier session. The panel cannot read the URL out of it, so it
 *   never says that the file opens the URL of the draft.
 */
const fileState = computed<'current' | 'stale' | 'unknown'>(() => {
  if (!madeFor.value) return 'unknown'
  return madeFor.value === wanted.value ? 'current' : 'stale'
})

onMounted(assets.touch)
// A new file (from either panel): try the preview again, or show "no code" when the route made none.
watch([assets.version, assets.qrUrl], () => {
  previewOk.value = assets.qrUrl.value !== ''
})

async function make() {
  if (!draft.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    const body: Profile = draft.value
    const res = await $fetch<SiteAssetsMade>('/api/site/assets', { method: 'POST', body })
    assets.made({ version: res.version, extras: res.extras ?? { qrUrl: '', messages: [] } })
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Request failed'
  }
  finally {
    busy.value = false
  }
}

const buttonClass = `flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-medium text-ink hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`
</script>

<template>
  <fieldset
    :aria-busy="busy"
    class="flex flex-col gap-2 rounded-2xl border border-line p-3"
    data-qr-panel
  >
    <legend :class="LABEL_CLASS">
      QR code of the page
    </legend>
    <p
      v-if="!canMake"
      class="text-xs text-muted"
      data-qr-needs-url
    >
      Set the "Site URL" field above first (it must start with <code class="font-mono">https://</code>). Without it the build makes no QR code and leaves a QR tile out.
    </p>
    <template v-else>
      <img
        v-if="previewOk"
        :src="bust('/site/qr.svg')"
        alt="QR code of the page"
        width="160"
        height="160"
        class="size-40 rounded-xl border border-line [image-rendering:pixelated]"
        data-qr-preview
        @error="previewOk = false"
      >
      <p
        v-else
        class="rounded-xl border border-line bg-photo p-3 text-xs text-ink"
      >
        No QR code yet. Press "Make the QR code".
      </p>
      <p
        class="text-xs text-muted"
        :data-qr-caption="fileState"
      >
        <template v-if="fileState === 'current'">
          Opens <span class="font-mono">{{ madeFor }}</span>
        </template>
        <template v-else-if="fileState === 'stale'">
          This file opens <span class="font-mono">{{ madeFor }}</span>. The site URL is now <span class="font-mono">{{ wanted }}</span>: press "Make the QR code" again.
        </template>
        <template v-else>
          This is the file of the last build. Press "Make the QR code" to be sure that it opens <span class="font-mono">{{ wanted }}</span>
        </template>
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          :class="buttonClass"
          :disabled="busy"
          data-qr-make
          @click="make"
        >
          {{ busy ? 'Working...' : 'Make the QR code' }}
        </button>
        <a
          v-if="previewOk && fileState !== 'stale'"
          href="/site/qr.svg"
          download="qr.svg"
          :class="buttonClass"
          data-qr-svg
        >Download SVG</a>
        <a
          v-if="previewOk && fileState !== 'stale'"
          href="/api/site/qr.png"
          download="qr.png"
          :class="buttonClass"
          data-qr-png
        >Download PNG</a>
      </div>
      <p class="text-xs text-muted">
        <template v-if="hasTile">
          Your page shows it in the QR tile.
        </template>
        <template v-else>
          Add a "QR code" block in the Blocks tab to show it on your page.
        </template>
        The code always uses the light colors: a light-on-dark code does not scan on many phones.
      </p>
    </template>
    <p
      v-if="error"
      class="text-xs text-pop"
      role="alert"
    >
      {{ error }}
    </p>
  </fieldset>
</template>
