<!--
  Local editor. Dev only: the routes it uses 404 outside `nuxt dev`, and
  nuxt.config.ts keeps /edit out of the prerendered output.
  Left: live preview (the real tiles, drag to reorder). Right: Profile | Blocks | Theme.
  The theme mode lives in the Theme tab only. Outside `nuxt dev` the routes
  do not exist, so the page renders one short message and nothing else.
  Bottom: Save (Cmd/Ctrl+S), dirty state, last save, restart notice,
  "Block deleted. Undo" for 8 seconds.
  Delete or Backspace (focus outside a field) opens the delete confirm of the selected block.
-->
<script setup lang="ts">
import type { DeleteSource, EditorTab } from '~/composables/useEditor'
import { ProfileInfoSchema, toPublicProfileInfo } from '~~/types/profile'

definePageMeta({ layout: false })

const isDev = import.meta.dev

const editor = useEditor()
const {
  draft,
  loading,
  loadError,
  saving,
  errors,
  lastSavedAt,
  restartNeeded,
  dirty,
  tab,
  layoutKey,
  selectedId,
  orderedBlocks,
  selectedBlock,
  deleteTarget,
  notice,
  canUndo,
} = editor

useHead({ title: computed(() => (draft.value ? `Edit · ${draft.value.profile.name}` : 'Edit')) })

const tabs: { id: EditorTab, label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'theme', label: 'Theme' },
]
const tabButtons = useTemplateRef<HTMLButtonElement[]>('tabButtons')

/** WAI-ARIA tabs: arrows, Home and End move between tabs and select them. */
function onTablistKeydown(event: KeyboardEvent) {
  const index = tabs.findIndex(t => t.id === tab.value)
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabs.length - 1
  else return
  event.preventDefault()
  const target = tabs[next]
  if (!target) return
  tab.value = target.id
  tabButtons.value?.[next]?.focus()
}

/** Preview theme attrs. `system` follows the OS via matchMedia. */
const systemDark = ref(false)
let media: MediaQueryList | undefined
function onMedia(e: MediaQueryListEvent) {
  systemDark.value = e.matches
}

const previewTheme = computed(() => {
  const mode = draft.value?.profile.theme.mode ?? 'light'
  if (mode === 'system') return systemDark.value ? 'dark' : 'light'
  return mode
})

/** Delete and Backspace keep their normal job while the focus is in a field. */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void editor.save()
    return
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (event.key === 'Escape' && deleteTarget.value) {
    // The focus is outside the confirm (inside it, the confirm handles Escape itself).
    editor.cancelDelete()
    return
  }
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  if (!selectedId.value || deleteTarget.value || isTyping(event.target)) return
  // Opens the confirm on the tile. It never deletes directly.
  event.preventDefault()
  editor.requestDelete(selectedId.value, 'tile')
}

/** The confirm id for one place, so only that place shows it. */
function confirmingIn(where: DeleteSource): string | null {
  return deleteTarget.value?.where === where ? deleteTarget.value.id : null
}

function focusFirst(selectors: string[]) {
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector)
    if (el && el.offsetParent !== null) {
      el.focus()
      return
    }
  }
}

const editControl = (id: string) => `li[data-id="${CSS.escape(id)}"] button[data-editor-control][aria-pressed]`
const listRow = (id: string) => `[data-select-block="${CSS.escape(id)}"]`

/**
 * "Yes" in any of the three confirms. After the delete the focus goes to the
 * next block (the last one when the deleted block was last): its list row, or
 * its tile when the delete came from the preview. No blocks left: Add block.
 */
async function confirmDelete(id: string) {
  const where = deleteTarget.value?.where ?? 'list'
  const index = orderedBlocks.value.findIndex(b => b.id === id)
  editor.deleteBlock(id)
  await nextTick()
  const next = orderedBlocks.value[Math.min(Math.max(index, 0), orderedBlocks.value.length - 1)]
  if (!next) return focusFirst(['[data-add-block]'])
  focusFirst(where === 'tile' ? [editControl(next.id), listRow(next.id)] : [listRow(next.id), editControl(next.id)])
}

/** Undo removes its own button, so the focus moves to the block that came back. */
async function undoDelete() {
  const id = editor.undoDelete()
  if (!id) return
  await nextTick()
  focusFirst([listRow(id), editControl(id)])
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}

/**
 * Capture-phase click handler for the preview. The tiles are the real
 * block components, so they contain links and buttons. A click on a tile
 * selects its block. Anything that is not an editor control (Edit, grip)
 * is stopped, so links never navigate and the video never starts.
 */
function onPreviewClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('[data-editor-control]')) return
  const tile = target.closest('li[data-id]')
  if (tile instanceof HTMLElement && tile.dataset.id) editor.select(tile.dataset.id)
  else if (target.closest('li[data-profile]')) tab.value = 'profile'
  if (target.closest('a[href], button')) {
    event.preventDefault()
    event.stopPropagation()
  }
}

onMounted(() => {
  media = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = media.matches
  media.addEventListener('change', onMedia)
  // Outside `nuxt dev` the page shows one message. Nothing fetches, no
  // save shortcut, no unload guard.
  if (!isDev) return
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
  void editor.load()
  void loadGravatarState()
})

onBeforeUnmount(() => {
  media?.removeEventListener('change', onMedia)
  if (!isDev) return
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

const savedLabel = computed(() => {
  if (!lastSavedAt.value) return null
  return lastSavedAt.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
})

const inputClass = INPUT_CLASS
const labelClass = LABEL_CLASS
const buttonClass = `min-h-11 rounded-full text-sm font-medium ${FOCUS_RING}`

function setProfile(key: 'name' | 'handle' | 'bio' | 'status', event: Event) {
  const control = formControl(event)
  if (!control || !draft.value) return
  const value = control.value
  if (key === 'status' && value === '') {
    delete draft.value.profile.status
    return
  }
  draft.value.profile[key] = value
}

function setAvatar(value: string | null | undefined) {
  if (!draft.value) return
  draft.value.profile.avatar = value || null
}

/** The email field keeps what you type. The draft only gets a valid email, so a bad one is never saved. */
const emailInput = ref('')
const emailError = ref<string | null>(null)
watch(() => draft.value?.profile.email, (email) => {
  if (email !== undefined && !emailError.value) emailInput.value = email
}, { immediate: true })

function setEmail(event: Event) {
  const control = formControl(event)
  if (!control || !draft.value) return
  emailInput.value = control.value
  const result = ProfileInfoSchema.shape.email.safeParse(control.value.trim())
  if (!result.success) {
    emailError.value = `email: ${result.error.issues[0]?.message ?? 'Invalid email'}`
    return
  }
  emailError.value = null
  draft.value.profile.email = result.data
}

function setShowEmail(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || !draft.value) return
  draft.value.profile.showEmail = target.checked
}

function setHighlights(value: string[]) {
  if (!draft.value) return
  draft.value.profile.highlights = value
}

/** Is public/avatar.gravatar.jpg on disk? `version` busts the image cache after a new download. */
const gravatar = ref({ exists: false, version: 0 })

async function loadGravatarState() {
  try {
    gravatar.value.exists = (await $fetch<{ exists: boolean }>('/api/avatar/gravatar')).exists
  }
  catch {
    gravatar.value.exists = false
  }
}

/** Every answer of the Gravatar route: the file may be new, the same, or gone. */
function onGravatarResolved(exists: boolean) {
  gravatar.value = { exists, version: Date.now() }
}

function onGravatarSaved() {
  setAvatar(null)
}

/** What the public page will get: same sanitizer as the build (no hidden email, resolved avatar). */
const previewProfile = computed(() => {
  if (!draft.value) return null
  const path = gravatar.value.exists ? `/avatar.gravatar.jpg?v=${gravatar.value.version}` : undefined
  return toPublicProfileInfo(draft.value.profile, path)
})
</script>

<template>
  <main
    v-if="!isDev"
    class="flex min-h-screen items-center justify-center bg-ground p-4 text-ink"
  >
    <p class="rounded-2xl border border-line bg-tile p-4 text-sm text-muted">
      The editor runs in development only. Start it with <code class="font-mono">npm run dev</code> and open <code class="font-mono">/edit</code>.
    </p>
  </main>

  <div
    v-else
    class="flex min-h-screen flex-col bg-ground text-ink"
  >
    <header class="flex min-h-14 items-center justify-between gap-4 border-b border-line bg-tile px-4">
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/"
          :class="FOCUS_RING"
          class="rounded-sm font-display text-lg font-semibold text-ink hover:text-hover"
        >tilebox</NuxtLink>
        <span class="font-mono text-xs text-muted">editor · dev only</span>
      </div>
      <EditorLayoutSwitch v-model="layoutKey" />
    </header>

    <!-- Loading covers the SSR pass and the first fetch, so no error shows before the file was read. -->
    <p
      v-if="loading || (!draft && !loadError)"
      class="m-4 text-sm text-muted"
      aria-live="polite"
    >
      Loading content/profile.json...
    </p>

    <p
      v-else-if="loadError || !draft"
      class="m-4 rounded-2xl border border-line bg-tile p-4 text-sm text-pop"
      role="alert"
    >
      Could not load the profile: {{ loadError }}
    </p>

    <div
      v-else-if="previewProfile"
      class="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]"
    >
      <!-- Preview. Theme attrs are scoped here so the editor chrome stays stable. -->
      <section
        aria-label="Preview"
        class="min-w-0 overflow-auto p-4 lg:p-8"
      >
        <div
          :data-colors="draft.profile.theme.colors"
          :data-fonts="draft.profile.theme.fonts"
          :data-theme="previewTheme"
          :class="layoutKey === 'mobile' ? 'mx-auto w-[390px] max-w-full p-4' : 'p-4 xl:p-10'"
          class="rounded-tile bg-ground text-ink transition-colors motion-reduce:transition-none"
          @click.capture="onPreviewClick"
        >
          <ClientOnly>
            <EditorBlockGridEditor
              :blocks="orderedBlocks"
              :columns="layoutKey === 'mobile' ? 2 : 4"
              :profile="previewProfile"
              :selected-id="selectedId"
              :confirming-id="confirmingIn('tile')"
              @reorder="editor.setOrder"
              @select="editor.select"
              @request-delete="editor.requestDelete($event, 'tile')"
              @confirm-delete="confirmDelete"
              @cancel-delete="editor.cancelDelete"
            />
            <template #fallback>
              <EditorPreviewGrid
                :blocks="orderedBlocks"
                :columns="layoutKey === 'mobile' ? 2 : 4"
                :profile="previewProfile"
                :selected-id="selectedId"
                :confirming-id="confirmingIn('tile')"
                @select="editor.select"
                @request-delete="editor.requestDelete($event, 'tile')"
                @confirm-delete="confirmDelete"
                @cancel-delete="editor.cancelDelete"
              />
            </template>
          </ClientOnly>
        </div>
      </section>

      <!-- Panel -->
      <aside
        aria-label="Editor panel"
        class="flex min-w-0 flex-col border-t border-line bg-tile lg:border-l lg:border-t-0"
      >
        <div
          role="tablist"
          aria-label="Editor sections"
          class="flex border-b border-line"
          @keydown="onTablistKeydown"
        >
          <button
            v-for="t in tabs"
            :id="`tab-${t.id}`"
            ref="tabButtons"
            :key="t.id"
            type="button"
            role="tab"
            :aria-selected="tab === t.id"
            :aria-controls="`panel-${t.id}`"
            :tabindex="tab === t.id ? 0 : -1"
            :class="[FOCUS_RING, tab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink']"
            class="min-h-12 flex-1 border-b-2 text-sm font-medium focus-visible:-outline-offset-2"
            @click="tab = t.id"
          >
            {{ t.label }}
          </button>
        </div>

        <div class="flex-1 overflow-auto p-4 pb-32">
          <!-- Profile -->
          <div
            v-show="tab === 'profile'"
            id="panel-profile"
            role="tabpanel"
            aria-labelledby="tab-profile"
            class="flex flex-col gap-4"
          >
            <div class="flex flex-col gap-1">
              <label
                for="p-name"
                :class="labelClass"
              >Name</label>
              <input
                id="p-name"
                :value="draft.profile.name"
                type="text"
                :class="inputClass"
                @input="setProfile('name', $event)"
              >
            </div>
            <div class="flex flex-col gap-1">
              <label
                for="p-handle"
                :class="labelClass"
              >Handle</label>
              <input
                id="p-handle"
                :value="draft.profile.handle"
                type="text"
                :class="inputClass"
                class="font-mono"
                @input="setProfile('handle', $event)"
              >
            </div>
            <div class="flex flex-col gap-1">
              <label
                for="p-bio"
                :class="labelClass"
              >Bio</label>
              <textarea
                id="p-bio"
                :value="draft.profile.bio"
                rows="4"
                :class="inputClass"
                class="py-2"
                @input="setProfile('bio', $event)"
              />
            </div>
            <EditorHighlightsField
              :model-value="draft.profile.highlights"
              @update:model-value="setHighlights"
            />
            <div class="flex flex-col gap-1">
              <label
                for="p-status"
                :class="labelClass"
              >Status</label>
              <input
                id="p-status"
                :value="draft.profile.status ?? ''"
                type="text"
                placeholder="Now building..."
                :class="inputClass"
                @input="setProfile('status', $event)"
              >
            </div>
            <div class="flex flex-col gap-1">
              <label
                for="p-email"
                :class="labelClass"
              >Email <span class="font-normal text-muted">(required)</span></label>
              <input
                id="p-email"
                :value="emailInput"
                type="email"
                required
                autocomplete="email"
                :aria-invalid="emailError ? 'true' : undefined"
                :aria-describedby="emailError ? 'p-email-error' : undefined"
                :class="inputClass"
                class="font-mono"
                @input="setEmail"
              >
              <p
                v-if="emailError"
                id="p-email-error"
                class="font-mono text-xs text-pop"
                role="alert"
              >
                {{ emailError }}
              </p>
            </div>
            <div class="flex flex-col gap-1">
              <label
                for="p-show-email"
                class="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink"
              >
                <input
                  id="p-show-email"
                  type="checkbox"
                  :checked="draft.profile.showEmail"
                  aria-describedby="p-show-email-help"
                  :class="FOCUS_RING"
                  class="size-5 accent-[var(--color-accent)]"
                  @change="setShowEmail"
                >
                Show my email on the page
              </label>
              <p
                id="p-show-email-help"
                class="text-xs text-muted"
              >
                Hidden: the email is removed from the published page and is only used to find your Gravatar picture.
              </p>
            </div>
            <EditorImagePicker
              id="p-avatar"
              label="Avatar"
              :src="draft.profile.avatar"
              @update:src="setAvatar"
            />
            <div class="flex flex-col gap-1">
              <EditorGravatarButton
                :email="draft.profile.email"
                @resolved="onGravatarResolved"
                @saved="onGravatarSaved"
              />
              <p class="text-xs text-muted">
                An uploaded avatar wins. Without one, the page uses your Gravatar, then your initials.
              </p>
            </div>
          </div>

          <!-- Blocks -->
          <div
            v-show="tab === 'blocks'"
            id="panel-blocks"
            role="tabpanel"
            aria-labelledby="tab-blocks"
            class="flex flex-col gap-6"
          >
            <div
              v-if="selectedBlock"
              class="flex flex-col gap-3 rounded-2xl border border-line bg-ground/60 p-3"
            >
              <button
                type="button"
                :class="buttonClass"
                class="self-start px-3 text-muted hover:text-ink"
                @click="editor.select(null)"
              >
                ← All blocks
              </button>
              <EditorBlockForm
                :block="selectedBlock"
                :confirming="confirmingIn('form') === selectedBlock.id"
                @update:block="editor.updateBlock"
                @request-delete="editor.requestDelete($event, 'form')"
                @delete="confirmDelete"
                @cancel-delete="editor.cancelDelete"
              />
            </div>
            <EditorBlockList
              v-else
              :blocks="orderedBlocks"
              :selected-id="selectedId"
              :confirming-id="confirmingIn('list')"
              @select="editor.select"
              @add="editor.addBlock"
              @move="editor.moveBlock"
              @request-delete="editor.requestDelete($event, 'list')"
              @confirm-delete="confirmDelete"
              @cancel-delete="editor.cancelDelete"
            />
            <p class="text-xs text-muted">
              Order shown: <strong class="font-medium text-ink">{{ layoutKey }}</strong>.
              Drag a tile by its grip in the preview, or use the arrows here.
              Remove a block with its trash button, or select it and press <kbd class="font-mono">Delete</kbd>.
            </p>
          </div>

          <!-- Theme -->
          <div
            v-show="tab === 'theme'"
            id="panel-theme"
            role="tabpanel"
            aria-labelledby="tab-theme"
          >
            <EditorThemePanel
              :model-value="draft.profile.theme"
              @update:model-value="editor.setTheme"
            />
          </div>
        </div>
      </aside>
    </div>

    <!-- Save bar -->
    <div
      v-if="draft"
      class="sticky bottom-0 z-10 border-t border-line bg-tile px-4 py-3"
    >
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          :disabled="!dirty || saving"
          :class="buttonClass"
          class="bg-accent px-5 text-accent-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          @click="editor.save()"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
        <span
          class="flex items-center gap-2 text-sm"
          aria-live="polite"
        >
          <span
            :class="dirty ? 'bg-pop' : 'bg-dot'"
            class="size-2.5 rounded-full"
            aria-hidden="true"
          />
          <span class="text-muted">{{ dirty ? 'Unsaved changes' : 'Saved' }}</span>
          <span
            v-if="savedLabel"
            class="font-mono text-xs text-muted"
          >last save {{ savedLabel }}</span>
        </span>
        <!-- The live region is always in the DOM, so the delete and the undo are announced. Undo sits outside it. -->
        <span class="flex items-center gap-2 text-sm text-ink">
          <span
            data-delete-notice
            aria-live="polite"
          >{{ notice }}</span>
          <button
            v-if="canUndo"
            type="button"
            :class="buttonClass"
            class="border border-line px-4 text-ink hover:border-accent"
            @click="undoDelete"
          >
            Undo
          </button>
        </span>
        <kbd class="ml-auto rounded-md border border-line px-2 py-1 font-mono text-xs text-muted">⌘S / Ctrl+S</kbd>
      </div>
      <p
        v-if="restartNeeded"
        class="mt-2 rounded-xl bg-accent-soft/40 px-3 py-2 text-sm text-ink"
        role="status"
      >
        Restart <code class="font-mono">npm run dev</code> to apply the new color preset, download the new fonts or bundle the new icons.
      </p>
      <ul
        v-if="errors.length"
        class="mt-2 list-disc rounded-xl border border-pop px-3 py-2 pl-7 text-sm text-ink"
        role="alert"
      >
        <li
          v-for="(error, i) in errors"
          :key="i"
          class="font-mono text-xs"
        >
          {{ error }}
        </li>
      </ul>
    </div>
  </div>
</template>
