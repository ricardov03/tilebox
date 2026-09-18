<!--
  "Save my contact" tile (WP11). A download link to the vCard the BUILD wrote:
  `/site/contact.vcf`, a local file of this site. No network call, no script.
  The build drops this block when the file does not exist, so the link never 404s.
  The `download` name comes from the public profile (`contact.fileName`).
  No aria-label: the visible text is the accessible name.
-->
<script setup lang="ts">
import type { ContactBlock } from '~~/types/profile'
import { UI_ICONS } from '~/utils/networks'
import { sizeToSpan } from '~/utils/sizes'
import Tile from './Tile.vue'

const props = defineProps<{ block: ContactBlock }>()

/** The one path the build writes (content/site-files.ts `SITE_EXTRA_FILES.contactCard`). */
const CONTACT_CARD_PATH = '/site/contact.vcf'

const { profile } = useProfile()
const fileName = computed(() => profile.contact?.fileName ?? 'contact.vcf')
const wide = computed(() => sizeToSpan(props.block.size).cols === 2)
</script>

<template>
  <Tile
    :href="CONTACT_CARD_PATH"
    :download="fileName"
    data-contact-tile
  >
    <div class="flex items-start justify-between gap-3">
      <Icon
        :name="block.icon ?? UI_ICONS.contact"
        class="size-9 shrink-0 text-accent md:size-11"
      />
      <Icon
        :name="UI_ICONS.download"
        class="size-[22px] shrink-0 md:size-6"
      />
    </div>
    <div class="flex min-w-0 flex-col gap-1 md:gap-1.5">
      <span
        class="font-display font-semibold"
        :class="wide ? 'text-[26px] leading-[1.05] md:text-[34px]' : 'text-base leading-[1.3] md:text-lg'"
      >{{ block.title ?? 'Save my contact' }}</span>
      <span
        v-if="block.description"
        class="line-clamp-2 text-sm leading-[1.4] text-muted md:text-base"
      >{{ block.description }}</span>
    </div>
  </Tile>
</template>
