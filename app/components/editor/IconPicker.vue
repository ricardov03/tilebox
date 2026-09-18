<!--
  Icon field of the editor. WP17 made it one picture and one search box:
  the current icon at 32 px, one short caption ("Auto, from the link",
  "Custom", "From the network"), the search input, the results, and
  "Back to auto" while your own icon is set. There is NO field with the icon
  NAME any more: the owner asked for the icon and the search box only.
  The name is not lost for assistive tech: every result button is NAMED after
  its icon, so a screen reader still reads `line-md:github`.
  Power user, without a second field: type a full `prefix:name` in the search
  box. The search route answers with that exact icon first, so it is the first
  result you can click.
  Previews come from the dev route `/api/icons/svg?name=` (the icon packs on
  this machine, no network): with `icon.provider: 'none'` <Icon> draws only the
  icons the build bundled, and a freshly picked one is not among them yet.
  <Icon> is the fallback when that route answers nothing.
-->
<script setup lang="ts">
import type { LinkIcon } from '~/components/blocks/media'

const model = defineModel<string | undefined>()

const props = defineProps<{
  id: string
  label?: string
  /** The icon the tile shows while no own icon is set. It follows the URL live. */
  auto?: LinkIcon
  /** The caption while no own icon is set. */
  autoCaption?: string
  /** The icon comes from somewhere else and cannot be changed here (a social tile): no search, no results, no button. */
  readonly?: boolean
}>()

const query = ref('')
const results = ref<string[]>([])
const searching = ref(false)
const searchError = ref<string | null>(null)
const failed = ref<Set<string>>(new Set())
let timer: ReturnType<typeof setTimeout> | undefined
/** Id of the latest search. A response for an older id is dropped. */
let requestId = 0

/** The dev route that draws one icon of the local packs. Dev only, like the whole editor. */
function svgUrl(name: string): string {
  return `/api/icons/svg?name=${encodeURIComponent(name)}`
}

/** Your own icon wins, else the automatic one. */
const shown = computed<LinkIcon | null>(() =>
  model.value ? { kind: 'icon', name: model.value, source: 'manual' } : (props.auto ?? null),
)
const iconName = computed(() => (shown.value?.kind === 'icon' ? shown.value.name : null))
const faviconSrc = computed(() => (shown.value?.kind === 'favicon' ? shown.value.src : null))
const caption = computed(() => (model.value ? 'Custom' : (props.autoCaption ?? 'Auto, from the link')))

/** The dev route did not draw the current icon: fall back to <Icon>. Reset when the icon changes. */
const previewFailed = ref(false)
watch(iconName, () => {
  previewFailed.value = false
})

async function search() {
  const q = query.value.trim()
  const id = ++requestId
  if (!q) {
    results.value = []
    searching.value = false
    searchError.value = null
    return
  }
  searching.value = true
  searchError.value = null
  try {
    const res = await $fetch<{ icons: string[] }>('/api/icons/search', { query: { q } })
    if (id !== requestId) return
    results.value = res.icons.filter(name => name.includes(':'))
  }
  catch (error) {
    if (id !== requestId) return
    searchError.value = error instanceof Error ? error.message : 'Search failed'
  }
  finally {
    if (id === requestId) searching.value = false
  }
}

watch(query, (value) => {
  clearTimeout(timer)
  if (!value.trim()) {
    void search()
    return
  }
  timer = setTimeout(() => void search(), 300)
})

onBeforeUnmount(() => clearTimeout(timer))

function pick(name: string) {
  model.value = name
}

/** Removes your own icon. The automatic one (the brand icon of the URL, the favicon, the default) comes back. */
function backToAuto() {
  model.value = undefined
}

function markFailed(name: string) {
  failed.value = new Set(failed.value).add(name)
}

const inputId = computed(() => `${props.id}-icon`)
const inputClass = INPUT_CLASS
const smallButton = `min-h-9 rounded-full border border-line px-3 text-xs font-medium text-ink hover:border-accent ${FOCUS_RING}`
</script>

<template>
  <fieldset class="flex flex-col gap-2 border-0 p-0">
    <legend class="text-sm font-medium text-ink">
      {{ label ?? 'Icon' }}
    </legend>

    <div class="flex flex-wrap items-center gap-3">
      <span
        class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-ground text-ink"
        aria-hidden="true"
      >
        <img
          v-if="faviconSrc"
          :src="faviconSrc"
          alt=""
          width="32"
          height="32"
          class="size-8 rounded"
        >
        <img
          v-else-if="iconName && !previewFailed"
          :src="svgUrl(iconName)"
          alt=""
          width="32"
          height="32"
          class="size-8"
          @error="previewFailed = true"
        >
        <Icon
          v-else-if="iconName"
          :name="iconName"
          class="size-8"
        />
        <span
          v-else
          class="text-xs text-muted"
        >none</span>
      </span>
      <!-- The caption never shows the `prefix:name` string: the owner asked for the picture and the search box only. -->
      <span
        data-icon-caption
        class="text-xs text-muted"
      >{{ caption }}</span>
      <button
        v-if="model && !readonly"
        type="button"
        :class="smallButton"
        @click="backToAuto"
      >
        Back to auto
      </button>
    </div>

    <template v-if="!readonly">
      <label
        :for="`${inputId}-search`"
        class="sr-only"
      >Search icons</label>
      <input
        :id="`${inputId}-search`"
        v-model="query"
        type="search"
        placeholder="Search icons"
        :class="inputClass"
      >

      <p
        v-if="searching"
        class="text-xs text-muted"
        aria-live="polite"
      >
        Searching...
      </p>
      <p
        v-else-if="searchError"
        class="text-xs text-pop"
        role="alert"
      >
        {{ searchError }}
      </p>
      <p
        v-else-if="query.trim() && results.length === 0"
        class="text-xs text-muted"
        aria-live="polite"
      >
        No icons match "{{ query.trim() }}".
      </p>

      <ul
        v-if="results.length"
        class="grid list-none grid-cols-6 gap-1 p-0"
        aria-label="Search results"
      >
        <li
          v-for="name in results"
          :key="name"
        >
          <!-- The accessible name stays the icon name: a screen reader needs it, the eye does not. -->
          <button
            type="button"
            :title="name"
            :aria-label="name"
            :aria-pressed="model === name"
            :class="[FOCUS_RING, model === name ? 'border-accent' : 'border-line hover:border-accent']"
            class="flex size-11 w-full items-center justify-center overflow-hidden rounded-xl border bg-ground"
            @click="pick(name)"
          >
            <img
              v-if="!failed.has(name)"
              :src="svgUrl(name)"
              alt=""
              width="24"
              height="24"
              class="size-6"
              loading="lazy"
              @error="markFailed(name)"
            >
            <span
              v-else
              class="px-1 font-mono text-[10px] leading-tight text-muted"
            >{{ name.split(':')[1] }}</span>
          </button>
        </li>
      </ul>

      <a
        href="https://icones.js.org/collection/line-md"
        target="_blank"
        rel="noopener noreferrer"
        :class="FOCUS_RING"
        class="self-start rounded-sm text-xs text-muted underline hover:text-hover"
      >Browse all on icones.js.org<span class="sr-only"> (opens in a new tab)</span></a>
    </template>
  </fieldset>
</template>
