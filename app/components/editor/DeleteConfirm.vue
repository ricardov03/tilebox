<!--
  The one inline delete confirm: "Delete? [Yes] [No]". Used by the list row,
  the preview tile and the block form. Never window.confirm.
  Focus moves to "No" when it opens. Escape or "No" cancels. The parent puts
  the focus back on its delete button after a cancel.
  "Yes" is a small FILLED danger button (`danger` background, `danger-ink`
  text). "No" is neutral. Same two boxes as EditorDeleteButton: the <button> is
  the 44px hit area, the inner span is the 32px pill you see.
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

const buttonClass = 'group/confirm flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center focus-visible:outline-hidden'
const pillClass = 'flex h-8 min-w-11 items-center justify-center rounded-lg px-3 text-sm font-medium group-focus-visible/confirm:outline-2 group-focus-visible/confirm:outline-offset-2 [@media(hover:none)]:h-10'
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
      data-delete-yes
      :aria-label="`Yes, delete ${label}`"
      :class="buttonClass"
      @click.stop="emit('confirm')"
    >
      <span
        :class="pillClass"
        class="bg-danger text-danger-ink group-hover/confirm:opacity-90 group-focus-visible/confirm:outline-danger"
      >Yes</span>
    </button>
    <button
      ref="noButton"
      type="button"
      data-delete-no
      :aria-label="`No, keep ${label}`"
      :class="buttonClass"
      @click.stop="emit('cancel')"
    >
      <span
        :class="pillClass"
        class="border border-line bg-tile text-ink group-hover/confirm:border-accent group-focus-visible/confirm:outline-accent"
      >No</span>
    </button>
  </div>
</template>
