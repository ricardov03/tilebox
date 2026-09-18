<!--
  Site tab (WP11): the share button of the profile tile. `site.share` absent = on.
  Off writes `share: false`; on removes the key again.
-->
<script setup lang="ts">
const { site, setSiteKey } = useSiteDraft()

function onChange(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) setSiteKey('share', target.checked ? undefined : false)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label
      for="s-share"
      class="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink"
    >
      <input
        id="s-share"
        type="checkbox"
        :checked="site.share !== false"
        aria-describedby="s-share-help"
        :class="FOCUS_RING"
        class="size-5 accent-[var(--color-accent)]"
        @change="onChange"
      >
      Show a share button on my profile tile
    </label>
    <p
      id="s-share-help"
      class="text-xs text-muted"
    >
      It opens the share sheet of the phone. On other browsers it copies the link. No tracking, no network call.
    </p>
  </div>
</template>
