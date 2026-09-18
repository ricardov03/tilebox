<!--
  "Check links" of the Blocks tab (WP11). ONE include in BlockList.vue.
  Sends the draft to the dev-only route `POST /api/links/check` (the guarded
  request of the link previews). The result is in memory only: the badges on
  the list rows (BlockRowBadges.vue) read the same state.
-->
<script setup lang="ts">
const draft = useEditorDraft()
const { state, counts, run } = useLinkCheck()

function check() {
  if (draft.value) void run(draft.value)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <button
      type="button"
      data-check-links
      :disabled="state.busy"
      :aria-busy="state.busy"
      :class="FOCUS_RING"
      class="min-h-11 w-full rounded-full border border-line px-4 text-sm font-medium text-ink hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
      @click="check"
    >
      {{ state.busy ? 'Checking links...' : 'Check links' }}
    </button>
    <p
      class="text-xs text-muted"
      aria-live="polite"
      data-check-links-summary
    >
      <template v-if="state.error">
        <span class="text-pop">{{ state.error }}</span>
      </template>
      <template v-else-if="state.checkedAt">
        {{ counts.total }} links at {{ state.checkedAt }}: {{ counts.ok }} ok, {{ counts.blocked }} blocked, {{ counts.broken }} broken. "Blocked" = the site blocks checks, the link is probably fine. Not saved.
      </template>
      <template v-else>
        Asks every link once, from this computer. It only warns.
      </template>
    </p>
  </div>
</template>
