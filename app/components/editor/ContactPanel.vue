<!--
  Site tab (WP11): the contact card (vCard) of the "Save my contact" tile.
  EVERYTHING typed here is PUBLIC: with the switch on, the build writes it to
  `/site/contact.vcf`, a file anyone can download. The private profile email is
  never copied into it: `contact.email` is its own field.
  Text fields are `EditorTextField` (NOTES.md, "Editor input fix"): they keep
  what you type, the check waits until you stop typing, the draft only gets a
  value the schema accepts, and a refused value blocks the save.
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
  { key: 'title', label: 'Role', type: 'text', autocomplete: 'organization-title' },
  { key: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel', placeholder: '+57 300 123 4567' },
  { key: 'email', label: 'Public email', type: 'email', autocomplete: 'off', placeholder: 'hi@your-site.example' },
  { key: 'url', label: 'Website', type: 'url', autocomplete: 'url', placeholder: 'https://your-site.example' },
]
const trim = (raw: string) => raw.trim()

/** One stable check per key, so a render does not give the field a new prop. */
function checkOf(key: TextKey) {
  return (value: string): string | undefined => {
    const result = ContactSchema.shape[key].safeParse(value)
    return result.success ? undefined : (result.error.issues[0]?.message ?? 'Not valid')
  }
}
const checks: Record<TextKey, ReturnType<typeof checkOf>> = {
  fullName: checkOf('fullName'),
  org: checkOf('org'),
  title: checkOf('title'),
  phone: checkOf('phone'),
  email: checkOf('email'),
  url: checkOf('url'),
  note: checkOf('note'),
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

    <EditorTextField
      v-for="field in FIELDS"
      :id="`c-${field.key}`"
      :key="field.key"
      :label="field.label"
      :problem-label="`Contact card, ${field.label}`"
      :type="field.type"
      :maxlength="CONTACT_TEXT_MAX"
      :autocomplete="field.autocomplete"
      :placeholder="field.key === 'fullName' ? profileName : field.placeholder"
      :model-value="contact[field.key]"
      :normalize="trim"
      :validate="checks[field.key]"
      @commit="setContactKey(field.key, $event)"
    />
    <EditorTextField
      id="c-note"
      label="Note"
      problem-label="Contact card, Note"
      multiline
      :rows="2"
      :maxlength="CONTACT_NOTE_MAX"
      :model-value="contact.note"
      :normalize="trim"
      :validate="checks.note"
      @commit="setContactKey('note', $event)"
    />

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
