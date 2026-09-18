<script setup lang="ts">
import { ENDS_AT_SCRIPT } from '~/utils/schedule'

const { profile } = useProfile()

// Title, description, canonical, Open Graph, favicon links and JSON-LD (WP10b).
useSiteHead()

// WP11 schedule: a tile with an end date carries `data-ends-at`. This tiny inline script (no network)
// hides it when the time has passed, at load and every 60 s. Only on a page that has such a tile.
// With JavaScript off the tile stays visible until the next publish removes it.
if (profile.blocks.some(block => block.endsAt)) {
  useHead({ script: [{ key: 'tilebox-ends-at', innerHTML: ENDS_AT_SCRIPT, tagPosition: 'bodyClose' }] })
}
</script>

<template>
  <BentoGrid
    :blocks="profile.blocks"
    :layout="profile.layout"
    :profile="profile.profile"
    :share="profile.site?.share !== false"
  />
</template>
