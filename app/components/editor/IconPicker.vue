<!--
  Icon field. Search (300 ms debounce) goes through /api/icons/search
  (dev-only proxy of the Iconify search API). Results show a live preview
  and the full name. You can also paste any `prefix:name`.
  Note: with `icon.provider: 'none'` <Icon> renders only icons that are in
  the client bundle. Results therefore preview through the Iconify SVG
  endpoint (dev only) and fall back to the name as text.
-->
<script setup lang="ts">
const model = defineModel<string | undefined>()

const props = defineProps<{
  id: string
  label?: string
}>()

const query = ref('')
const results = ref<string[]>([])
const searching = ref(false)
const searchError = ref<string | null>(null)
const failed = ref<Set<string>>(new Set())
let timer: ReturnType<typeof setTimeout> | undefined

const inkHex = ref('000000')
onMounted(() => {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) inkHex.value = value.slice(1)
})

function previewUrl(name: string): string {
  const [prefix, icon] = name.split(':')
  return `https://api.iconify.design/${prefix}/${icon}.svg?color=%23${inkHex.value}`
}

async function search() {
  const q = query.value.trim()
  if (!q) {
    results.value = []
    return
  }
  searching.value = true
  searchError.value = null
  try {
    const res = await $fetch<{ icons: string[] }>('/api/icons/search', { query: { q } })
    results.value = res.icons
  }
  catch (error) {
    searchError.value = error instanceof Error ? error.message : 'Search failed'
  }
  finally {
    searching.value = false
  }
}

watch(query, () => {
  clearTimeout(timer)
  timer = setTimeout(search, 300)
})

onBeforeUnmount(() => clearTimeout(timer))

function pick(name: string) {
  model.value = name
}

function onManual(event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  model.value = value || undefined
}

function markFailed(name: string) {
  failed.value = new Set(failed.value).add(name)
}

const inputId = computed(() => `${props.id}-icon`)
</script>

<template>
  <fieldset class="flex flex-col gap-2 border-0 p-0">
    <legend class="text-sm font-medium text-ink">
      {{ label ?? 'Icon' }}
    </legend>

    <div class="flex items-center gap-3">
      <span
        class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-ground"
        aria-hidden="true"
      >
        <Icon
          v-if="model"
          :name="model"
          class="size-6 text-ink"
        />
        <span
          v-else
          class="text-xs text-muted"
        >none</span>
      </span>
      <label
        :for="inputId"
        class="sr-only"
      >Icon name (prefix:name)</label>
      <input
        :id="inputId"
        :value="model ?? ''"
        type="text"
        placeholder="line-md:github"
        spellcheck="false"
        class="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-ground px-3 font-mono text-sm text-ink"
        @change="onManual"
      >
      <button
        v-if="model"
        type="button"
        class="min-h-11 rounded-xl px-3 text-sm text-muted hover:text-ink"
        @click="model = undefined"
      >
        Clear
      </button>
    </div>

    <label
      :for="`${inputId}-search`"
      class="sr-only"
    >Search icons</label>
    <input
      :id="`${inputId}-search`"
      v-model="query"
      type="search"
      placeholder="Search line-md and simple-icons"
      class="min-h-11 rounded-xl border border-line bg-ground px-3 text-sm text-ink"
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
        <button
          type="button"
          :title="name"
          :aria-label="name"
          :aria-pressed="model === name"
          :class="model === name ? 'border-accent' : 'border-line hover:border-accent'"
          class="flex size-11 w-full items-center justify-center overflow-hidden rounded-xl border bg-ground"
          @click="pick(name)"
        >
          <img
            v-if="!failed.has(name)"
            :src="previewUrl(name)"
            :alt="name"
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
      class="text-xs text-muted underline hover:text-hover"
    >Browse all on icones.js.org</a>
  </fieldset>
</template>
