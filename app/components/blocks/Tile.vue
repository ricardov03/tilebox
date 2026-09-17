<!--
  Base chrome for every tile. PLAN.md 5.6.
  Renders an <a> when `href` is set, else a <div>. Fills the grid cell.
  http(s) links open in a new tab. mailto: links stay in the same tab.
-->
<script setup lang="ts">
import { isHttpUrl, type TileVariant } from './media'

const props = withDefaults(defineProps<{
  href?: string
  variant?: TileVariant
  /** Accessible name for the whole tile. Use when the visible text is not enough. */
  ariaLabel?: string
  /** `false` removes the inner padding (image and video tiles). */
  padded?: boolean
  /** Clip children to the rounded corners. */
  clip?: boolean
}>(), {
  href: undefined,
  variant: 'tile',
  ariaLabel: undefined,
  padded: true,
  clip: false,
})

const external = computed(() => props.href !== undefined && isHttpUrl(props.href))

const VARIANT_CLASSES: Record<TileVariant, string> = {
  tile: 'border border-line bg-tile text-ink',
  accent: 'bg-accent text-accent-ink',
  pop: 'bg-pop text-pop-ink',
}

const classes = computed(() => [
  'relative flex h-full w-full flex-col justify-between rounded-tile',
  'transition-transform duration-150 motion-reduce:transition-none',
  VARIANT_CLASSES[props.variant],
  props.padded ? 'p-5 md:p-7' : 'p-0',
  props.clip ? 'overflow-hidden' : '',
  props.href ? 'md:hover:-translate-y-0.5 motion-reduce:hover:translate-y-0' : '',
  props.href && props.variant === 'tile' ? 'md:hover:text-hover' : '',
])
</script>

<template>
  <a
    v-if="href"
    :href="href"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener' : undefined"
    :aria-label="ariaLabel"
    :class="classes"
  >
    <slot />
  </a>
  <div
    v-else
    :aria-label="ariaLabel"
    :class="classes"
  >
    <slot />
  </div>
</template>
