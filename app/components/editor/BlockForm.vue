<!--
  Form for one block. Fields follow the zod schema in types/profile.ts.
  Every change builds the whole block, runs it through BlockSchema and
  emits it only when valid, so the preview updates live and never sees a
  broken block. Optional string fields are removed when emptied (strict
  schema, no ""). An invalid value shows an inline error and is not emitted.
  The last control is "Delete this block". It opens the shared inline confirm.
-->
<script setup lang="ts">
import { BlockSchema, type Block } from '~~/types/profile'
import { SIZES } from '~/utils/sizes'
import { NETWORK_IDS, NETWORKS } from '~/utils/networks'

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
}>()

const errors = ref<string[]>([])
watch(() => props.block.id, () => {
  errors.value = []
})

const deleteButton = useTemplateRef<HTMLButtonElement>('deleteButton')

/** The button is back after the next render: focus it again. */
async function cancelDelete() {
  emit('cancelDelete')
  await nextTick()
  deleteButton.value?.focus()
}

type Patch = Partial<Record<string, string | boolean | null | undefined>>

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
      <EditorIconPicker
        :id="fid('icon')"
        :model-value="block.icon"
        @update:model-value="patch({ icon: $event }, ['icon'])"
      />
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

    <div class="mt-2 flex min-h-11 flex-col border-t border-line pt-4">
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
