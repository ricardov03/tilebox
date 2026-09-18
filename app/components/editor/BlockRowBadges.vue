<!--
  Small badges of one block in the editor (WP11). ONE include in BlockList.vue
  (a row) and one in PreviewTile.vue (`schedule-only`, over the tile).
  - Schedule: a calendar badge for a block that is scheduled, has an end date, or expired.
  - Link check: ok / blocked / broken with the reason, from the last "Check links" (memory only).
  - Incomplete (WP17): "Incomplete: add a URL" for a block without its essential value, in the row AND on
    the tile. The block saves like any other; the build leaves it out (`incompleteReason()` in types/profile.ts).
  Renders nothing for a block with none of them.
-->
<script setup lang="ts">
import { incompleteMessage, type Block } from '~~/types/profile'
import { UI_ICONS } from '~/utils/networks'
import { scheduleState } from '~/utils/schedule'

const props = withDefaults(defineProps<{
  block: Block
  /** The preview tile: the schedule badge only. */
  scheduleOnly?: boolean
}>(), { scheduleOnly: false })

const { resultFor } = useLinkCheck()

/** Set on the client: the server render has no clock, so no badge can differ at hydration. */
const now = ref<Date | null>(null)
onMounted(() => {
  now.value = new Date()
})

const SCHEDULE_LABELS = { scheduled: 'Scheduled', ends: 'Ends', expired: 'Expired' } as const
const schedule = computed(() => {
  if (!now.value || (!props.block.startsAt && !props.block.endsAt)) return null
  const state = scheduleState(props.block, now.value)
  return state === 'live' ? null : { state, label: SCHEDULE_LABELS[state] }
})

const incomplete = computed(() => incompleteMessage(props.block))
const link = computed(() => (props.scheduleOnly ? null : resultFor(props.block)))
const LINK_CLASSES = { ok: 'border-line text-muted', blocked: 'border-line text-ink', broken: 'border-pop text-ink' } as const
const badgeClass = 'flex items-center gap-1 rounded-full border bg-tile px-2 py-0.5 font-mono text-xs'
</script>

<template>
  <span
    v-if="schedule || link || incomplete"
    class="flex flex-wrap items-center gap-1"
  >
    <span
      v-if="incomplete"
      :class="badgeClass"
      class="border-line text-ink"
      data-incomplete-badge
    >
      {{ incomplete }}
    </span>
    <span
      v-if="schedule"
      :class="badgeClass"
      class="border-line text-ink"
      data-schedule-row-badge
      :data-schedule-state="schedule.state"
    >
      <Icon
        :name="UI_ICONS.schedule"
        class="size-4"
        :aria-hidden="true"
      />
      {{ schedule.label }}
    </span>
    <span
      v-if="link"
      :class="[badgeClass, LINK_CLASSES[link.status]]"
      :title="link.reason"
      data-link-badge
      :data-link-status="link.status"
    >
      {{ link.status }}<span class="sr-only">: </span><span
        v-if="link.status !== 'ok'"
        class="max-w-40 truncate"
      >· {{ link.reason }}</span>
    </span>
  </span>
</template>
