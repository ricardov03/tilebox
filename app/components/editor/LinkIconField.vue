<!--
  Icon of a link block (WP10a). Without your own icon the tile picks one by
  itself: the brand icon from the URL, else the website's icon (a local file),
  else the default link icon. This field shows that icon with an "auto" label.
  "Choose another" opens the icon picker. "Back to auto" removes your icon.
-->
<script setup lang="ts">
import type { LinkBlock } from '~~/types/profile'
import { resolveLinkIcon } from '~/components/blocks/media'

const props = defineProps<{
  block: LinkBlock
  id: string
}>()

const emit = defineEmits<{
  'update:icon': [icon: string | undefined]
}>()

/** The picker is open although no icon is set yet. */
const choosing = ref(false)
watch(() => props.block.id, () => {
  choosing.value = false
})

const icon = computed(() => resolveLinkIcon(props.block))
const manual = computed(() => props.block.icon !== undefined)

const AUTO_LABELS = {
  brand: 'brand icon from the URL',
  fallback: 'default link icon',
  favicon: 'icon of the website',
} as const

const autoLabel = computed(() => {
  if (icon.value.kind === 'favicon') return AUTO_LABELS.favicon
  return icon.value.source === 'brand' ? AUTO_LABELS.brand : AUTO_LABELS.fallback
})

function backToAuto() {
  choosing.value = false
  emit('update:icon', undefined)
}

const smallButton = `min-h-9 rounded-full border border-line px-3 text-xs font-medium text-ink hover:border-accent ${FOCUS_RING}`
</script>

<template>
  <div
    data-link-icon
    class="flex flex-col gap-2"
  >
    <div
      v-if="!manual"
      class="flex flex-col gap-2"
    >
      <span class="text-sm font-medium text-ink">Icon</span>
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-ground text-ink"
          aria-hidden="true"
        >
          <Icon
            v-if="icon.kind === 'icon'"
            :name="icon.name"
            class="size-6"
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
        <span class="min-w-0 flex-1 text-xs text-muted">
          <span
            data-icon-auto
            class="mr-1 rounded-full bg-accent-soft/40 px-2 py-0.5 font-mono text-ink"
          >auto</span>
          {{ autoLabel }}
          <span
            v-if="icon.kind === 'icon'"
            class="font-mono"
          >· {{ icon.name }}</span>
        </span>
        <button
          v-if="!choosing"
          type="button"
          :class="smallButton"
          @click="choosing = true"
        >
          Choose another
        </button>
      </div>
    </div>

    <template v-if="manual || choosing">
      <EditorIconPicker
        :id="id"
        :label="manual ? 'Icon' : 'Choose an icon'"
        :model-value="block.icon"
        @update:model-value="emit('update:icon', $event)"
      />
      <button
        type="button"
        :class="smallButton"
        class="self-start"
        @click="backToAuto"
      >
        Back to auto
      </button>
    </template>
  </div>
</template>
