<!--
  Image field. A file input uploads through /api/upload (dev only) and
  sets `src`. Shows a preview. `alt` is required by the schema for image
  blocks; pass `require-alt` to show that field.
  With `stock-size` (image blocks only, WP12) the field has two tabs: "Upload" (the same controls as
  before) and "Pexels" (PexelsPicker.vue). A picked stock photo is ONE `stock` event with `src`, `alt`
  and `source` together, so the form saves them in one step. An upload still emits `update:src`, and
  the form clears `source` then (a local file has no stock credit).
-->
<script setup lang="ts">
import type { PickResult } from '~~/content/pexels'
import type { Size } from '~/utils/sizes'

const src = defineModel<string | null | undefined>('src')
const alt = defineModel<string | undefined>('alt')

const props = defineProps<{
  id: string
  label?: string
  requireAlt?: boolean
  /** The tile size of an image block. Set = the "Pexels" tab shows. Thumbnails have no credit field, so they get no stock tab. */
  stockSize?: Size
}>()

const emit = defineEmits<{
  stock: [picked: { src: string, alt: string, source: PickResult['source'] }]
}>()

type PickerTab = 'upload' | 'pexels'
const TABS: { id: PickerTab, label: string }[] = [{ id: 'upload', label: 'Upload' }, { id: 'pexels', label: 'Pexels' }]
const tab = ref<PickerTab>('upload')
const tabButtons = useTemplateRef<HTMLButtonElement[]>('tabButtons')

function onTabKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  event.preventDefault()
  const next: PickerTab = tab.value === 'upload' ? 'pexels' : 'upload'
  tab.value = next
  void nextTick(() => tabButtons.value?.find(button => button.dataset.tab === next)?.focus())
}

/** The alt text this field filled in from a stock photo. Still the same = the owner did not write their own. */
const prefilledAlt = ref<string | null>(null)

// The form component is used again for the next block: start on "Upload" with no memory of the last one.
watch(() => props.id, () => {
  tab.value = 'upload'
  prefilledAlt.value = null
})

/**
 * The alt text of the stock photo is used when the owner has none of their own: empty, the sample
 * text of a new block, or the text of the stock photo picked before. A text the owner wrote stays.
 */
function onStockPick(result: PickResult) {
  const current = (alt.value ?? '').trim()
  const replace = current === '' || current.startsWith('Sample image') || current === prefilledAlt.value
  const nextAlt = replace ? result.alt : current
  if (replace) prefilledAlt.value = result.alt
  emit('stock', { src: result.src, alt: nextAlt, source: result.source })
}

const uploading = ref(false)
const error = ref<string | null>(null)

interface FetchErrorLike {
  data?: { statusMessage?: string, message?: string }
}

/** The shape $fetch rejects with when the route answered with an error. */
function isFetchErrorLike(value: unknown): value is FetchErrorLike {
  return typeof value === 'object' && value !== null && 'data' in value
}

function messageOf(err: unknown): string {
  if (isFetchErrorLike(err)) {
    const message = err.data?.statusMessage ?? err.data?.message
    if (message) return message
  }
  return err instanceof Error ? err.message : 'Upload failed'
}

async function onFile(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  error.value = null
  const body = new FormData()
  body.append('file', file)
  try {
    const res = await $fetch<{ src: string }>('/api/upload', { method: 'POST', body })
    src.value = res.src
  }
  catch (err) {
    error.value = messageOf(err)
  }
  finally {
    uploading.value = false
    input.value = ''
  }
}

function onSrcInput(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) src.value = target.value || null
}

function onAltInput(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) alt.value = target.value
}

const tabId = (name: PickerTab) => `${props.id}-tab-${name}`
const panelId = (name: PickerTab) => `${props.id}-panel-${name}`
const fileId = computed(() => `${props.id}-file`)
const srcId = computed(() => `${props.id}-src`)
const altId = computed(() => `${props.id}-alt`)
const inputClass = INPUT_CLASS
</script>

<template>
  <fieldset
    :aria-busy="uploading"
    class="flex flex-col gap-2 border-0 p-0"
  >
    <legend class="text-sm font-medium text-ink">
      {{ label ?? 'Image' }}
    </legend>

    <div
      v-if="stockSize"
      role="tablist"
      aria-label="Image source"
      class="flex border-b border-line"
      @keydown="onTabKey"
    >
      <button
        v-for="t in TABS"
        :id="tabId(t.id)"
        ref="tabButtons"
        :key="t.id"
        type="button"
        role="tab"
        :data-tab="t.id"
        :aria-selected="tab === t.id"
        :aria-controls="panelId(t.id)"
        :tabindex="tab === t.id ? 0 : -1"
        :class="[FOCUS_RING, tab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink']"
        class="min-h-11 flex-1 border-b-2 text-sm font-medium focus-visible:-outline-offset-2"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <div
      v-show="tab === 'upload'"
      :id="stockSize ? panelId('upload') : undefined"
      :role="stockSize ? 'tabpanel' : undefined"
      :aria-labelledby="stockSize ? tabId('upload') : undefined"
      class="flex items-start gap-3"
    >
      <span class="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-photo">
        <img
          v-if="src"
          :src="src"
          :alt="alt ?? ''"
          class="size-full object-cover"
        >
        <span
          v-else
          class="text-xs text-muted"
        >none</span>
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <label
          :for="fileId"
          class="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-ground px-3 text-sm font-medium text-ink hover:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
        >
          {{ uploading ? 'Uploading...' : 'Upload png, jpg, webp or gif' }}
          <input
            :id="fileId"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            class="sr-only"
            :disabled="uploading"
            @change="onFile"
          >
        </label>
        <label
          :for="srcId"
          class="sr-only"
        >Image path</label>
        <input
          :id="srcId"
          :value="src ?? ''"
          type="text"
          placeholder="/blocks/sample.jpg"
          :class="inputClass"
          class="font-mono"
          @input="onSrcInput"
        >
      </div>
    </div>

    <div
      v-if="stockSize && tab === 'pexels'"
      :id="panelId('pexels')"
      role="tabpanel"
      :aria-labelledby="tabId('pexels')"
    >
      <EditorPexelsPicker
        :id="id"
        :size="stockSize"
        @pick="onStockPick"
      />
    </div>

    <p
      v-if="error"
      class="text-xs text-pop"
      role="alert"
    >
      {{ error }}
    </p>

    <template v-if="requireAlt">
      <label
        :for="altId"
        class="text-sm font-medium text-ink"
      >Alt text <span class="text-muted">(required)</span></label>
      <input
        :id="altId"
        :value="alt ?? ''"
        type="text"
        required
        :class="inputClass"
        @input="onAltInput"
      >
    </template>
  </fieldset>
</template>
