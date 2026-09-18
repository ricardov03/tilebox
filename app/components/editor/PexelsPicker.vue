<!--
  Pexels tab of the image field (WP12). Dev editor only.
  Search and pick go through the dev-only routes `/api/images/pexels/*`: the key stays on the server.
  The thumbnails of the result grid load from `images.pexels.com` directly. That is fine HERE: this is
  the owner's dev tool. The public page never does it: a picked photo is a local file in `public/blocks/`.
  No nested <form>: this component lives inside the block form. Enter in the search box is handled by hand.
  Keyboard: Tab reaches the grid once (roving tabindex), arrow keys / Home / End move, Enter or Space picks.
  The only inline colour is `avgColor` from Pexels (checked as #rrggbb on the server): it is data, not a design token.
-->
<script setup lang="ts">
import type { PexelsPhoto, PickResult, SearchResult } from '~~/content/pexels'
import type { Size } from '~/utils/sizes'

type Orientation = 'landscape' | 'portrait' | 'square'

const props = defineProps<{
  id: string
  /** The tile size of the block. It presets the orientation. */
  size: Size
}>()

const emit = defineEmits<{ pick: [result: PickResult] }>()

const MIN_CHARS = 2
const IDLE_MS = 800
const ORIENTATION_OF: Record<Size, Orientation> = { '1x1': 'square', '2x2': 'square', '2x1': 'landscape', '1x2': 'portrait' }
const ORIENTATION_OPTIONS: { value: Orientation | '', label: string }[] = [
  { value: '', label: 'Any shape' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'square', label: 'Square' },
]

type KeyState = 'checking' | 'missing' | 'ready' | 'unknown'
type Problem = { kind: 'rate' | 'key' | 'offline' | 'other', text: string }

const keyState = ref<KeyState>('checking')
const query = ref('')
const orientation = ref<Orientation | ''>(ORIENTATION_OF[props.size])
/** The owner chose an orientation by hand: a new tile size does not change it any more. */
const orientationTouched = ref(false)
const photos = ref<PexelsPhoto[]>([])
const page = ref(0)
const hasMore = ref(false)
const remaining = ref<number | null>(null)
const searched = ref('')
const loading = ref(false)
const problem = ref<Problem | null>(null)
const pickingId = ref<number | null>(null)
const pickedNote = ref('')
const activeIndex = ref(0)

const grid = useTemplateRef<HTMLUListElement>('grid')
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | null = null
let lastKey = ''

interface FetchFailure {
  statusCode?: number
  status?: number
  data?: { statusMessage?: string, message?: string }
}

function isFetchFailure(value: unknown): value is FetchFailure {
  return typeof value === 'object' && value !== null
}

const OFFLINE: Problem = { kind: 'offline', text: 'You are offline. Pexels needs the internet. Photos you picked before are local files: they still work.' }

/** The dev server is on this machine and answers without internet, so the browser is asked first. No request, no quota. */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** One line for the owner. The server already wrote the useful ones (wrong key, rate limit with the time). */
function problemOf(err: unknown): Problem {
  if (isOffline()) return OFFLINE
  const failure = isFetchFailure(err) ? err : {}
  const status = failure.statusCode ?? failure.status
  const text = failure.data?.statusMessage ?? failure.data?.message
  if (status === 429) return { kind: 'rate', text: text ?? 'Pexels rate limit reached, try again in about one hour' }
  if (status === 401) return { kind: 'key', text: `${text ?? 'The Pexels key is wrong'}. Check the key in .env, then start npm run dev again.` }
  if (status === 502 || status === 504) return { kind: 'offline', text: `${text ?? 'Cannot reach Pexels'}. Check your internet connection.` }
  return { kind: 'other', text: text ?? 'The Pexels request failed.' }
}

async function checkKey() {
  keyState.value = 'checking'
  try {
    const res = await $fetch<{ configured: boolean }>('/api/images/pexels/status', { retry: 0 })
    keyState.value = res.configured ? 'ready' : 'missing'
  }
  catch {
    keyState.value = 'unknown'
  }
}

const trimmed = computed(() => query.value.trim())

async function search(nextPage: number) {
  const q = trimmed.value
  if (q.length < MIN_CHARS) return
  const key = JSON.stringify([q, orientation.value, nextPage])
  if (key === lastKey && !problem.value) return
  clearTimeout(timer)
  if (isOffline()) {
    problem.value = OFFLINE
    return
  }
  controller?.abort()
  const mine = new AbortController()
  controller = mine
  loading.value = true
  problem.value = null
  pickedNote.value = ''
  try {
    const res = await $fetch<SearchResult>('/api/images/pexels/search', {
      query: { q, page: nextPage, ...(orientation.value ? { orientation: orientation.value } : {}) },
      signal: mine.signal,
      retry: 0,
    })
    if (mine.signal.aborted) return
    lastKey = key
    if (nextPage === 1) {
      photos.value = res.photos
      activeIndex.value = 0
    }
    else {
      const known = new Set(photos.value.map(photo => photo.id))
      photos.value = [...photos.value, ...res.photos.filter(photo => !known.has(photo.id))]
    }
    page.value = res.page
    hasMore.value = res.hasMore
    remaining.value = res.rateLimit.remaining
    searched.value = q
  }
  catch (err) {
    if (mine.signal.aborted) return
    problem.value = problemOf(err)
  }
  finally {
    if (controller === mine) {
      loading.value = false
      controller = null
    }
  }
}

watch(query, () => {
  clearTimeout(timer)
  if (trimmed.value.length < MIN_CHARS) return
  timer = setTimeout(() => void search(1), IDLE_MS)
})

function onOrientation(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const value = ORIENTATION_OPTIONS.find(option => option.value === target.value)?.value ?? ''
  orientation.value = value
  orientationTouched.value = true
  void search(1)
}

watch(() => props.size, (size) => {
  if (orientationTouched.value) return
  orientation.value = ORIENTATION_OF[size]
  void search(1)
})

function onSearchKey(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  // Never submit the block form around this component.
  event.preventDefault()
  void search(1)
}

async function loadMore() {
  const from = photos.value.length
  await search(page.value + 1)
  if (photos.value.length > from) focusPhoto(from)
}

function photoButtons(): HTMLButtonElement[] {
  return [...(grid.value?.querySelectorAll<HTMLButtonElement>('button[data-pexels-photo]') ?? [])]
}

function focusPhoto(index: number) {
  const buttons = photoButtons()
  const next = Math.min(Math.max(index, 0), buttons.length - 1)
  if (next < 0) return
  activeIndex.value = next
  void nextTick(() => photoButtons()[next]?.focus())
}

function columns(): number {
  if (!grid.value) return 1
  return Math.max(1, getComputedStyle(grid.value).gridTemplateColumns.trim().split(/\s+/).length)
}

function onGridKey(event: KeyboardEvent) {
  const steps: Record<string, () => number> = {
    ArrowRight: () => activeIndex.value + 1,
    ArrowLeft: () => activeIndex.value - 1,
    ArrowDown: () => activeIndex.value + columns(),
    ArrowUp: () => activeIndex.value - columns(),
    Home: () => 0,
    End: () => photos.value.length - 1,
  }
  const step = steps[event.key]
  if (!step) return
  event.preventDefault()
  const target = step()
  // Up from the first row and down from the last row stay where they are.
  if ((event.key === 'ArrowUp' && target < 0) || (event.key === 'ArrowDown' && target > photos.value.length - 1)) return
  focusPhoto(target)
}

async function pick(photo: PexelsPhoto, index: number) {
  if (pickingId.value !== null) return
  activeIndex.value = index
  if (isOffline()) {
    problem.value = OFFLINE
    return
  }
  pickingId.value = photo.id
  problem.value = null
  pickedNote.value = ''
  try {
    const result = await $fetch<PickResult>('/api/images/pexels/pick', { method: 'POST', body: { id: photo.id, size: 'large2x' }, retry: 0 })
    emit('pick', result)
    pickedNote.value = `Saved as ${result.src} (${result.width} x ${result.height}). The tile shows the credit line.`
  }
  catch (err) {
    problem.value = problemOf(err)
  }
  finally {
    pickingId.value = null
  }
}

function labelOf(photo: PexelsPhoto): string {
  const what = photo.alt || 'Photo'
  return photo.photographer ? `${what}. Photo by ${photo.photographer}` : what
}

onMounted(checkKey)
onBeforeUnmount(() => {
  clearTimeout(timer)
  controller?.abort()
})

const searchId = computed(() => `${props.id}-pexels-q`)
const orientationId = computed(() => `${props.id}-pexels-orientation`)
const inputClass = INPUT_CLASS
const focusRing = FOCUS_RING
const linkClass = `underline underline-offset-2 hover:text-hover rounded-sm ${FOCUS_RING}`
</script>

<template>
  <div
    data-pexels
    class="flex flex-col gap-3"
  >
    <p
      v-if="keyState === 'checking'"
      class="text-sm text-muted"
      role="status"
    >
      Checking the Pexels key...
    </p>

    <!-- No key -->
    <div
      v-else-if="keyState === 'missing' || keyState === 'unknown'"
      data-pexels-nokey
      class="flex flex-col gap-2 rounded-xl border border-line bg-ground p-3 text-sm text-ink"
    >
      <p class="font-medium">
        {{ keyState === 'missing' ? 'Pexels needs a free key' : 'The editor could not ask the dev server for the Pexels key' }}
      </p>
      <ol class="list-decimal space-y-1 pl-5 text-muted">
        <li>
          Make a free account and copy your key:
          <a
            href="https://www.pexels.com/api/"
            target="_blank"
            rel="noopener noreferrer"
            :class="linkClass"
            class="text-ink"
          >pexels.com/api</a> (opens in a new tab).
        </li>
        <li>
          Open the file <code class="font-mono text-ink">.env</code> in the project folder (copy <code class="font-mono text-ink">.env.example</code> when there is none). Paste the key on the Pexels line, after the <code class="font-mono text-ink">=</code> sign.
        </li>
        <li>
          Stop <code class="font-mono text-ink">npm run dev</code> and start it again.
        </li>
      </ol>
      <p class="text-xs text-muted">
        The key stays on this machine. Only the dev server reads it. It is never in the page, in the repo or in the built site, and a build does not need it.
      </p>
      <button
        type="button"
        :class="focusRing"
        class="min-h-11 self-start rounded-full border border-line px-4 text-sm font-medium text-ink hover:border-accent"
        @click="checkKey"
      >
        Check again
      </button>
    </div>

    <!-- Search -->
    <template v-else>
      <div class="flex flex-wrap items-end gap-2">
        <div class="flex min-w-40 flex-1 flex-col gap-1">
          <label
            :for="searchId"
            class="text-sm font-medium text-ink"
          >Search Pexels</label>
          <input
            :id="searchId"
            v-model="query"
            type="search"
            maxlength="80"
            autocomplete="off"
            placeholder="desk, mountains, coffee"
            :class="inputClass"
            @keydown="onSearchKey"
          >
        </div>
        <div class="flex flex-col gap-1">
          <label
            :for="orientationId"
            class="text-sm font-medium text-ink"
          >Shape</label>
          <select
            :id="orientationId"
            :value="orientation"
            :class="inputClass"
            @change="onOrientation"
          >
            <option
              v-for="option in ORIENTATION_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <p
        v-if="problem"
        :data-pexels-problem="problem.kind"
        class="rounded-xl border border-pop px-3 py-2 text-sm text-ink"
        role="alert"
      >
        {{ problem.text }}
      </p>

      <p
        class="text-xs text-muted"
        role="status"
      >
        <template v-if="loading">
          Searching...
        </template>
        <template v-else-if="pickingId !== null">
          Saving the photo on this machine...
        </template>
        <template v-else-if="pickedNote">
          {{ pickedNote }}
        </template>
        <template v-else-if="problem" />
        <template v-else-if="searched && photos.length === 0">
          No photos for "{{ searched }}". Try another word or another shape.
        </template>
        <template v-else-if="searched">
          {{ photos.length }} photos for "{{ searched }}". Arrow keys move, Enter picks.
        </template>
        <template v-else>
          Type {{ MIN_CHARS }} letters or more. The search starts when you stop typing, or with Enter.
        </template>
      </p>

      <ul
        v-if="photos.length"
        ref="grid"
        data-pexels-grid
        :aria-busy="loading"
        aria-label="Pexels photos"
        class="grid list-none grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 p-0"
        @keydown="onGridKey"
      >
        <li
          v-for="(photo, index) in photos"
          :key="photo.id"
          class="min-w-0"
        >
          <button
            type="button"
            data-pexels-photo
            :data-photo-id="photo.id"
            :tabindex="index === activeIndex ? 0 : -1"
            :aria-label="labelOf(photo)"
            :aria-busy="pickingId === photo.id"
            :disabled="pickingId !== null && pickingId !== photo.id"
            :class="focusRing"
            class="group flex w-full flex-col gap-1 rounded-xl text-left disabled:opacity-50"
            @click="pick(photo, index)"
            @focus="activeIndex = index"
          >
            <span
              class="relative block aspect-4/3 w-full overflow-hidden rounded-xl border border-line bg-photo group-hover:border-accent"
              :style="photo.avgColor ? { backgroundColor: photo.avgColor } : undefined"
            >
              <img
                :src="photo.thumb"
                alt=""
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                class="absolute inset-0 size-full object-cover"
              >
              <span
                v-if="pickingId === photo.id"
                class="absolute inset-0 flex items-center justify-center bg-ink/60 text-xs font-medium text-ground"
              >Saving...</span>
            </span>
            <span class="truncate font-mono text-xs text-muted">{{ photo.photographer || 'Pexels' }}</span>
          </button>
        </li>
      </ul>

      <button
        v-if="photos.length && hasMore"
        type="button"
        data-pexels-more
        :disabled="loading"
        :class="focusRing"
        class="min-h-11 self-center rounded-full border border-line px-4 text-sm font-medium text-ink hover:border-accent disabled:opacity-50"
        @click="loadMore"
      >
        {{ loading ? 'Loading...' : 'Load more' }}
      </button>
    </template>

    <p class="text-xs text-muted">
      <a
        href="https://www.pexels.com"
        target="_blank"
        rel="noopener noreferrer"
        :class="linkClass"
      >Photos provided by Pexels</a>
      <span v-if="remaining !== null"> · {{ remaining }} requests left in your quota</span>
    </p>
  </div>
</template>
