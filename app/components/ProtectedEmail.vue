<!--
  One email control of the public page (WP17, the email spam shield).

  What ships in `dist/`: a real `<button type="button">`. No `href`, no address
  in any attribute, and the visible text is either the tile title (the default
  slot) or the human form of the address ("hello at example dot com"). So a
  harvester that reads the HTML, or runs a browser and never touches the page,
  finds nothing to collect. A visitor with JavaScript off still reads the
  human form and can type it.

  What happens in the browser: after the first HUMAN SIGNAL on the page
  (`useHumanSignal`), the token is decoded IN MEMORY and this control becomes
  `<a href="mailto:...">`. The profile line then shows the real address; a tile
  keeps its title. The accessible name never changes (`aria-label`), and the
  focus moves to the new element, so a keyboard user notices nothing.

  Enter and Space work before and after the swap. Before it they are handled
  here (`.prevent`), because the swap happens on the same key press and the
  browser's own click would land on an element that is already gone.
-->
<script setup lang="ts">
import { decodeEmail, humanEmail, mailHref, type MailToken } from '~/utils/mail-shield'

const props = defineProps<{
  token: MailToken
  /** A stable accessible name, for a control whose visible text changes ("Email Ada Lovelace"). */
  ariaLabel?: string
}>()

const signalled = useHumanSignal()
const el = useTemplateRef<HTMLElement>('el')

/** `null` while nothing has happened yet, and for a token that does not decode. */
const href = computed(() => {
  if (!signalled.value) return null
  try {
    return mailHref(props.token)
  }
  catch {
    return null
  }
})

const human = computed(() => {
  try {
    return humanEmail(props.token)
  }
  catch {
    return ''
  }
})

/** The human form before the signal, the real address after it. The profile line shows it; a tile ignores it. */
const text = computed(() => {
  if (!signalled.value) return human.value
  try {
    return decodeEmail(props.token)
  }
  catch {
    return human.value
  }
})

/** The focus must survive the swap from <button> to <a>: they are two different elements. */
watch(href, async (next) => {
  const hadFocus = document.activeElement === el.value
  await nextTick()
  if (next !== null && hadFocus) el.value?.focus()
})

/**
 * Open the mail client. Used for a key press, and for a click that arrives before the swap.
 * `window.open(..., '_self')` is the same as setting the address of this window, and it is one
 * function a test can watch (the members of `location` cannot be replaced).
 */
function go(): void {
  try {
    window.open(mailHref(props.token), '_self')
  }
  catch {
    // A token that does not decode: nothing to open, and nothing to tell the visitor.
  }
}
</script>

<template>
  <a
    v-if="href"
    ref="el"
    data-protected-email="link"
    :href="href"
    :aria-label="ariaLabel"
    @keydown.space.prevent="go"
  >
    <slot :text="text">{{ text }}</slot>
  </a>
  <button
    v-else
    ref="el"
    data-protected-email="button"
    type="button"
    :aria-label="ariaLabel"
    @click="go"
    @keydown.enter.prevent="go"
    @keydown.space.prevent="go"
  >
    <slot :text="text">
      {{ text }}
    </slot>
  </button>
</template>
