<!--
  The one text field of the editor (NOTES.md, "Editor input fix"): label,
  input or textarea, inline error. The input shows a LOCAL text, never the
  model, so a re-render cannot rewrite what you type. The check waits 600 ms
  after the last key and runs at once on blur, Enter and a paste. A value that
  passes is emitted with `commit` ('' = an emptied optional field). A value that
  fails is not emitted: the text stays and the reason shows under the field.
  Use it with a `key` when the same form shows another record (BlockForm).
-->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  id: string
  label: string
  /** The value in the draft. `undefined` and `null` mean "no key". */
  modelValue?: string | null
  /** An empty value is refused with "Required". */
  required?: boolean
  /** Shows "(required)" after the label. */
  requiredMark?: boolean
  type?: 'text' | 'url' | 'email' | 'tel'
  multiline?: boolean
  rows?: number
  /** The reason a non-empty value is refused, or `undefined`. */
  validate?: (value: string) => string | undefined
  /** Text to value. Default: a URL and an email are trimmed. */
  normalize?: (text: string) => string
  /** The label is for screen readers only. */
  labelHidden?: boolean
  /** The name in the save bar, when the label alone says too little. */
  problemLabel?: string
  /** Shows `typed/max` after the input, and is the `maxlength`. */
  counter?: number
  maxlength?: number
  mono?: boolean
  /** Id of a help text that is always there. */
  describedby?: string
}>(), {
  modelValue: undefined,
  type: 'text',
  rows: 4,
  validate: undefined,
  normalize: undefined,
  problemLabel: undefined,
  counter: undefined,
  maxlength: undefined,
  describedby: undefined,
})

const emit = defineEmits<{
  /** A checked value. '' = the field is empty (optional fields only). */
  commit: [value: string]
  paste: []
  focus: []
  /** After the check that the blur runs. */
  blur: []
}>()

function normalizeText(text: string): string {
  if (props.normalize) return props.normalize(text)
  return props.type === 'text' ? text : text.trim()
}

const field = useFieldDraft({
  model: () => props.modelValue ?? '',
  commit: value => emit('commit', value),
  validate: value => props.validate?.(value),
  required: () => props.required,
  normalize: normalizeText,
  label: () => props.problemLabel ?? props.label,
})
const state = field.state

/** A paste is a whole value, not a key: the `input` event that follows is checked at once. */
let pasted = false

function onPaste() {
  pasted = true
  // A paste that changes nothing fires no `input`.
  setTimeout(() => {
    pasted = false
  }, 100)
  emit('paste')
}

function onInput(event: Event) {
  const control = formControl(event)
  if (!control) return
  field.input(control.value, pasted)
  pasted = false
}

function onFocus() {
  field.focus()
  emit('focus')
}

function onBlur() {
  field.blur()
  emit('blur')
}

defineExpose({
  /** What the input shows now: a refused text is here and not in the draft. */
  text: () => state.text,
  /** The parent set the model to `value`. The field follows by the rules of a change from outside, also when the model did not change (a refused text over the same value). */
  sync: (value: string) => field.modelChanged(value),
})

const errorId = computed(() => `${props.id}-error`)
const describedBy = computed(() => [state.error ? errorId.value : '', props.describedby ?? ''].filter(Boolean).join(' ') || undefined)
const controlClass = computed(() => [INPUT_CLASS, 'min-w-0 flex-1', props.mono ? 'font-mono' : '', props.multiline ? 'py-2' : ''])
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1">
    <label
      :for="id"
      :class="labelHidden ? 'sr-only' : LABEL_CLASS"
    >{{ label }}<span
      v-if="requiredMark"
      class="font-normal text-muted"
    > (required)</span></label>
    <div
      class="flex gap-2"
      :class="multiline ? 'items-start' : 'items-center'"
    >
      <textarea
        v-if="multiline"
        v-bind="$attrs"
        :id="id"
        :value="state.text"
        :rows="rows"
        :required="required || undefined"
        :maxlength="counter ?? maxlength"
        :aria-invalid="state.error ? 'true' : undefined"
        :aria-describedby="describedBy"
        :data-pending="state.pending ? '' : undefined"
        :class="controlClass"
        @input="onInput"
        @paste="onPaste"
        @focus="onFocus"
        @blur="onBlur"
      />
      <input
        v-else
        v-bind="$attrs"
        :id="id"
        :value="state.text"
        :type="type"
        :required="required || undefined"
        :maxlength="counter ?? maxlength"
        :aria-invalid="state.error ? 'true' : undefined"
        :aria-describedby="describedBy"
        :data-pending="state.pending ? '' : undefined"
        :class="controlClass"
        @input="onInput"
        @paste="onPaste"
        @focus="onFocus"
        @blur="onBlur"
        @keydown.enter="field.check()"
      >
      <span
        v-if="counter !== undefined"
        class="w-14 shrink-0 text-right font-mono text-xs text-muted"
        :class="multiline ? 'pt-2' : ''"
        aria-hidden="true"
      >{{ state.text.length }}/{{ counter }}</span>
    </div>
    <!-- An alert only after the first blur: a message that comes while you type is not read out over your keys. -->
    <p
      v-if="state.error"
      :id="errorId"
      data-field-error
      class="font-mono text-xs text-pop"
      :role="state.blurred ? 'alert' : undefined"
    >
      {{ state.error }}
    </p>
    <slot />
  </div>
</template>
