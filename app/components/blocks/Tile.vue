<!--
  Base chrome for every tile. PLAN.md 5.6.
  Renders an <a> when `href` is an http(s) or mailto: URL, else a <div>.
  Fills the grid cell. http(s) links open in a new tab. mailto: stays.
-->
<script setup lang="ts">
import { isHttpUrl, isSafeHref, type TileVariant } from './media'

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

/** Only http(s) and mailto: become links. Anything else renders as a plain tile. */
const link = computed(() => (props.href !== undefined && isSafeHref(props.href) ? props.href : null))
const external = computed(() => link.value !== null && isHttpUrl(link.value))

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
  link.value ? 'md:hover:-translate-y-0.5 motion-reduce:hover:translate-y-0' : '',
  link.value && props.variant === 'tile' ? 'md:hover:text-hover' : '',
])
</script>

<template>
  <a
    v-if="link"
    :href="link"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
    :aria-label="ariaLabel"
    :class="classes"
  >
    <slot />
  </a>
  <div
    v-else
    :role="ariaLabel ? 'group' : undefined"
    :aria-label="ariaLabel"
    :class="classes"
  >
    <slot />
  </div>
</template>
