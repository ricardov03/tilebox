<!--
  "Advanced" part of the block form (WP11). ONE include in BlockForm.vue.
  - Schedule: two `datetime-local` inputs in this machine's time zone, stored as
    ISO 8601 with this machine's offset (`startsAt`, `endsAt`), a clear button
    each, and a status badge: Live / Scheduled from <date> / Ends <date> / Expired.
  - "No UTM tags on this link" (`noUtm`) for link, social, map and video blocks.
  Every change builds the whole block, runs it through BlockSchema and emits it
  only when valid (same rule as BlockForm.vue). A refused value shows an error
  under the field and is not emitted.
  The page is static: the BUILD applies the schedule. The note under the fields says so.
-->
<script setup lang="ts">
import { BlockSchema, type Block } from '~~/types/profile'
import { UI_ICONS } from '~/utils/networks'
import { isoToLocalInput, localInputToIso, scheduleState, type ScheduleState } from '~/utils/schedule'

type DateKey = 'startsAt' | 'endsAt'

const props = defineProps<{ block: Block }>()
const emit = defineEmits<{ 'update:block': [block: Block] }>()

const local = reactive<Record<DateKey, string>>({ startsAt: '', endsAt: '' })
const error = ref<string | null>(null)

// Re-sync from the block (another block selected, a load). A refused value stays in its field.
watch(() => [props.block.id, props.block.startsAt, props.block.endsAt] as const, ([id], previous) => {
  if (previous && previous[0] !== id) error.value = null
  if (error.value) return
  local.startsAt = isoToLocalInput(props.block.startsAt)
  local.endsAt = isoToLocalInput(props.block.endsAt)
}, { immediate: true })

/** Merge, validate, emit. `undefined` removes the key (strict schema, no empty values). */
function patch(changes: Partial<Record<DateKey | 'noUtm', string | boolean | undefined>>): boolean {
  const next: Record<string, unknown> = { ...props.block }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '' || value === false) Reflect.deleteProperty(next, key)
    else next[key] = value
  }
  const result = BlockSchema.safeParse(next)
  if (!result.success) {
    error.value = result.error.issues[0]?.message ?? 'Not valid'
    return false
  }
  error.value = null
  emit('update:block', result.data)
  return true
}

function setDate(key: DateKey, event: Event) {
  const control = formControl(event)
  if (!control) return
  local[key] = control.value
  // Both fields go in: after a refused value the other field may hold text the block does not have yet.
  patch({
    startsAt: local.startsAt ? localInputToIso(local.startsAt) : undefined,
    endsAt: local.endsAt ? localInputToIso(local.endsAt) : undefined,
  })
}

function clearDate(key: DateKey) {
  local[key] = ''
  patch({
    startsAt: local.startsAt ? localInputToIso(local.startsAt) : undefined,
    endsAt: local.endsAt ? localInputToIso(local.endsAt) : undefined,
  })
}

function setNoUtm(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) patch({ noUtm: target.checked })
}

/** The badge follows the clock while the form is open. */
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  now.value = new Date()
  timer = setInterval(() => {
    now.value = new Date()
  }, 30_000)
})
onBeforeUnmount(() => clearInterval(timer))

const state = computed<ScheduleState>(() => scheduleState(props.block, now.value))
const formatDate = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')
const badge = computed(() => {
  switch (state.value) {
    case 'scheduled': return `Scheduled from ${formatDate(props.block.startsAt)}`
    case 'expired': return 'Expired'
    case 'ends': return `Ends ${formatDate(props.block.endsAt)}`
    default: return 'Live'
  }
})
const hasUrl = computed(() => props.block.type === 'link' || props.block.type === 'social' || props.block.type === 'map' || props.block.type === 'video')
const noUtm = computed(() => ('noUtm' in props.block ? props.block.noUtm === true : false))

const fid = (name: string) => `adv-${props.block.id}-${name}`
const FIELDS: readonly { key: DateKey, label: string }[] = [
  { key: 'startsAt', label: 'Show from' },
  { key: 'endsAt', label: 'Show until' },
]
const clearClass = `min-h-11 shrink-0 rounded-full border border-line px-3 text-xs font-medium text-ink hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`
</script>

<template>
  <fieldset
    class="flex flex-col gap-3 rounded-2xl border border-line p-3"
    data-block-advanced
  >
    <legend :class="LABEL_CLASS">
      Advanced
    </legend>

    <div class="flex items-center justify-between gap-2">
      <span :class="LABEL_CLASS">Schedule</span>
      <span
        class="flex items-center gap-1 rounded-full border border-line bg-tile px-2 py-1 font-mono text-xs text-ink"
        data-schedule-badge
        :data-schedule-state="state"
      >
        <Icon
          v-if="state !== 'live'"
          :name="UI_ICONS.schedule"
          class="size-4"
          :aria-hidden="true"
        />
        {{ badge }}
      </span>
    </div>

    <div
      v-for="field in FIELDS"
      :key="field.key"
      class="flex flex-col gap-1"
    >
      <label
        :for="fid(field.key)"
        :class="LABEL_CLASS"
      >{{ field.label }}</label>
      <div class="flex items-center gap-2">
        <input
          :id="fid(field.key)"
          :value="local[field.key]"
          type="datetime-local"
          :data-schedule-input="field.key"
          :aria-describedby="fid('help')"
          :class="INPUT_CLASS"
          class="min-w-0 flex-1"
          @change="setDate(field.key, $event)"
        >
        <button
          type="button"
          :class="clearClass"
          :disabled="!local[field.key]"
          :aria-label="`Clear ${field.label.toLowerCase()}`"
          :data-schedule-clear="field.key"
          @click="clearDate(field.key)"
        >
          Clear
        </button>
      </div>
    </div>
    <p
      v-if="error"
      class="text-xs text-pop"
      role="alert"
      data-schedule-error
    >
      {{ error }}. Not saved.
    </p>
    <p
      :id="fid('help')"
      class="text-xs text-muted"
    >
      Times are in the time zone of this computer. The page is static: a block that starts later shows only after you publish again after that time. A block that ends hides itself on the page at that time, and the next publish removes it.
    </p>

    <label
      v-if="hasUrl"
      :for="fid('noutm')"
      class="flex min-h-11 cursor-pointer items-center gap-3 border-t border-line pt-3 text-sm font-medium text-ink"
    >
      <input
        :id="fid('noutm')"
        type="checkbox"
        :checked="noUtm"
        data-no-utm
        :class="FOCUS_RING"
        class="size-5 accent-[var(--color-accent)]"
        @change="setNoUtm"
      >
      No UTM tags on this link
    </label>
  </fieldset>
</template>
