<!--
  Site tab (WP11): the contact card (vCard) of the "Save my contact" tile.
  EVERYTHING typed here is PUBLIC: with the switch on, the build writes it to
  `/site/contact.vcf`, a file anyone can download. The private profile email is
  never copied into it: `contact.email` is its own field.
  Text fields keep what you type; the draft only gets a value the schema accepts.
  "Download preview" is the same text the build writes (app/utils/vcard.ts), from the draft.
-->
<script setup lang="ts">
import { CONTACT_NOTE_MAX, CONTACT_TEXT_MAX, contactFileName, ContactSchema } from '~~/types/profile'
import { buildVCard } from '~/utils/vcard'

type TextKey = 'fullName' | 'org' | 'title' | 'phone' | 'email' | 'url' | 'note'

const { draft, contact, setContactKey } = useSiteDraft()

const FIELDS: readonly { key: TextKey, label: string, type: 'text' | 'tel' | 'email' | 'url', autocomplete: string, placeholder?: string }[] = [
  { key: 'fullName', label: 'Full name', type: 'text', autocomplete: 'name' },
  { key: 'org', label: 'Company', type: 'text', autocomplete: 'organization' },
  { key: 'title', label: 'Job title', type: 'text', autocomplete: 'organization-title' },
  { key: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel', placeholder: '+57 300 123 4567' },
  { key: 'email', label: 'Public email', type: 'email', autocomplete: 'off', placeholder: 'hi@your-site.example' },
  { key: 'url', label: 'Website', type: 'url', autocomplete: 'url', placeholder: 'https://your-site.example' },
]
const KEYS: readonly TextKey[] = [...FIELDS.map(field => field.key), 'note']

const text = reactive<Record<TextKey, string>>({ fullName: '', org: '', title: '', phone: '', email: '', url: '', note: '' })
const fieldErrors = reactive<Partial<Record<TextKey, string>>>({})

// Re-sync only when the draft changed from outside (load), not on our own write.
watch(contact, (next) => {
  for (const key of KEYS) {
    if (!fieldErrors[key] && text[key].trim() !== (next[key] ?? '')) text[key] = next[key] ?? ''
  }
}, { immediate: true, deep: true })

function setText(key: TextKey, event: Event) {
  const control = formControl(event)
  if (!control) return
  text[key] = control.value
  const value = control.value.trim()
  if (value !== '') {
    const result = ContactSchema.shape[key].safeParse(value)
    if (!result.success) {
      fieldErrors[key] = result.error.issues[0]?.message ?? 'Not valid'
      return
    }
  }
  Reflect.deleteProperty(fieldErrors, key)
  setContactKey(key, value)
}

function setEnabled(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) setContactKey('enabled', target.checked)
}

const profileName = computed(() => draft.value?.profile.name ?? '')
const hasTile = computed(() => draft.value?.blocks.some(block => block.type === 'contact') ?? false)
const fileName = computed(() => contactFileName(contact.value.fullName ?? profileName.value))
/** The exact text the build writes, as a download link. Made from the draft: no request, no file. */
const previewHref = computed(() => `data:text/vcard;charset=utf-8,${encodeURIComponent(buildVCard(contact.value, profileName.value))}`)

const inputClass = INPUT_CLASS
const labelClass = LABEL_CLASS
</script>

<template>
  <fieldset
    class="flex flex-col gap-3 rounded-2xl border border-line p-3"
    data-contact-panel
  >
    <legend :class="labelClass">
      Contact card
    </legend>
    <p
      class="rounded-xl border border-pop px-3 py-2 text-xs text-ink"
      data-contact-public-note
    >
      <strong class="font-medium">Everything here is public.</strong>
      It goes into a file anyone can download from your page. Your private profile email is not used: type a public one here, or leave it empty.
    </p>
    <label
      for="c-enabled"
      class="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink"
    >
      <input
        id="c-enabled"
        type="checkbox"
        :checked="contact.enabled === true"
        :class="FOCUS_RING"
        class="size-5 accent-[var(--color-accent)]"
        @change="setEnabled"
      >
      Make the contact card (contact.vcf)
    </label>

    <div
      v-for="field in FIELDS"
      :key="field.key"
      class="flex flex-col gap-1"
    >
      <label
        :for="`c-${field.key}`"
        :class="labelClass"
      >{{ field.label }}</label>
      <input
        :id="`c-${field.key}`"
        :value="text[field.key]"
        :type="field.type"
        :maxlength="CONTACT_TEXT_MAX"
        :autocomplete="field.autocomplete"
        :placeholder="field.key === 'fullName' ? profileName : field.placeholder"
        :aria-invalid="fieldErrors[field.key] ? true : undefined"
        :aria-describedby="fieldErrors[field.key] ? `c-${field.key}-error` : undefined"
        :class="inputClass"
        @input="setText(field.key, $event)"
      >
      <p
        v-if="fieldErrors[field.key]"
        :id="`c-${field.key}-error`"
        class="text-xs text-pop"
        role="alert"
      >
        {{ fieldErrors[field.key] }}. Not saved.
      </p>
    </div>

    <div class="flex flex-col gap-1">
      <label
        for="c-note"
        :class="labelClass"
      >Note</label>
      <textarea
        id="c-note"
        :value="text.note"
        rows="2"
        :maxlength="CONTACT_NOTE_MAX"
        :class="inputClass"
        class="py-2"
        @input="setText('note', $event)"
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <a
        :href="previewHref"
        :download="fileName"
        :class="FOCUS_RING"
        class="flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-medium text-ink hover:border-accent"
        data-contact-preview
      >Download preview</a>
      <span class="font-mono text-xs text-muted">{{ fileName }}</span>
    </div>
    <p class="text-xs text-muted">
      <template v-if="!hasTile">
        Add a "Save contact" block in the Blocks tab to put the download on your page.
      </template>
      <template v-else-if="contact.enabled !== true">
        Your page has a "Save contact" tile, but the card is off: the build leaves the tile out.
      </template>
      <template v-else>
        The build writes the card to <code class="font-mono">/site/contact.vcf</code>. No photo inside.
      </template>
    </p>
  </fieldset>
</template>
