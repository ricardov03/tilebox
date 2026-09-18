<!--
  Image field. A file input uploads through /api/upload (dev only) and
  sets `src`. Shows a preview. `alt` is required by the schema for image
  blocks; pass `require-alt` to show that field, and `require-src` when the
  path may not be empty. Both text fields are `EditorTextField`: an empty
  required value stays in the input, shows "Required" and is never emitted.
-->
<script setup lang="ts">
const src = defineModel<string | null | undefined>('src')
const alt = defineModel<string | undefined>('alt')

const props = defineProps<{
  id: string
  label?: string
  requireSrc?: boolean
  requireAlt?: boolean
}>()

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

const fileId = computed(() => `${props.id}-file`)
const srcId = computed(() => `${props.id}-src`)
const altId = computed(() => `${props.id}-alt`)
</script>

<template>
  <fieldset
    :aria-busy="uploading"
    class="flex flex-col gap-2 border-0 p-0"
  >
    <legend class="text-sm font-medium text-ink">
      {{ label ?? 'Image' }}
    </legend>

    <div class="flex items-start gap-3">
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
        <EditorTextField
          :id="srcId"
          label="Image path"
          label-hidden
          :problem-label="`${label ?? 'Image'}: path`"
          :required="requireSrc"
          :model-value="src"
          placeholder="/blocks/sample.jpg"
          mono
          @commit="src = $event || null"
        />
      </div>
    </div>

    <p
      v-if="error"
      class="text-xs text-pop"
      role="alert"
    >
      {{ error }}
    </p>

    <EditorTextField
      v-if="requireAlt"
      :id="altId"
      label="Alt text"
      required
      required-mark
      :model-value="alt"
      @commit="alt = $event"
    />
  </fieldset>
</template>
