<!--
  Fields of the two WP11 block types. ONE include in BlockForm.vue; it renders
  nothing for the other types.
  - `contact` ("Save my contact"): title, description, icon. The vCard fields
    live in the Site tab ("Contact card"), because they are one per profile.
  - `qr` (QR code of the page): caption. Sizes 1x1 and 2x2 only (the schema refuses the rest).
  Text fields are `EditorTextField` (NOTES.md, "Editor input fix"), with a `key`
  that holds the block id: the check waits until you stop typing, and only a
  value the schema accepts is emitted. An emptied field removes its key.
  Every change builds the whole block, runs it through BlockSchema and emits it only when valid.
-->
<script setup lang="ts">
import { BlockSchema, type Block } from '~~/types/profile'

const props = defineProps<{ block: Block }>()
const emit = defineEmits<{ 'update:block': [block: Block] }>()

const error = ref<string | null>(null)
watch(() => props.block.id, () => {
  error.value = null
})

/** Merge, validate, emit. `undefined` or '' removes the key. */
function patch(changes: Record<string, string | undefined>) {
  const next: Record<string, unknown> = { ...props.block }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') Reflect.deleteProperty(next, key)
    else next[key] = value
  }
  const result = BlockSchema.safeParse(next)
  if (!result.success) {
    error.value = result.error.issues[0]?.message ?? 'Not valid'
    return
  }
  error.value = null
  emit('update:block', result.data)
}

/** Why the schema refuses `value` for one key of this block, or `undefined`. */
function fieldError(key: string, value: string): string | undefined {
  const result = BlockSchema.safeParse({ ...props.block, [key]: value })
  if (result.success) return undefined
  return result.error.issues.find(issue => issue.path[0] === key)?.message
}

/** One stable function per key, so a render does not give the field a new prop. */
const checks = {
  title: (value: string) => fieldError('title', value),
  description: (value: string) => fieldError('description', value),
  caption: (value: string) => fieldError('caption', value),
}

const fid = (name: string) => `extra-${props.block.id}-${name}`
</script>

<template>
  <template v-if="block.type === 'contact'">
    <EditorTextField
      :id="fid('title')"
      :key="fid('title')"
      label="Title"
      placeholder="Save my contact"
      :model-value="block.title"
      :validate="checks.title"
      @commit="patch({ title: $event })"
    />
    <EditorTextField
      :id="fid('description')"
      :key="fid('description')"
      label="Description"
      :model-value="block.description"
      :validate="checks.description"
      @commit="patch({ description: $event })"
    />
    <EditorIconPicker
      :id="fid('icon')"
      :key="fid('icon')"
      :model-value="block.icon"
      label="Icon (default: line-md:account)"
      @update:model-value="patch({ icon: $event })"
    />
    <p class="text-xs text-muted">
      The tile downloads your contact card. Fill it in the Site tab, "Contact card". While the card is off, the build leaves this tile out.
    </p>
  </template>

  <template v-else-if="block.type === 'qr'">
    <EditorTextField
      :id="fid('caption')"
      :key="fid('caption')"
      label="Caption"
      placeholder="Default: the address of your site"
      :model-value="block.caption"
      :validate="checks.caption"
      @commit="patch({ caption: $event })"
    />
    <p class="text-xs text-muted">
      Sizes: 1x1 and 2x2. The build draws the code from your site address (Site tab). Without an address the build leaves this tile out.
    </p>
  </template>

  <p
    v-if="error"
    class="text-xs text-pop"
    role="alert"
  >
    {{ error }}. Not saved.
  </p>
</template>
