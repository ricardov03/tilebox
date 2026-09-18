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

  The look is a scoped style block, not utility classes: Tailwind writes every
  utility it finds in `app/` into the ONE stylesheet that the public page
  inlines, and the public page never shows this button. Tokens only, as ever.
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
    :class="{ backed }"
    class="trigger"
  >
    <span
      data-delete-visual
      aria-hidden="true"
      :title="name"
      class="box"
    >
      <Icon
        :name="UI_ICONS.trash"
        class="glyph"
        :aria-hidden="true"
      />
    </span>
  </button>
</template>

<style scoped>
.trigger {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}

/* The ring is drawn around the box you see, not around the hit area. Kept for forced colors. */
.trigger:focus-visible {
  outline: 2px solid transparent;
  outline-offset: 2px;
}

.trigger.backed::before {
  content: "";
  position: absolute;
  inset: 6px;
  z-index: -1;
  border-radius: 8px;
  background: color-mix(in oklab, var(--color-tile) 90%, transparent);
}

.box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-danger);
  border-radius: 8px;
  background: transparent;
  color: var(--color-danger);
  transition: background-color 150ms;
}

.trigger:hover .box,
.trigger:focus-visible .box {
  background: color-mix(in oklab, var(--color-danger) 12%, transparent);
}

.trigger:focus-visible .box {
  outline: 2px solid var(--color-danger);
  outline-offset: 2px;
}

.glyph {
  width: 18px;
  height: 18px;
}

@media (hover: none) {
  .box {
    width: 40px;
    height: 40px;
  }

  .trigger.backed::before {
    inset: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .box {
    transition: none;
  }
}
</style>
