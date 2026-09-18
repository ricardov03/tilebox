<!--
  Site tab (WP11): UTM tags. The BUILD adds them to every external http(s) link
  of link, social, map and video tiles (app/utils/utm.ts). The URLs you typed
  stay clean in the file. Source and medium are both needed; campaign is optional.
  The live example is the same function the build calls, on the first link of the draft.
  Text fields are `EditorTextField` (NOTES.md, "Editor input fix"): the check
  waits until you stop typing, and a refused value blocks the save. `values`
  holds the CHECKED text of each field; the draft gets `site.utm` only while
  source and medium are both there. The example follows the checked values.
-->
<script setup lang="ts">
import { resolveSiteUrl } from '~/utils/site-head'
import { UTM_VALUE, withUtm, type UtmSettings } from '~/utils/utm'

type Key = 'source' | 'medium' | 'campaign'

const { draft, site, setSiteKey } = useSiteDraft()

const FIELDS: readonly { key: Key, label: string, placeholder: string }[] = [
  { key: 'source', label: 'Source (utm_source)', placeholder: 'tilebox' },
  { key: 'medium', label: 'Medium (utm_medium)', placeholder: 'profile' },
  { key: 'campaign', label: 'Campaign (utm_campaign), optional', placeholder: 'spring-2027' },
]
const KEYS: readonly Key[] = ['source', 'medium', 'campaign']

/** The checked text of each field. A lone source lives here: the draft has no place for half a setting. */
const values = reactive<Record<Key, string>>({ source: '', medium: '', campaign: '' })
const FORMAT_ERROR = 'Use lowercase letters, digits, _ and - (40 at most)'

const trim = (raw: string) => raw.trim()
const check = (value: string) => (UTM_VALUE.test(value) ? undefined : FORMAT_ERROR)

/** What the checked fields say. `undefined` = the tags are off. */
const typed = computed<UtmSettings | undefined>(() => {
  const { source, medium, campaign } = values
  if (!source || !medium) return undefined
  return { source, medium, ...(campaign ? { campaign } : {}) }
})
const incomplete = computed(() => !typed.value && KEYS.some(key => values[key] !== ''))

const same = (a: UtmSettings | undefined, b: UtmSettings | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// Re-sync only when the draft changed from outside (load), not on our own write.
watch(() => site.value.utm, (next) => {
  if (same(next, typed.value)) return
  // A half-filled setting stays while the draft has no tags.
  if (!next && incomplete.value) return
  for (const key of KEYS) values[key] = next?.[key] ?? ''
}, { immediate: true, deep: true })

function setValue(key: Key, value: string) {
  values[key] = value
  if (!same(site.value.utm, typed.value)) setSiteKey('utm', typed.value)
}

/** `NUXT_PUBLIC_SITE_URL` of this dev server wins over the field of the Site tab, as in the build (and in QrPanel). */
const envSiteUrl = useRuntimeConfig().public.siteUrl
const siteUrl = computed(() => resolveSiteUrl(envSiteUrl, site.value))
const sample = computed(() => {
  const block = draft.value?.blocks.find(item => item.type === 'link' && /^https?:\/\//i.test(item.url ?? '') && !item.noUtm)
  return (block && block.type === 'link' ? block.url : undefined) ?? 'https://example.com/page?ref=1'
})
const rewritten = computed(() => withUtm(sample.value, typed.value, siteUrl.value))
</script>

<template>
  <fieldset
    class="flex flex-col gap-3 rounded-2xl border border-line p-3"
    data-utm-panel
  >
    <legend :class="LABEL_CLASS">
      UTM tags
    </legend>
    <p class="text-xs text-muted">
      The build adds these tags to the links that leave your site, so the other site sees where the visit came from. Your saved links stay clean.
    </p>
    <EditorTextField
      v-for="field in FIELDS"
      :id="`u-${field.key}`"
      :key="field.key"
      :label="field.label"
      :maxlength="40"
      mono
      autocapitalize="none"
      spellcheck="false"
      :placeholder="field.placeholder"
      :model-value="values[field.key]"
      :normalize="trim"
      :validate="check"
      @commit="setValue(field.key, $event)"
    />
    <p
      v-if="incomplete"
      class="text-xs text-ink"
      data-utm-incomplete
    >
      The tags are off: source and medium are both needed.
    </p>
    <div class="flex flex-col gap-1">
      <span :class="LABEL_CLASS">Example</span>
      <code
        class="rounded-xl border border-line bg-ground px-3 py-2 font-mono text-xs break-all text-ink"
        data-utm-example
        aria-live="polite"
      >{{ rewritten }}</code>
    </div>
    <p class="text-xs text-muted">
      Never added to mail and phone links, to the contact card, to a link to your own site, or over a tag a link already has. One link can opt out: open the block, "Advanced", "No UTM tags on this link".
    </p>
  </fieldset>
</template>
