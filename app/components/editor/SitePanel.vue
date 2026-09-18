<!--
  Site tab (WP10b): the metadata of the page. Title, description, site URL,
  language, job title, location, X handle, "hide from search engines", the
  favicon, the social preview image, and two previews built from the draft.
  Text fields are `EditorTextField` (NOTES.md, "Editor input fix"): they keep
  what you type, the check waits until you stop typing, and the draft only gets
  a value the schema accepts, so a bad URL is never saved. An empty `site`
  object is removed.
  Uploads go to /api/site/upload, "Regenerate" to /api/site/assets (dev only).
-->
<script setup lang="ts">
import type { Profile } from '~~/types/profile'
import { SITE_DEFAULT_LANG, SITE_DESCRIPTION_MAX, SITE_TITLE_MAX, SiteSchema, type Site } from '~~/types/site'
import { defaultSiteTitle, resolveSiteUrl, siteDescription, siteHost, siteTitle } from '~/utils/site-head'

const props = defineProps<{
  /** The whole draft: "Regenerate" sends it, the defaults come from `profile.profile`. */
  profile: Profile
  /** Does the page show a picture (upload or Gravatar)? Decides the favicon source label. */
  hasAvatar: boolean
}>()

const emit = defineEmits<{ 'update:site': [site: Site | undefined] }>()

type TextKey = 'title' | 'description' | 'url' | 'lang' | 'jobTitle' | 'location' | 'xHandle'
type AssetKey = 'favicon' | 'ogImage'

const site = computed<Site>(() => props.profile.site ?? {})
const info = computed(() => props.profile.profile)

/** What the draft gets for what you typed: no `@` on the X handle, no trailing slash on the URL. */
function normalize(key: TextKey, raw: string): string {
  const value = raw.trim()
  if (key === 'xHandle') return value.replace(/^@+/, '')
  if (key === 'url') return value.replace(/\/+$/, '')
  return value
}

/** Why the schema refuses a value, or `undefined`. */
function fieldError(key: TextKey, value: string): string | undefined {
  const result = SiteSchema.shape[key].safeParse(value)
  return result.success ? undefined : (result.error.issues[0]?.message ?? 'Not valid')
}

/** One stable pair of functions per key, so a render does not give the field new props. */
function fieldOf(key: TextKey) {
  return {
    normalize: (raw: string) => normalize(key, raw),
    validate: (value: string) => fieldError(key, value),
  }
}
const fields: Record<TextKey, ReturnType<typeof fieldOf>> = {
  title: fieldOf('title'),
  description: fieldOf('description'),
  url: fieldOf('url'),
  lang: fieldOf('lang'),
  jobTitle: fieldOf('jobTitle'),
  location: fieldOf('location'),
  xHandle: fieldOf('xHandle'),
}

provideFieldDraftGroup('Site')

/** The next `site` object: `value` undefined or '' removes the key. No keys left = no `site`. */
function withKey(key: keyof Site, value: string | boolean | undefined): Site | undefined {
  const next: Record<string, Site[keyof Site]> = { ...site.value }
  if (value === undefined || value === '' || value === false) Reflect.deleteProperty(next, key)
  else next[key] = value
  return Object.keys(next).length ? (next as Site) : undefined
}

function setNoindex(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) emit('update:site', withKey('noindex', target.checked))
}

/* ---------- generated assets ---------- */

interface AssetsResponse {
  files: string[]
  faviconSource: 'upload' | 'avatar' | 'initials' | 'none'
  ogSource: 'upload' | 'generated' | 'none'
  messages: string[]
  version: string
}

interface FetchErrorLike {
  data?: { statusMessage?: string, message?: string }
}

function messageOf(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'data' in err) {
    const data = (err as FetchErrorLike).data
    const message = data?.statusMessage ?? data?.message
    if (message) return message
  }
  return err instanceof Error ? err.message : 'Request failed'
}

/** Cache-busting stamp of the previews. Set on the client only, so the first render has no `?v=`. */
const version = ref('')
const busy = ref<'regenerate' | AssetKey | null>(null)
const assetError = ref<string | null>(null)
const assetNotes = ref<string[]>([])
const lastFaviconSource = ref<AssetsResponse['faviconSource'] | null>(null)
/** false after a preview image failed to load (no generated file yet). */
const previewOk = reactive({ ico: true, apple: true, og: true })

onMounted(() => {
  version.value = Date.now().toString(36)
})

const bust = (path: string) => (version.value ? `${path}?v=${version.value}` : path)

const FAVICON_LABELS: Record<AssetsResponse['faviconSource'], string> = {
  upload: 'your upload',
  avatar: 'your avatar',
  initials: 'your initials',
  none: 'the default icon',
}

const faviconSource = computed(() => {
  if (lastFaviconSource.value) return FAVICON_LABELS[lastFaviconSource.value]
  if (site.value.favicon) return FAVICON_LABELS.upload
  return props.hasAvatar ? FAVICON_LABELS.avatar : FAVICON_LABELS.initials
})

async function regenerate(nextSite: Site | undefined = props.profile.site, reason: 'regenerate' | AssetKey = 'regenerate') {
  busy.value = reason
  assetError.value = null
  try {
    const body: Profile = { ...props.profile, site: nextSite }
    const res = await $fetch<AssetsResponse>('/api/site/assets', { method: 'POST', body })
    version.value = res.version
    assetNotes.value = res.messages
    lastFaviconSource.value = res.faviconSource
    previewOk.ico = previewOk.apple = previewOk.og = true
  }
  catch (err) {
    assetError.value = messageOf(err)
  }
  finally {
    busy.value = null
  }
}

async function onUpload(key: AssetKey, event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  if (!file) return
  busy.value = key
  assetError.value = null
  const body = new FormData()
  body.append('file', file)
  try {
    const res = await $fetch<{ src: string }>('/api/site/upload', { method: 'POST', query: { kind: key === 'favicon' ? 'favicon' : 'og' }, body })
    const next = withKey(key, res.src)
    emit('update:site', next)
    await regenerate(next, key)
  }
  catch (err) {
    assetError.value = messageOf(err)
    busy.value = null
  }
  finally {
    input.value = ''
  }
}

async function removeUpload(key: AssetKey) {
  const next = withKey(key, undefined)
  emit('update:site', next)
  await regenerate(next, key)
}

/* ---------- previews ---------- */

const shownTitle = computed(() => siteTitle(info.value, site.value))
const shownDescription = computed(() => siteDescription(info.value, site.value))
/** The editor does not know `NUXT_PUBLIC_SITE_URL`; the preview shows `site.url`. */
const shownHost = computed(() => siteHost(resolveSiteUrl('', site.value)) || 'your-site.example')

const labelClass = LABEL_CLASS
const uploadClass = 'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-ground px-3 text-sm font-medium text-ink hover:border-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent'
const buttonClass = `min-h-11 rounded-full border border-line px-4 text-sm font-medium text-ink hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`
</script>

<template>
  <div class="flex flex-col gap-4">
    <EditorTextField
      id="s-title"
      label="Page title"
      :model-value="site.title"
      :counter="SITE_TITLE_MAX"
      :placeholder="defaultSiteTitle(info)"
      :normalize="fields.title.normalize"
      :validate="fields.title.validate"
      @commit="emit('update:site', withKey('title', $event))"
    >
      <p class="text-xs text-muted">
        Empty = your name and handle.
      </p>
    </EditorTextField>

    <EditorTextField
      id="s-description"
      label="Description"
      multiline
      :rows="3"
      :model-value="site.description"
      :counter="SITE_DESCRIPTION_MAX"
      :placeholder="info.bio"
      :normalize="fields.description.normalize"
      :validate="fields.description.validate"
      @commit="emit('update:site', withKey('description', $event))"
    >
      <p class="text-xs text-muted">
        Empty = your bio.
      </p>
    </EditorTextField>

    <EditorTextField
      id="s-url"
      label="Site URL"
      type="url"
      inputmode="url"
      mono
      :model-value="site.url"
      placeholder="https://example.com"
      describedby="s-url-help"
      :normalize="fields.url.normalize"
      :validate="fields.url.validate"
      @commit="emit('update:site', withKey('url', $event))"
    >
      <p
        id="s-url-help"
        class="text-xs text-muted"
      >
        The address of your page. It makes the links in previews absolute. <code class="font-mono">npm run publish</code> sets it for you.
      </p>
    </EditorTextField>

    <div class="grid grid-cols-2 items-start gap-3">
      <EditorTextField
        id="s-lang"
        label="Language"
        mono
        :model-value="site.lang"
        :placeholder="SITE_DEFAULT_LANG"
        :normalize="fields.lang.normalize"
        :validate="fields.lang.validate"
        @commit="emit('update:site', withKey('lang', $event))"
      />
      <EditorTextField
        id="s-x"
        label="X handle"
        mono
        :model-value="site.xHandle"
        placeholder="yourname"
        :normalize="fields.xHandle.normalize"
        :validate="fields.xHandle.validate"
        @commit="emit('update:site', withKey('xHandle', $event))"
      />
    </div>

    <div class="grid grid-cols-2 items-start gap-3">
      <EditorTextField
        id="s-job"
        label="Job title"
        :maxlength="100"
        :model-value="site.jobTitle"
        :normalize="fields.jobTitle.normalize"
        :validate="fields.jobTitle.validate"
        @commit="emit('update:site', withKey('jobTitle', $event))"
      />
      <EditorTextField
        id="s-location"
        label="Location"
        :maxlength="100"
        placeholder="City"
        :model-value="site.location"
        :normalize="fields.location.normalize"
        :validate="fields.location.validate"
        @commit="emit('update:site', withKey('location', $event))"
      />
      <p class="col-span-2 text-xs text-muted">
        Job title and location are not shown on the page. Search engines read them.
      </p>
    </div>

    <div class="flex flex-col gap-1">
      <label
        for="s-noindex"
        class="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink"
      >
        <input
          id="s-noindex"
          type="checkbox"
          :checked="site.noindex === true"
          aria-describedby="s-noindex-help"
          :class="FOCUS_RING"
          class="size-5 accent-[var(--color-accent)]"
          @change="setNoindex"
        >
        Hide my page from search engines
      </label>
      <p
        id="s-noindex-help"
        class="text-xs text-muted"
      >
        Adds a "noindex" tag. People with the link still see the page.
      </p>
    </div>

    <!-- Favicon -->
    <fieldset
      :aria-busy="busy === 'favicon'"
      class="flex flex-col gap-2 rounded-2xl border border-line p-3"
    >
      <legend :class="labelClass">
        Favicon
      </legend>
      <p
        class="text-xs text-muted"
        data-favicon-source
      >
        Made from <strong class="font-medium text-ink">{{ faviconSource }}</strong>. Order: your upload, your avatar, your initials.
      </p>
      <div class="flex items-end gap-4">
        <figure class="flex flex-col items-center gap-1">
          <img
            v-if="previewOk.ico"
            :src="bust('/site/favicon.ico')"
            alt="Favicon, 32 pixels"
            width="32"
            height="32"
            class="size-8"
            @error="previewOk.ico = false"
          >
          <span
            v-else
            class="size-8 rounded-md border border-line bg-photo"
          />
          <figcaption class="font-mono text-xs text-muted">
            32
          </figcaption>
        </figure>
        <figure class="flex flex-col items-center gap-1">
          <img
            v-if="previewOk.apple"
            :src="bust('/site/apple-touch-icon.png')"
            alt="Home screen icon, 180 pixels"
            width="180"
            height="180"
            class="size-24 rounded-[22%]"
            @error="previewOk.apple = false"
          >
          <span
            v-else
            class="size-24 rounded-[22%] border border-line bg-photo"
          />
          <figcaption class="font-mono text-xs text-muted">
            180
          </figcaption>
        </figure>
      </div>
      <div class="flex flex-wrap gap-2">
        <label
          for="s-favicon-file"
          :class="uploadClass"
        >
          {{ busy === 'favicon' ? 'Working...' : 'Upload a square png, jpg or svg (an svg is saved as a png)' }}
          <input
            id="s-favicon-file"
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            class="sr-only"
            :disabled="busy !== null"
            @change="onUpload('favicon', $event)"
          >
        </label>
        <button
          v-if="site.favicon"
          type="button"
          :class="buttonClass"
          :disabled="busy !== null"
          @click="removeUpload('favicon')"
        >
          Remove upload
        </button>
      </div>
    </fieldset>

    <!-- Social preview image -->
    <fieldset
      :aria-busy="busy === 'ogImage' || busy === 'regenerate'"
      class="flex flex-col gap-2 rounded-2xl border border-line p-3"
    >
      <legend :class="labelClass">
        Social preview image
      </legend>
      <p class="text-xs text-muted">
        {{ site.ogImage ? 'Your upload, cut to 1200 x 630.' : 'Made from your name, bio, avatar and colors. Always in Geist, light colors.' }}
      </p>
      <img
        v-if="previewOk.og"
        :src="bust('/site/og.png')"
        alt="Social preview image"
        width="1200"
        height="630"
        class="h-auto w-full rounded-xl border border-line"
        data-site-og-preview
        @error="previewOk.og = false"
      >
      <p
        v-else
        class="rounded-xl border border-line bg-photo p-3 text-xs text-ink"
      >
        No image yet. Press Regenerate.
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          :class="buttonClass"
          :disabled="busy !== null"
          @click="regenerate()"
        >
          {{ busy === 'regenerate' ? 'Working...' : 'Regenerate' }}
        </button>
        <label
          for="s-og-file"
          :class="uploadClass"
        >
          {{ busy === 'ogImage' ? 'Working...' : 'Upload png, jpg or webp' }}
          <input
            id="s-og-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="sr-only"
            :disabled="busy !== null"
            @change="onUpload('ogImage', $event)"
          >
        </label>
        <button
          v-if="site.ogImage"
          type="button"
          :class="buttonClass"
          :disabled="busy !== null"
          @click="removeUpload('ogImage')"
        >
          Remove upload
        </button>
      </div>
      <p class="text-xs text-muted">
        Regenerate uses what you see here, saved or not. <code class="font-mono">npm run dev</code> and the build make the files again from the saved profile.
      </p>
    </fieldset>

    <p
      v-if="assetError"
      class="text-xs text-pop"
      role="alert"
    >
      {{ assetError }}
    </p>
    <ul
      v-if="assetNotes.length"
      class="list-disc pl-5 font-mono text-xs text-muted"
      role="status"
    >
      <li
        v-for="(note, i) in assetNotes"
        :key="i"
      >
        {{ note }}
      </li>
    </ul>

    <!-- Previews from the draft -->
    <section
      aria-label="Search result preview"
      class="flex flex-col gap-1 rounded-2xl border border-line bg-ground p-3"
      data-site-snippet
    >
      <h3 class="font-mono text-xs text-muted">
        Search result
      </h3>
      <p class="truncate font-mono text-xs text-muted">
        {{ shownHost }}
      </p>
      <p class="truncate text-lg leading-[1.3] text-hover">
        {{ shownTitle }}
      </p>
      <p class="line-clamp-2 text-sm text-muted">
        {{ shownDescription }}
      </p>
    </section>

    <section
      aria-label="Social card preview"
      class="flex flex-col gap-1"
      data-site-card
    >
      <h3 class="font-mono text-xs text-muted">
        Social card
      </h3>
      <div class="overflow-hidden rounded-2xl border border-line bg-ground">
        <img
          v-if="previewOk.og"
          :src="bust('/site/og.png')"
          alt=""
          width="1200"
          height="630"
          class="h-auto w-full border-b border-line"
        >
        <div class="flex flex-col gap-0.5 p-3">
          <p class="truncate font-mono text-xs uppercase text-muted">
            {{ shownHost }}
          </p>
          <p class="truncate text-sm font-semibold text-ink">
            {{ shownTitle }}
          </p>
          <p class="line-clamp-2 text-xs text-muted">
            {{ shownDescription }}
          </p>
        </div>
      </div>
    </section>
    <EditorSiteExtras />
  </div>
</template>
