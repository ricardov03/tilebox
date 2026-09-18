<!--
  Link preview for a link block (WP10a). Two switches:
  1. "Load info from the website": icon and text come from the website.
  2. "Show the website's image": the second, separate switch. Default off.
  With switch 1 on, a new URL (typed or pasted) asks the dev-only route
  POST /api/unfurl after a short pause. An older answer that arrives late is
  dropped. The answer fills `meta`, `favicon` and `image` (LOCAL files), and
  pre-fills the title and the description only when they are empty. When they
  differ, "Use fetched title / description" copies them on request.
  Turning switch 1 off keeps what you typed and clears `meta`, `favicon`, `image`.
  Nothing here runs on the public page.
-->
<script setup lang="ts">
import type { LinkBlock, LinkMeta } from '~~/types/profile'
import { domainLabel, isHttpUrl, resolveLinkIcon } from '~/components/blocks/media'

/** What POST /api/unfurl answers (content/unfurl.ts `UnfurlResult`). */
type UnfurlAnswer
  = | {
    ok: true
    title?: string
    description?: string
    siteName?: string
    themeColor?: string
    favicon?: string
    image?: string
    imageAlt?: string
    source: LinkMeta['source']
    fetchedAt: string
    note?: string
  }
  | { ok: false, reason: string }

type Changes = Record<string, unknown>

const props = defineProps<{
  block: LinkBlock
  /** Prefix for input ids. */
  idPrefix: string
}>()

const emit = defineEmits<{
  /** Same contract as `patch()` in BlockForm: changes + the keys that an empty value removes. */
  patch: [changes: Changes, optionalKeys: string[]]
}>()

const DEBOUNCE_MS = 600
const OPTIONAL = ['enrich', 'showImage', 'favicon', 'image', 'imageAlt', 'meta', 'description']

const loading = ref(false)
const reason = ref<string | null>(null)
const note = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined
/** Id of the latest request. An answer for an older id is dropped. */
let requestId = 0

function cancel() {
  clearTimeout(timer)
  controller?.abort()
  controller = undefined
  requestId++
  loading.value = false
}

async function load(force: boolean) {
  cancel()
  reason.value = null
  note.value = null
  const url = props.block.url
  if (!isHttpUrl(url)) {
    reason.value = 'Only http and https links have a preview.'
    return
  }
  const id = requestId
  const blockId = props.block.id
  controller = new AbortController()
  loading.value = true
  try {
    const answer = await $fetch<UnfurlAnswer>('/api/unfurl', {
      method: 'POST',
      body: { url, showImage: props.block.showImage ?? false, force },
      signal: controller.signal,
    })
    if (id !== requestId || blockId !== props.block.id || url !== props.block.url) return
    if (!answer.ok) {
      reason.value = answer.reason
      return
    }
    apply(answer)
  }
  catch (error) {
    if (id !== requestId) return
    reason.value = error instanceof Error ? error.message : 'The request failed.'
  }
  finally {
    if (id === requestId) loading.value = false
  }
}

function apply(answer: Extract<UnfurlAnswer, { ok: true }>) {
  note.value = answer.note ?? null
  const meta: LinkMeta = {
    ...(answer.title ? { title: answer.title } : {}),
    ...(answer.description ? { description: answer.description } : {}),
    ...(answer.siteName ? { siteName: answer.siteName } : {}),
    ...(answer.themeColor ? { themeColor: answer.themeColor } : {}),
    source: answer.source,
    fetchedAt: answer.fetchedAt,
  }
  const changes: Changes = {
    meta,
    favicon: answer.favicon,
    image: answer.image ?? props.block.image,
    imageAlt: answer.image ? answer.imageAlt : props.block.imageAlt,
  }
  // Pre-fill only what is empty. The placeholder title of a new link counts as empty.
  if (answer.title && (!props.block.title.trim() || props.block.title === NEW_LINK_TITLE)) changes.title = answer.title
  if (answer.description && !props.block.description) changes.description = answer.description
  emit('patch', changes, OPTIONAL)
}

/** A new URL: wait for the typing to stop, then ask. Also covers a paste. */
watch(() => props.block.url, () => {
  if (!props.block.enrich) return
  cancel()
  reason.value = null
  timer = setTimeout(() => void load(false), DEBOUNCE_MS)
})

/** Another block in the same form: drop the running request and the messages. */
watch(() => props.block.id, () => {
  cancel()
  reason.value = null
  note.value = null
})

onBeforeUnmount(cancel)

function setEnrich(event: Event) {
  const on = event.target instanceof HTMLInputElement && event.target.checked
  if (on) {
    emit('patch', { enrich: true }, OPTIONAL)
    void nextTick(() => load(false))
    return
  }
  cancel()
  reason.value = null
  note.value = null
  // What you typed stays. What the website gave goes. The files stay on disk: harmless.
  emit('patch', { enrich: undefined, meta: undefined, favicon: undefined, image: undefined, imageAlt: undefined }, OPTIONAL)
}

function setShowImage(event: Event) {
  const on = event.target instanceof HTMLInputElement && event.target.checked
  emit('patch', { showImage: on || undefined }, OPTIONAL)
  if (on && !props.block.image) void nextTick(() => load(false))
}

const icon = computed(() => resolveLinkIcon(props.block))
const siteName = computed(() => props.block.meta?.siteName ?? domainLabel(props.block.url))
const fetchedTitle = computed(() => {
  const title = props.block.meta?.title
  return title && title !== props.block.title ? title : null
})
const fetchedDescription = computed(() => {
  const description = props.block.meta?.description
  return description && description !== props.block.description ? description : null
})
const hasCard = computed(() => props.block.enrich === true && props.block.meta !== undefined)
const smallButton = `min-h-9 rounded-full border border-line px-3 text-xs font-medium text-ink hover:border-accent disabled:opacity-40 ${FOCUS_RING}`
</script>

<template>
  <fieldset
    data-link-enrich
    class="flex flex-col gap-3 rounded-2xl border border-line p-3"
  >
    <legend class="px-1 text-sm font-medium text-ink">
      Link preview
    </legend>

    <label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink">
      <input
        :id="`${idPrefix}-enrich`"
        type="checkbox"
        :checked="block.enrich ?? false"
        :class="FOCUS_RING"
        class="size-5 accent-[var(--color-accent)]"
        @change="setEnrich"
      >
      Load info from the website
    </label>

    <div class="flex flex-col gap-1">
      <label
        class="flex min-h-11 items-center gap-3 text-sm text-ink"
        :class="block.enrich ? 'cursor-pointer' : 'opacity-50'"
      >
        <input
          :id="`${idPrefix}-show-image`"
          type="checkbox"
          :checked="block.showImage ?? false"
          :disabled="!block.enrich"
          :aria-describedby="`${idPrefix}-show-image-help`"
          :class="FOCUS_RING"
          class="size-5 accent-[var(--color-accent)]"
          @change="setShowImage"
        >
        Show the website's image
      </label>
      <p
        :id="`${idPrefix}-show-image-help`"
        class="text-xs text-muted"
      >
        The image belongs to that website. You decide to show it. It shows on 2x1, 1x2 and 2x2 tiles.
      </p>
    </div>

    <template v-if="block.enrich">
      <div
        v-if="hasCard"
        data-link-card
        class="flex gap-3 rounded-xl border border-line bg-tile p-3"
      >
        <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ground text-ink">
          <Icon
            v-if="icon.kind === 'icon'"
            :name="icon.name"
            class="size-6"
            :aria-hidden="true"
          />
          <img
            v-else
            :src="icon.src"
            alt=""
            width="24"
            height="24"
            class="size-6 rounded"
          >
        </span>
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate font-mono text-xs text-muted">{{ siteName }}</span>
          <span
            v-if="block.meta?.title"
            class="line-clamp-2 text-sm font-medium text-ink"
          >{{ block.meta.title }}</span>
          <span
            v-if="block.meta?.description"
            class="line-clamp-3 text-xs text-muted"
          >{{ block.meta.description }}</span>
        </div>
        <img
          v-if="block.showImage && block.image"
          :src="block.image"
          :alt="block.imageAlt ?? ''"
          class="size-16 shrink-0 rounded-lg bg-photo object-cover"
        >
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          :disabled="loading"
          :class="smallButton"
          @click="load(true)"
        >
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
        <button
          v-if="fetchedTitle"
          type="button"
          :class="smallButton"
          @click="emit('patch', { title: fetchedTitle }, OPTIONAL)"
        >
          Use fetched title
        </button>
        <button
          v-if="fetchedDescription"
          type="button"
          :class="smallButton"
          @click="emit('patch', { description: fetchedDescription }, OPTIONAL)"
        >
          Use fetched description
        </button>
      </div>

      <p
        class="text-xs text-muted"
        aria-live="polite"
      >
        <span
          v-if="reason"
          data-link-reason
          class="text-ink"
        >No data from this website: {{ reason }}. Your own text stays.</span>
        <span v-else-if="note">{{ note }}</span>
        <span v-else-if="loading">Reading the website...</span>
      </p>
    </template>
  </fieldset>
</template>
