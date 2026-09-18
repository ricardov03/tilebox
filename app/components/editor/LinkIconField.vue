<!--
  Icon of a link block (WP10a, simplified in WP17). Without your own icon the
  tile picks one by itself: the brand icon of the URL (`mailto:` gives the
  envelope, `tel:` the phone), else the website's icon (a local file), else the
  default link icon. This field shows THAT icon and the search box, nothing
  else: no icon name on screen, no extra step before you can search.
  The automatic icon follows the URL field live, so a new tile with
  `mailto:you@example.com` shows the envelope at once, here and on the tile.
  "Back to auto" lives in the picker and shows only while your own icon is set.
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

/** The icon the tile would show WITHOUT an own icon: `block.icon` is left out on purpose. */
const auto = computed(() => resolveLinkIcon({ url: props.block.url, favicon: props.block.favicon }))
</script>

<template>
  <div
    data-link-icon
    class="flex flex-col gap-2"
  >
    <EditorIconPicker
      :id="id"
      label="Icon"
      :model-value="block.icon"
      :auto="auto"
      @update:model-value="emit('update:icon', $event)"
    />
  </div>
</template>
