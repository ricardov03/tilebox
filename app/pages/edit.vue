<!--
  Local editor. Dev only: the routes it uses 404 outside `nuxt dev`, and
  nuxt.config.ts keeps /edit out of the prerendered output.
  Left: live preview (drag to reorder). Right: Profile | Blocks | Theme.
  Bottom: Save (Cmd/Ctrl+S), dirty state, last save, restart notice.
-->
<script setup lang="ts">
import type { EditorTab } from '~/composables/useEditor'

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
} = editor

useHead({ title: computed(() => (draft.value ? `Edit · ${draft.value.profile.name}` : 'Edit')) })

const tabs: { id: EditorTab, label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'theme', label: 'Theme' },
]

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

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void editor.save()
  }
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}

onMounted(() => {
  media = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = media.matches
  media.addEventListener('change', onMedia)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
  void editor.load()
})

onBeforeUnmount(() => {
  media?.removeEventListener('change', onMedia)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

const savedLabel = computed(() => {
  if (!lastSavedAt.value) return null
  return lastSavedAt.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
})

const inputClass = 'min-h-11 rounded-xl border border-line bg-ground px-3 text-sm text-ink'
const labelClass = 'text-sm font-medium text-ink'

function setProfile<K extends 'name' | 'handle' | 'bio' | 'status'>(key: K, value: string) {
  if (!draft.value) return
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
</script>

<template>
  <div class="flex min-h-screen flex-col bg-ground text-ink">
    <header class="flex min-h-14 items-center justify-between gap-4 border-b border-line bg-tile px-4">
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/"
          class="font-display text-lg font-semibold text-ink hover:text-hover"
        >tilebox</NuxtLink>
        <span class="font-mono text-xs text-muted">editor · dev only</span>
      </div>
      <EditorLayoutSwitch v-model="layoutKey" />
    </header>

    <p
      v-if="!isDev"
      class="m-4 rounded-2xl border border-line bg-tile p-4 text-sm text-muted"
    >
      The editor works only with <code class="font-mono">npm run dev</code>.
    </p>

    <p
      v-else-if="loading"
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
      v-else
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
          :class="layoutKey === 'mobile' ? 'mx-auto w-[390px] max-w-full px-4 py-8' : 'px-4 py-8 xl:px-10'"
          class="rounded-tile bg-ground text-ink transition-colors motion-reduce:transition-none"
        >
          <div
            :class="layoutKey === 'mobile' ? 'mb-6 gap-3' : 'mb-8 gap-4'"
            class="flex flex-col"
          >
            <div class="flex items-center gap-4">
              <img
                v-if="draft.profile.avatar"
                :src="draft.profile.avatar"
                alt=""
                :class="layoutKey === 'mobile' ? 'size-16' : 'size-24'"
                class="rounded-full object-cover"
              >
              <span
                v-else
                :class="layoutKey === 'mobile' ? 'size-16 text-xl' : 'size-24 text-4xl'"
                class="flex items-center justify-center rounded-full bg-accent font-display font-semibold text-accent-soft"
                aria-hidden="true"
              >{{ draft.profile.name.split(' ').map(w => w[0]).join('').slice(0, 2) }}</span>
            </div>
            <h1
              :class="layoutKey === 'mobile' ? 'text-[42px]' : 'text-5xl xl:text-[68px]'"
              class="font-display font-semibold leading-none"
            >
              {{ draft.profile.name }}
            </h1>
            <p
              :class="layoutKey === 'mobile' ? 'text-base' : 'text-[19px]'"
              class="max-w-[34ch] leading-snug text-muted"
            >
              {{ draft.profile.bio }}
            </p>
            <p
              v-if="draft.profile.status"
              class="flex items-center gap-2 text-[15px] font-medium"
            >
              <span
                class="size-2.5 rounded-full bg-dot"
                aria-hidden="true"
              />
              {{ draft.profile.status }}
            </p>
            <p class="font-mono text-sm text-muted">
              @{{ draft.profile.handle }}
            </p>
          </div>

          <ClientOnly>
            <EditorBlockGridEditor
              :blocks="orderedBlocks"
              :columns="layoutKey === 'mobile' ? 2 : 4"
              :selected-id="selectedId"
              @reorder="editor.setOrder"
              @select="editor.select"
            />
            <template #fallback>
              <EditorPreviewGrid
                :blocks="orderedBlocks"
                :columns="layoutKey === 'mobile' ? 2 : 4"
                :selected-id="selectedId"
                @select="editor.select"
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
        >
          <button
            v-for="t in tabs"
            :id="`tab-${t.id}`"
            :key="t.id"
            type="button"
            role="tab"
            :aria-selected="tab === t.id"
            :aria-controls="`panel-${t.id}`"
            :tabindex="tab === t.id ? 0 : -1"
            :class="tab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'"
            class="min-h-12 flex-1 border-b-2 text-sm font-medium"
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
                @input="setProfile('name', ($event.target as HTMLInputElement).value)"
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
                @input="setProfile('handle', ($event.target as HTMLInputElement).value)"
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
                @input="setProfile('bio', ($event.target as HTMLTextAreaElement).value)"
              />
            </div>
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
                @input="setProfile('status', ($event.target as HTMLInputElement).value)"
              >
            </div>
            <EditorImagePicker
              id="p-avatar"
              label="Avatar"
              :src="draft.profile.avatar"
              @update:src="setAvatar"
            />
            <div class="flex flex-col gap-1">
              <label
                for="p-mode"
                :class="labelClass"
              >Theme mode</label>
              <select
                id="p-mode"
                :value="draft.profile.theme.mode"
                :class="inputClass"
                @change="editor.setTheme({ ...draft.profile.theme, mode: ($event.target as HTMLSelectElement).value as 'system' | 'light' | 'dark' })"
              >
                <option value="system">
                  System
                </option>
                <option value="light">
                  Light
                </option>
                <option value="dark">
                  Dark
                </option>
              </select>
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
                class="min-h-11 self-start rounded-full px-3 text-sm text-muted hover:text-ink"
                @click="editor.select(null)"
              >
                ← All blocks
              </button>
              <EditorBlockForm
                :block="selectedBlock"
                @update:block="editor.updateBlock"
                @delete="editor.deleteBlock"
              />
            </div>
            <EditorBlockList
              v-else
              :blocks="orderedBlocks"
              :selected-id="selectedId"
              @select="editor.select"
              @add="editor.addBlock"
              @move="editor.moveBlock"
            />
            <p class="text-xs text-muted">
              Order shown: <strong class="font-medium text-ink">{{ layoutKey }}</strong>.
              Drag a tile by its grip in the preview, or use the arrows here.
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
          class="min-h-11 rounded-full bg-accent px-5 text-sm font-medium text-accent-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
        <kbd class="ml-auto rounded-md border border-line px-2 py-1 font-mono text-xs text-muted">⌘S / Ctrl+S</kbd>
      </div>
      <p
        v-if="restartNeeded"
        class="mt-2 rounded-xl bg-accent-soft/40 px-3 py-2 text-sm text-ink"
        role="status"
      >
        Restart <code class="font-mono">npm run dev</code> to apply the new preset or icons.
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
