<!--
  Form for one block. Fields follow the zod schema in types/profile.ts.
  Every change builds the whole block, runs it through BlockSchema and
  emits it only when valid, so the preview updates live and never sees a
  broken block. Optional string fields are removed when emptied (strict
  schema, no ""). An invalid value shows an inline error and is not emitted.
  Link blocks (WP10a): the link preview (LinkEnrich), the icon with its "auto"
  label (LinkIconField) and the Spotlight select with a live sample.
  The last controls: Hide / Show, Duplicate, then "Delete this block", which
  opens the shared inline confirm.
-->
<script setup lang="ts">
import { BlockSchema, SPOTLIGHTS, type Block, type Spotlight } from '~~/types/profile'
import { SIZES } from '~/utils/sizes'
import { NETWORK_IDS, NETWORKS, UI_ICONS } from '~/utils/networks'

const props = defineProps<{
  block: Block
  /** The inline delete confirm is open in this form. */
  confirming: boolean
}>()

const emit = defineEmits<{
  'update:block': [block: Block]
  'requestDelete': [id: string]
  'delete': [id: string]
  'cancelDelete': []
  'duplicate': [id: string]
}>()

const errors = ref<string[]>([])
watch(() => props.block.id, () => {
  errors.value = []
})

const deleteButton = useTemplateRef<HTMLButtonElement>('deleteButton')
/** The link preview decides when a new URL is read: it must know about a paste and a blur of the URL field. */
const linkEnrich = useTemplateRef<{ urlPasted: () => void, urlBlurred: () => void }>('linkEnrich')

/** The button is back after the next render: focus it again. */
async function cancelDelete() {
  emit('cancelDelete')
  await nextTick()
  deleteButton.value?.focus()
}

/** Values are checked by `BlockSchema` below, so a patch may carry any JSON value (the link preview sends `meta`). */
type Patch = Record<string, unknown>

/** Merge a patch, validate, emit. `undefined` or "" on an optional key deletes the key. */
function patch(changes: Patch, optionalKeys: string[] = []) {
  const next: Record<string, unknown> = {}
  const merged: Record<string, unknown> = { ...props.block, ...changes }
  for (const [key, value] of Object.entries(merged)) {
    if (optionalKeys.includes(key) && (value === undefined || value === '')) continue
    next[key] = value
  }
  const result = BlockSchema.safeParse(next)
  if (!result.success) {
    errors.value = result.error.issues.map(issue => `${issue.path.join('.') || 'block'}: ${issue.message}`)
    return
  }
  errors.value = []
  emit('update:block', result.data)
}

function text(event: Event): string {
  return formControl(event)?.value ?? ''
}

function checked(event: Event): boolean {
  const target = event.target
  return target instanceof HTMLInputElement && target.checked
}

/** A new local file replaces any stock-photo source. An empty value is ignored: `src` is required. */
function onImageSrc(value: string | null | undefined) {
  if (!value) return
  patch({ src: value, source: null })
}

/** `alt` is required for image blocks. An empty value is ignored. */
function onImageAlt(value: string | undefined) {
  if (!value) return
  patch({ alt: value })
}

const SPOTLIGHT_LABELS: Record<Spotlight, string> = { pop: 'Pop', wobble: 'Wobble', buzz: 'Buzz' }

const fid = (name: string) => `blk-${props.block.id}-${name}`
const inputClass = INPUT_CLASS
const labelClass = LABEL_CLASS
</script>

<template>
  <form
    class="flex flex-col gap-4"
    @submit.prevent
  >
    <p class="font-mono text-xs text-muted">
      {{ block.type }} · id {{ block.id }}
    </p>

    <ul
      v-if="errors.length"
      class="list-disc rounded-xl border border-pop px-3 py-2 pl-7 text-sm text-ink"
      role="alert"
    >
      <li
        v-for="(error, i) in errors"
        :key="i"
        class="font-mono text-xs"
      >
        {{ error }}
      </li>
    </ul>

    <div
      v-if="block.type !== 'section'"
      class="flex flex-col gap-1"
    >
      <label
        :for="fid('size')"
        :class="labelClass"
      >Size</label>
      <select
        :id="fid('size')"
        :value="block.size"
        :class="inputClass"
        @change="patch({ size: text($event) })"
      >
        <option
          v-for="size in SIZES"
          :key="size"
          :value="size"
        >
          {{ size }}
        </option>
      </select>
    </div>

    <!-- link -->
    <template v-if="block.type === 'link'">
      <div class="flex flex-col gap-1">
        <label
          :for="fid('title')"
          :class="labelClass"
        >Title</label>
        <input
          :id="fid('title')"
          :value="block.title"
          type="text"
          :class="inputClass"
          @input="patch({ title: text($event) })"
        >
      </div>
      <div class="flex flex-col gap-1">
        <label
          :for="fid('url')"
          :class="labelClass"
        >URL</label>
        <input
          :id="fid('url')"
          :value="block.url"
          type="url"
          :class="inputClass"
          @input="patch({ url: text($event) })"
          @paste="linkEnrich?.urlPasted()"
          @blur="linkEnrich?.urlBlurred()"
        >
      </div>
      <div class="flex flex-col gap-1">
        <label
          :for="fid('description')"
          :class="labelClass"
        >Description</label>
        <input
          :id="fid('description')"
          :value="block.description ?? ''"
          type="text"
          :class="inputClass"
          @input="patch({ description: text($event) }, ['description'])"
        >
      </div>
      <EditorLinkEnrich
        ref="linkEnrich"
        :block="block"
        :id-prefix="fid('preview')"
        @patch="patch"
      />
      <EditorLinkIconField
        :id="fid('icon')"
        :block="block"
        @update:icon="patch({ icon: $event }, ['icon'])"
      />
      <div class="flex flex-col gap-1">
        <label
          :for="fid('spotlight')"
          :class="labelClass"
        >Spotlight</label>
        <div class="flex items-center gap-3">
          <select
            :id="fid('spotlight')"
            :value="block.spotlight ?? ''"
            :class="inputClass"
            class="min-w-0 flex-1"
            @change="patch({ spotlight: text($event) }, ['spotlight'])"
          >
            <option value="">
              None
            </option>
            <option
              v-for="name in SPOTLIGHTS"
              :key="name"
              :value="name"
            >
              {{ SPOTLIGHT_LABELS[name] }}
            </option>
          </select>
          <!-- Live sample: the same CSS classes as the tile (LinkBlock.vue), without the start delay. `key` restarts it. -->
          <span
            :key="block.spotlight ?? 'none'"
            data-spotlight-sample
            :class="block.spotlight ? `spotlight spotlight-${block.spotlight} motion-reduce:animate-none` : ''"
            class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-xs font-medium text-accent-ink"
            style="animation-delay: 0s"
            aria-hidden="true"
          >Aa</span>
        </div>
        <p class="text-xs text-muted">
          A gentle move every 6 seconds, to draw the eye. One tile only: a new spotlight takes it from the old one. Off for visitors who ask for reduced motion.
        </p>
      </div>
      <div class="flex gap-4">
        <label class="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            :checked="block.accent ?? false"
            :class="FOCUS_RING"
            class="size-5 accent-accent"
            @change="patch({ accent: checked($event) || undefined }, ['accent'])"
          >
          Accent tile
        </label>
        <label class="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            :checked="block.pop ?? false"
            :class="FOCUS_RING"
            class="size-5 accent-accent"
            @change="patch({ pop: checked($event) || undefined }, ['pop'])"
          >
          Pop tile
        </label>
      </div>
    </template>

    <!-- social -->
    <template v-else-if="block.type === 'social'">
      <div class="flex flex-col gap-1">
        <label
          :for="fid('network')"
          :class="labelClass"
        >Network</label>
        <select
          :id="fid('network')"
          :value="block.network"
          :class="inputClass"
          @change="patch({ network: text($event) })"
        >
          <option
            v-for="id in NETWORK_IDS"
            :key="id"
            :value="id"
          >
            {{ NETWORKS[id].label }}
          </option>
        </select>
      </div>
      <div class="flex flex-col gap-1">
        <label
          :for="fid('url')"
          :class="labelClass"
        >URL</label>
        <input
          :id="fid('url')"
          :value="block.url"
          type="url"
          :class="inputClass"
          @input="patch({ url: text($event) })"
        >
      </div>
      <div class="flex flex-col gap-1">
        <label
          :for="fid('label')"
          :class="labelClass"
        >Label</label>
        <input
          :id="fid('label')"
          :value="block.label ?? ''"
          type="text"
          placeholder="@handle"
          :class="inputClass"
          @input="patch({ label: text($event) }, ['label'])"
        >
      </div>
    </template>

    <!-- image -->
    <template v-else-if="block.type === 'image'">
      <EditorImagePicker
        :id="fid('image')"
        :src="block.src"
        :alt="block.alt"
        require-alt
        @update:src="onImageSrc"
        @update:alt="onImageAlt"
      />
      <div class="flex flex-col gap-1">
        <label
          :for="fid('caption')"
          :class="labelClass"
        >Caption</label>
        <input
          :id="fid('caption')"
          :value="block.caption ?? ''"
          type="text"
          :class="inputClass"
          @input="patch({ caption: text($event) }, ['caption'])"
        >
      </div>
    </template>

    <!-- text -->
    <template v-else-if="block.type === 'text'">
      <div class="flex flex-col gap-1">
        <label
          :for="fid('title')"
          :class="labelClass"
        >Title</label>
        <input
          :id="fid('title')"
          :value="block.title ?? ''"
          type="text"
          :class="inputClass"
          @input="patch({ title: text($event) }, ['title'])"
        >
      </div>
      <div class="flex flex-col gap-1">
        <label
          :for="fid('body')"
          :class="labelClass"
        >Body</label>
        <textarea
          :id="fid('body')"
          :value="block.body"
          rows="5"
          :class="inputClass"
          class="py-2"
          @input="patch({ body: text($event) })"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label
          :for="fid('footnote')"
          :class="labelClass"
        >Footnote</label>
        <input
          :id="fid('footnote')"
          :value="block.footnote ?? ''"
          type="text"
          :class="inputClass"
          @input="patch({ footnote: text($event) }, ['footnote'])"
        >
      </div>
    </template>

    <!-- section -->
    <template v-else-if="block.type === 'section'">
      <div class="flex flex-col gap-1">
        <label
          :for="fid('title')"
          :class="labelClass"
        >Title</label>
        <input
          :id="fid('title')"
          :value="block.title"
          type="text"
          :class="inputClass"
          @input="patch({ title: text($event) })"
        >
      </div>
    </template>

    <!-- map -->
    <template v-else-if="block.type === 'map'">
      <div class="flex flex-col gap-1">
        <label
          :for="fid('label')"
          :class="labelClass"
        >Label</label>
        <input
          :id="fid('label')"
          :value="block.label"
          type="text"
          :class="inputClass"
          @input="patch({ label: text($event) })"
        >
      </div>
      <div class="flex flex-col gap-1">
        <label
          :for="fid('sublabel')"
          :class="labelClass"
        >Sublabel</label>
        <input
          :id="fid('sublabel')"
          :value="block.sublabel ?? ''"
          type="text"
          placeholder="GMT-5"
          :class="inputClass"
          @input="patch({ sublabel: text($event) }, ['sublabel'])"
        >
      </div>
      <div class="flex flex-col gap-1">
        <label
          :for="fid('url')"
          :class="labelClass"
        >Map URL</label>
        <input
          :id="fid('url')"
          :value="block.url"
          type="url"
          :class="inputClass"
          @input="patch({ url: text($event) })"
        >
      </div>
    </template>

    <!-- video -->
    <template v-else-if="block.type === 'video'">
      <div class="flex flex-col gap-1">
        <label
          :for="fid('url')"
          :class="labelClass"
        >Video URL</label>
        <input
          :id="fid('url')"
          :value="block.url"
          type="url"
          :class="inputClass"
          @input="patch({ url: text($event) })"
        >
      </div>
      <div class="flex flex-col gap-1">
        <label
          :for="fid('title')"
          :class="labelClass"
        >Title</label>
        <input
          :id="fid('title')"
          :value="block.title ?? ''"
          type="text"
          :class="inputClass"
          @input="patch({ title: text($event) }, ['title'])"
        >
      </div>
      <EditorImagePicker
        :id="fid('thumbnail')"
        label="Thumbnail (optional)"
        :src="block.thumbnail"
        @update:src="patch({ thumbnail: $event ?? undefined }, ['thumbnail'])"
      />
    </template>

    <!-- WP11: the contact / qr fields, then schedule + "no UTM" (one line each, the logic lives in those components). -->
    <EditorBlockExtraFields
      :block="block"
      @update:block="emit('update:block', $event)"
    />
    <EditorBlockAdvanced
      :block="block"
      @update:block="emit('update:block', $event)"
    />

    <div class="mt-2 flex flex-col gap-2 border-t border-line pt-4">
      <div class="flex gap-2">
        <button
          type="button"
          data-form-hide
          :aria-pressed="block.hidden ?? false"
          :class="FOCUS_RING"
          class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-ink hover:border-accent"
          @click="patch({ hidden: block.hidden ? undefined : true }, ['hidden'])"
        >
          <Icon
            :name="block.hidden ? UI_ICONS.shown : UI_ICONS.hidden"
            class="size-5"
            :aria-hidden="true"
          />
          {{ block.hidden ? 'Show on the page' : 'Hide from the page' }}
        </button>
        <button
          type="button"
          data-form-duplicate
          :class="FOCUS_RING"
          class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-ink hover:border-accent"
          @click="emit('duplicate', block.id)"
        >
          <Icon
            :name="UI_ICONS.duplicate"
            class="size-5"
            :aria-hidden="true"
          />
          Duplicate
        </button>
      </div>
      <p
        v-if="block.hidden"
        class="text-xs text-muted"
      >
        Hidden: this block stays here in the editor and is left out of the published page.
      </p>
      <EditorDeleteConfirm
        v-if="confirming"
        :label="blockSummary(block)"
        class="justify-end"
        @confirm="emit('delete', block.id)"
        @cancel="cancelDelete"
      />
      <button
        v-else
        ref="deleteButton"
        type="button"
        :class="FOCUS_RING"
        class="min-h-11 w-full rounded-full border border-line px-4 text-sm font-medium text-ink hover:border-pop hover:text-pop"
        @click="emit('requestDelete', block.id)"
      >
        Delete this block
      </button>
    </div>
  </form>
</template>
