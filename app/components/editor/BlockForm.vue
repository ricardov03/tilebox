<!--
  Form for one block. Fields follow the zod schema in types/profile.ts.
  Text fields are `EditorTextField` (NOTES.md, "Editor input fix"): the input
  keeps what you type, the check waits until you stop typing, and only a value
  that passes reaches `patch()`. Each one has a `key` with the block id, so
  another block gets fresh fields. Selects and checkboxes patch at once.
  `patch()` builds the whole block, runs it through BlockSchema and emits it
  only when valid, so the preview never sees a broken block. EVERY text field
  is optional (WP17): an emptied field removes its key (strict schema, no ""),
  shows no error and never blocks the save. A block without its essential value
  (a link without a URL) is "Incomplete": it saves, and the build leaves it out.
  Link blocks (WP10a): the link preview (LinkEnrich), the icon with its "auto"
  label (LinkIconField) and the Spotlight select with a live sample.
  The last controls: Hide / Show, Duplicate, then "Delete this block", which
  opens the shared inline confirm.
-->
<script setup lang="ts">
import { BlockSchema, incompleteMessage, QR_SIZES, SPOTLIGHTS, type Block, type Spotlight } from '~~/types/profile'
import { SIZES } from '~/utils/sizes'
import { NETWORK_IDS, NETWORKS, UI_ICONS } from '~/utils/networks'

const props = defineProps<{
  block: Block
  /** The inline delete confirm is open in this form. */
  confirming: boolean
}>()

/** The Size options are the list of the block's schema: a QR tile is square (`QR_SIZES`), so the control never offers a size the schema refuses. */
const sizeOptions = computed<readonly string[]>(() => (props.block.type === 'qr' ? QR_SIZES : SIZES))

const emit = defineEmits<{
  'update:block': [block: Block]
  'requestDelete': [id: string]
  'delete': [id: string]
  'cancelDelete': []
  'duplicate': [id: string]
}>()

/** "Incomplete: add a URL", or `null`. The same rule as the build (`incompleteReason()` in types/profile.ts). */
const incomplete = computed(() => incompleteMessage(props.block))

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

/** The block with a patch on it. `undefined` or "" on an optional key deletes the key. */
function merge(changes: Patch, optionalKeys: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  const merged: Record<string, unknown> = { ...props.block, ...changes }
  for (const [key, value] of Object.entries(merged)) {
    if (optionalKeys.includes(key) && (value === undefined || value === '')) continue
    next[key] = value
  }
  return next
}

/** Merge a patch, validate, emit. */
function patch(changes: Patch, optionalKeys: string[] = []) {
  const result = BlockSchema.safeParse(merge(changes, optionalKeys))
  if (!result.success) {
    errors.value = result.error.issues.map(issue => `${issue.path.join('.') || 'block'}: ${issue.message}`)
    return
  }
  errors.value = []
  emit('update:block', result.data)
}

/** Why the schema refuses `value` for one key of this block, or `undefined`. The check of a text field. */
function fieldError(key: string, value: string): string | undefined {
  const result = BlockSchema.safeParse(merge({ [key]: value }, []))
  if (result.success) return undefined
  return result.error.issues.find(issue => issue.path[0] === key)?.message
}

/** One stable function per key, so a render does not give the field a new prop. */
const checks = new Map<string, (value: string) => string | undefined>()
function checkOf(key: string): (value: string) => string | undefined {
  let check = checks.get(key)
  if (!check) {
    check = value => fieldError(key, value)
    checks.set(key, check)
  }
  return check
}

function text(event: Event): string {
  return formControl(event)?.value ?? ''
}

function checked(event: Event): boolean {
  const target = event.target
  return target instanceof HTMLInputElement && target.checked
}

/** A new local file replaces any stock-photo source. An emptied path removes `src` (WP17): the block is incomplete until it has a file again. */
function onImageSrc(value: string | null | undefined) {
  patch({ src: value || undefined, source: null }, ['src'])
}

/** An emptied alt text removes `alt` (WP17): the page renders `alt=""`, the picker shows a soft hint. */
function onImageAlt(value: string | undefined) {
  patch({ alt: value || undefined }, ['alt'])
}

const SPOTLIGHT_LABELS: Record<Spotlight, string> = { pop: 'Pop', wobble: 'Wobble', buzz: 'Buzz' }

provideFieldDraftGroup('Blocks')

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
    <p
      v-if="incomplete"
      data-form-incomplete
      class="rounded-xl border border-line px-3 py-2 text-xs text-ink"
    >
      {{ incomplete }}. You can save it like this: the published page leaves this block out until it is complete.
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
          v-for="size in sizeOptions"
          :key="size"
          :value="size"
        >
          {{ size }}
        </option>
      </select>
    </div>

    <!-- link -->
    <template v-if="block.type === 'link'">
      <EditorTextField
        :id="fid('title')"
        :key="fid('title')"
        label="Title"
        :model-value="block.title"
        :validate="checkOf('title')"
        @commit="patch({ title: $event }, ['title'])"
      />
      <EditorTextField
        :id="fid('url')"
        :key="fid('url')"
        label="URL"
        type="url"
        :model-value="block.url"
        :validate="checkOf('url')"
        @commit="patch({ url: $event }, ['url'])"
        @paste="linkEnrich?.urlPasted()"
        @blur="linkEnrich?.urlBlurred()"
      />
      <EditorTextField
        :id="fid('description')"
        :key="fid('description')"
        label="Description"
        :model-value="block.description"
        :validate="checkOf('description')"
        @commit="patch({ description: $event }, ['description'])"
      />
      <EditorLinkEnrich
        ref="linkEnrich"
        :block="block"
        :id-prefix="fid('preview')"
        @patch="patch"
      />
      <EditorLinkIconField
        :id="fid('icon')"
        :key="fid('icon')"
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
      <EditorTextField
        :id="fid('url')"
        :key="fid('url')"
        label="URL"
        type="url"
        :model-value="block.url"
        :validate="checkOf('url')"
        @commit="patch({ url: $event }, ['url'])"
      />
      <EditorTextField
        :id="fid('label')"
        :key="fid('label')"
        label="Label"
        placeholder="@handle"
        :model-value="block.label"
        :validate="checkOf('label')"
        @commit="patch({ label: $event }, ['label'])"
      />
    </template>

    <!-- image -->
    <template v-else-if="block.type === 'image'">
      <EditorImagePicker
        :id="fid('image')"
        :key="fid('image')"
        :src="block.src"
        :alt="block.alt"
        :stock-size="block.size"
        with-alt
        @update:src="onImageSrc"
        @update:alt="onImageAlt"
        @stock="patch({ src: $event.src, alt: $event.alt, source: $event.source })"
      />
      <EditorTextField
        :id="fid('caption')"
        :key="fid('caption')"
        label="Caption"
        :model-value="block.caption"
        :validate="checkOf('caption')"
        @commit="patch({ caption: $event }, ['caption'])"
      />
    </template>

    <!-- text -->
    <template v-else-if="block.type === 'text'">
      <EditorTextField
        :id="fid('title')"
        :key="fid('title')"
        label="Title"
        :model-value="block.title"
        :validate="checkOf('title')"
        @commit="patch({ title: $event }, ['title'])"
      />
      <EditorTextField
        :id="fid('body')"
        :key="fid('body')"
        label="Body"
        multiline
        :rows="5"
        :model-value="block.body"
        :validate="checkOf('body')"
        @commit="patch({ body: $event }, ['body'])"
      />
      <EditorTextField
        :id="fid('footnote')"
        :key="fid('footnote')"
        label="Footnote"
        :model-value="block.footnote"
        :validate="checkOf('footnote')"
        @commit="patch({ footnote: $event }, ['footnote'])"
      />
    </template>

    <!-- section -->
    <template v-else-if="block.type === 'section'">
      <EditorTextField
        :id="fid('title')"
        :key="fid('title')"
        label="Title"
        :model-value="block.title"
        :validate="checkOf('title')"
        @commit="patch({ title: $event }, ['title'])"
      />
    </template>

    <!-- map -->
    <template v-else-if="block.type === 'map'">
      <EditorTextField
        :id="fid('label')"
        :key="fid('label')"
        label="Label"
        :model-value="block.label"
        :validate="checkOf('label')"
        @commit="patch({ label: $event }, ['label'])"
      />
      <EditorTextField
        :id="fid('sublabel')"
        :key="fid('sublabel')"
        label="Sublabel"
        placeholder="GMT-5"
        :model-value="block.sublabel"
        :validate="checkOf('sublabel')"
        @commit="patch({ sublabel: $event }, ['sublabel'])"
      />
      <EditorTextField
        :id="fid('url')"
        :key="fid('url')"
        label="Map URL"
        type="url"
        :model-value="block.url"
        :validate="checkOf('url')"
        @commit="patch({ url: $event }, ['url'])"
      />
    </template>

    <!-- video -->
    <template v-else-if="block.type === 'video'">
      <EditorTextField
        :id="fid('url')"
        :key="fid('url')"
        label="Video URL"
        type="url"
        :model-value="block.url"
        :validate="checkOf('url')"
        @commit="patch({ url: $event }, ['url'])"
      />
      <EditorTextField
        :id="fid('title')"
        :key="fid('title')"
        label="Title"
        :model-value="block.title"
        :validate="checkOf('title')"
        @commit="patch({ title: $event }, ['title'])"
      />
      <EditorImagePicker
        :id="fid('thumbnail')"
        :key="fid('thumbnail')"
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
