<!--
  Image field. A file input uploads through /api/upload (dev only) and
  sets `src`. Shows a preview. `alt` is required by the schema for image
  blocks; pass `require-alt` to show that field.
-->
<script setup lang="ts">
const src = defineModel<string | null | undefined>('src')
const alt = defineModel<string | undefined>('alt')

const props = defineProps<{
  id: string
  label?: string
  requireAlt?: boolean
}>()

const uploading = ref(false)
const error = ref<string | null>(null)

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
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
    const data = (err as { data?: { statusMessage?: string, message?: string } }).data
    error.value = data?.statusMessage ?? data?.message ?? (err instanceof Error ? err.message : 'Upload failed')
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
  <fieldset class="flex flex-col gap-2 border-0 p-0">
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
          class="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-ground px-3 text-sm font-medium text-ink hover:border-accent"
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
          placeholder="/blocks/photo.jpg"
          class="min-h-11 rounded-xl border border-line bg-ground px-3 font-mono text-sm text-ink"
          @input="src = ($event.target as HTMLInputElement).value || null"
        >
      </div>
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
        class="min-h-11 rounded-xl border border-line bg-ground px-3 text-sm text-ink"
        @input="alt = ($event.target as HTMLInputElement).value"
      >
    </template>
  </fieldset>
</template>
