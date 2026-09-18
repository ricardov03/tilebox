<!--
  Base chrome for every tile. PLAN.md 5.6.
  Renders an <a> when `href` is an http(s), mailto: or tel: URL, else a <div>.
  Fills the grid cell. http(s) links open in a new tab. mailto: stays.
  With `download` (WP11, the contact tile) a LOCAL path like `/site/contact.vcf` is a link too.
  With `mail` (WP17) the whole tile is a `ProtectedEmail` control instead: the built
  file holds a <button> and no address, and a person on the page turns it into a
  real `mailto:` link. `mail` wins over `href`: a mail tile has no URL at all.
-->
<script setup lang="ts">
import type { MailToken } from '~/utils/mail-shield'
import ProtectedEmail from '../ProtectedEmail.vue'
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
  /** Extra link relation, for example `me` on social tiles. Added to `noopener noreferrer` on external links. */
  rel?: string
  /** File name for a download link to a local file of this site. Only then a local `href` becomes a link. */
  download?: string
  /** The mail shield token of a `mailto:` tile (WP17). It replaces `href`. */
  mail?: MailToken
}>(), {
  href: undefined,
  variant: 'tile',
  ariaLabel: undefined,
  padded: true,
  clip: false,
  rel: undefined,
  download: undefined,
  mail: undefined,
})

/** A path of this site: one leading slash, never `//host`. */
const isLocalPath = (href: string) => /^\/(?!\/)/.test(href)

/** Only http(s), mailto: and tel: become links, plus a local file with `download`. Anything else renders as a plain tile. */
const link = computed(() => {
  const href = props.href
  if (href === undefined) return null
  return isSafeHref(href) || (props.download !== undefined && isLocalPath(href)) ? href : null
})
const external = computed(() => link.value !== null && isHttpUrl(link.value))
/** A tile the visitor can activate: a link, or a mail control (WP17). It gets the hover lift. */
const interactive = computed(() => link.value !== null || props.mail !== undefined)
const relValue = computed(() => [props.rel, external.value ? 'noopener noreferrer' : ''].filter(Boolean).join(' ') || undefined)

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
  interactive.value ? 'md:hover:-translate-y-0.5 motion-reduce:hover:translate-y-0' : '',
  interactive.value && props.variant === 'tile' ? 'md:hover:text-hover' : '',
])
</script>

<template>
  <!-- A mail tile: no `href` in the built file, so no harvester finds an address on this page. -->
  <ProtectedEmail
    v-if="mail"
    :token="mail"
    :aria-label="ariaLabel"
    :class="[...classes, 'text-left']"
  >
    <slot />
  </ProtectedEmail>
  <a
    v-else-if="link"
    :href="link"
    :target="external ? '_blank' : undefined"
    :rel="relValue"
    :download="download"
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
