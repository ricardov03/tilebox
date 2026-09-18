<!--
  The one delete trigger of the editor: a small outlined trash button, in red.
  Used by the list row, the preview tile and the block form, so all three look
  the same. It only asks: the parent opens the inline confirm (DeleteConfirm).

  Two boxes. The <button> is the 44x44 hit area and has no paint of its own.
  The inner span is what you see: 32x32 (40x40 without hover, on touch), a 1px
  `danger` border, a transparent background, the 18px `line-md:trash` icon in
  `danger`. Hover and keyboard focus fill it with `danger` at 12% (a color-mix
  of the token) and the focus ring is `danger` with a 2px offset.

  The name comes from `aria-label` on the button. The tooltip (`title`) is on
  the inner span, which is `aria-hidden`: a mouse user gets the tooltip and a
  screen reader never reads the same words twice.

  `backed` puts a `tile` plate behind the 32px box, for a tile that can hold a
  photo. The box itself stays transparent.
-->
<script setup lang="ts">
const props = defineProps<{
  /** The block's short name: the control is named "Delete <label>". */
  label: string
  /** A `tile` plate behind the box (the preview tile: it may sit on a photo). */
  backed?: boolean
}>()

const button = useTemplateRef<HTMLButtonElement>('button')
const name = computed(() => `Delete ${props.label}`)

defineExpose({ focus: () => button.value?.focus() })
</script>

<template>
  <button
    ref="button"
    type="button"
    data-delete-trigger
    :aria-label="name"
    :class="backed ? 'before:absolute before:inset-1.5 before:-z-10 before:rounded-lg before:bg-tile/90 [@media(hover:none)]:before:inset-0.5' : ''"
    class="group/del relative isolate flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg focus-visible:outline-hidden"
  >
    <span
      data-delete-visual
      aria-hidden="true"
      :title="name"
      class="flex size-8 items-center justify-center rounded-lg border border-danger bg-transparent text-danger transition-colors group-hover/del:bg-danger/12 group-focus-visible/del:bg-danger/12 group-focus-visible/del:outline-2 group-focus-visible/del:outline-offset-2 group-focus-visible/del:outline-danger motion-reduce:transition-none [@media(hover:none)]:size-10"
    >
      <Icon
        :name="UI_ICONS.trash"
        class="size-[18px]"
        :aria-hidden="true"
      />
    </span>
  </button>
</template>
