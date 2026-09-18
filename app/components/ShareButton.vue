<!--
  Share button of the profile tile (WP11). Browser APIs only: no network call,
  no third-party script.
  - `navigator.share({ title, url })` when the browser has it (phones).
  - Else the address goes to the clipboard and "Link copied" shows for 2 s.
  The message sits in an `aria-live="polite"` region that is always in the DOM,
  so a screen reader hears it. A real <button>, 44 px target.
  The markup is the same on the server and on the client (the APIs are read on
  click), so there is no hydration mismatch and no ClientOnly.
-->
<script setup lang="ts">
import { UI_ICONS } from '~/utils/networks'

/** How long "Link copied" stays. */
const MESSAGE_MS = 2000

const message = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

function say(text: string) {
  clearTimeout(timer)
  message.value = text
  timer = setTimeout(() => {
    message.value = ''
  }, MESSAGE_MS)
}
onBeforeUnmount(() => clearTimeout(timer))

async function copy(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    say('Link copied')
  }
  catch {
    say('Could not copy the link')
  }
}

async function share() {
  const url = window.location.href
  if (typeof navigator.share !== 'function') return copy(url)
  try {
    await navigator.share({ title: document.title, url })
  }
  catch (error) {
    // The visitor closed the share sheet: nothing to do. Any other failure: copy the link.
    if (!(error instanceof DOMException && error.name === 'AbortError')) await copy(url)
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <span
      aria-live="polite"
      data-share-status
      :class="message ? 'opacity-100' : 'opacity-0'"
      class="pointer-events-none rounded-full border border-line bg-ground px-3 py-1 text-xs font-medium text-ink transition-opacity duration-150 motion-reduce:transition-none"
    >{{ message }}</span>
    <button
      type="button"
      aria-label="Share this page"
      data-share-button
      class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-tile text-ink transition-colors duration-150 hover:text-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      @click="share"
    >
      <Icon
        :name="message === 'Link copied' ? UI_ICONS.copied : UI_ICONS.share"
        class="size-[22px]"
        :aria-hidden="true"
      />
    </button>
  </div>
</template>
