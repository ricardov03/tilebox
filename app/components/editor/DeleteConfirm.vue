<!--
  The one inline delete confirm: "Delete? [Yes] [No]". Used by the list row,
  the preview tile and the block form. Never window.confirm.
  Focus moves to "No" when it opens. Escape or "No" cancels. The parent puts
  the focus back on its delete button after a cancel.
-->
<script setup lang="ts">
defineProps<{
  /** The block's short name, for the accessible names. */
  label: string
  /** Narrow places (a 1x1 tile): the question on its own line, the two buttons under it. */
  stacked?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const noButton = useTemplateRef<HTMLButtonElement>('noButton')

onMounted(() => noButton.value?.focus())

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('cancel')
}

const buttonClass = `min-h-11 min-w-11 shrink-0 rounded-full px-3 text-sm font-medium ${FOCUS_RING}`
</script>

<template>
  <div
    role="group"
    :aria-label="`Delete ${label}?`"
    data-delete-confirm
    :class="stacked ? 'flex-wrap justify-center' : ''"
    class="flex items-center gap-1"
    @keydown="onKeydown"
  >
    <span
      :class="stacked ? 'basis-full pt-1 text-center' : ''"
      class="px-1 text-sm text-ink"
    >Delete?</span>
    <button
      type="button"
      :aria-label="`Yes, delete ${label}`"
      :class="buttonClass"
      class="bg-pop text-pop-ink hover:opacity-90"
      @click.stop="emit('confirm')"
    >
      Yes
    </button>
    <button
      ref="noButton"
      type="button"
      :aria-label="`No, keep ${label}`"
      :class="buttonClass"
      class="border border-line bg-tile text-ink hover:border-accent"
      @click.stop="emit('cancel')"
    >
      No
    </button>
  </div>
</template>
