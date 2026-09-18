/**
 * "Somebody real is here" (WP17, the email spam shield).
 *
 * ONE set of listeners for the whole page, each one `{ once: true, passive: true }`,
 * so nothing stays attached and nothing costs a frame. The first pointer move,
 * pointer down, touch, key, scroll or focus flips the flag for every component
 * that waits for it (`ProtectedEmail.vue`).
 *
 * The flag starts `false` on the server AND on the first client render, so the
 * prerendered HTML and the hydrated DOM are the same. A harvester that only
 * reads the HTML, or runs a browser without touching the page, never sees the
 * flag turn.
 */
const SIGNALS = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'scroll', 'focusin'] as const

/** Module state on purpose: one flag and one set of listeners per page. Never set on the server. */
const signalled = ref(false)
let armed = false

function arm(): void {
  if (armed) return
  armed = true
  const fire = () => {
    signalled.value = true
    for (const type of SIGNALS) window.removeEventListener(type, fire)
  }
  for (const type of SIGNALS) window.addEventListener(type, fire, { once: true, passive: true })
}

export function useHumanSignal(): Readonly<Ref<boolean>> {
  // After mount, never during setup: a scroll or a focus in the middle of hydration would
  // flip the flag between the server render and the first client render (a hydration mismatch).
  if (import.meta.client) onMounted(arm)
  return readonly(signalled)
}
