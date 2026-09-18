<!--
  Site tab (WP11): the QR code of the page. The build draws `/site/qr.svg` from
  the site URL (`NUXT_PUBLIC_SITE_URL`, else the "Site address" field above).
  "Make the QR code" sends the DRAFT to the dev-only route `POST /api/site/assets`
  (the same builder as the build). Downloads: the SVG file, and a 1024 px PNG from
  the dev-only route `GET /api/site/qr.png` (sharp). Nothing here reaches the public page.
-->
<script setup lang="ts">
import type { Profile } from '~~/types/profile'
import { isSiteUrl } from '~~/types/site'
import { resolveSiteUrl } from '~/utils/site-head'

interface AssetsResponse {
  version: string
  extras?: { qrUrl: string, messages: string[] }
}

const { draft, site } = useSiteDraft()

/** `NUXT_PUBLIC_SITE_URL` of this dev server, when set. It wins over the field of the Site tab, as in the build. */
const envSiteUrl = useRuntimeConfig().public.siteUrl
const siteUrl = computed(() => resolveSiteUrl(envSiteUrl, site.value))
const canMake = computed(() => isSiteUrl(siteUrl.value))
const hasTile = computed(() => draft.value?.blocks.some(block => block.type === 'qr') ?? false)

/** Cache-busting stamp. Set on the client only, so the first render has no `?v=`. */
const version = ref('')
const previewOk = ref(true)
const busy = ref(false)
const error = ref<string | null>(null)
/** The URL inside the code that was made last. */
const madeFor = ref<string | null>(null)

onMounted(() => {
  version.value = Date.now().toString(36)
})

const bust = (path: string) => (version.value ? `${path}?v=${version.value}` : path)

async function make() {
  if (!draft.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    const body: Profile = draft.value
    const res = await $fetch<AssetsResponse>('/api/site/assets', { method: 'POST', body })
    version.value = res.version
    madeFor.value = res.extras?.qrUrl || null
    previewOk.value = Boolean(res.extras?.qrUrl)
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
      Set the site address above first (it must start with <code class="font-mono">https://</code>). Without it the build makes no QR code and leaves a QR tile out.
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
      <p class="font-mono text-xs text-muted">
        {{ madeFor ?? `${siteUrl}/` }}
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
          v-if="previewOk"
          href="/site/qr.svg"
          download="qr.svg"
          :class="buttonClass"
          data-qr-svg
        >Download SVG</a>
        <a
          v-if="previewOk"
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
