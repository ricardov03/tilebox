<!--
  Fields of the two WP11 block types. ONE include in BlockForm.vue; it renders
  nothing for the other types.
  - `contact` ("Save my contact"): title, description, icon. The vCard fields
    live in the Site tab ("Contact card"), because they are one per profile.
  - `qr` (QR code of the page): caption. Sizes 1x1 and 2x2 only (the schema refuses the rest).
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

const text = (event: Event) => formControl(event)?.value ?? ''
const fid = (name: string) => `extra-${props.block.id}-${name}`
</script>

<template>
  <template v-if="block.type === 'contact'">
    <div class="flex flex-col gap-1">
      <label
        :for="fid('title')"
        :class="LABEL_CLASS"
      >Title</label>
      <input
        :id="fid('title')"
        :value="block.title ?? ''"
        type="text"
        placeholder="Save my contact"
        :class="INPUT_CLASS"
        @input="patch({ title: text($event) })"
      >
    </div>
    <div class="flex flex-col gap-1">
      <label
        :for="fid('description')"
        :class="LABEL_CLASS"
      >Description</label>
      <input
        :id="fid('description')"
        :value="block.description ?? ''"
        type="text"
        :class="INPUT_CLASS"
        @input="patch({ description: text($event) })"
      >
    </div>
    <EditorIconPicker
      :id="fid('icon')"
      :model-value="block.icon"
      label="Icon (default: line-md:account)"
      @update:model-value="patch({ icon: $event })"
    />
    <p class="text-xs text-muted">
      The tile downloads your contact card. Fill it in the Site tab, "Contact card". While the card is off, the build leaves this tile out.
    </p>
  </template>

  <template v-else-if="block.type === 'qr'">
    <div class="flex flex-col gap-1">
      <label
        :for="fid('caption')"
        :class="LABEL_CLASS"
      >Caption</label>
      <input
        :id="fid('caption')"
        :value="block.caption ?? ''"
        type="text"
        placeholder="Default: the address of your site"
        :class="INPUT_CLASS"
        @input="patch({ caption: text($event) })"
      >
    </div>
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
