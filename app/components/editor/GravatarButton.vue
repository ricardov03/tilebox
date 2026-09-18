<!--
  "Use my Gravatar". Calls the dev-only route POST /api/avatar/gravatar with
  the draft's email. On `saved` it emits `saved`, and the page clears
  `profile.avatar` so the Gravatar file is used. The result shows inline.
-->
<script setup lang="ts">
const props = defineProps<{ email: string }>()
const emit = defineEmits<{ saved: [] }>()

type Status = 'saved' | 'none' | 'offline'

const MESSAGES: Record<Status, string> = {
  saved: 'Gravatar saved. It is your avatar now. Save to keep it.',
  none: 'No Gravatar for this email. Make one at gravatar.com or upload a picture.',
  offline: 'Could not reach Gravatar. The old file stays.',
}

const busy = ref(false)
const message = ref<string | null>(null)
const failed = ref(false)

function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: { statusMessage?: string } }).data
    if (data?.statusMessage) return data.statusMessage
  }
  return error instanceof Error ? error.message : 'The request failed.'
}

async function run() {
  if (busy.value) return
  busy.value = true
  message.value = null
  try {
    const res = await $fetch<{ status: Status }>('/api/avatar/gravatar', { method: 'POST', body: { email: props.email } })
    failed.value = res.status !== 'saved'
    message.value = MESSAGES[res.status]
    if (res.status === 'saved') emit('saved')
  }
  catch (error) {
    failed.value = true
    message.value = messageOf(error)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <button
      type="button"
      :disabled="busy"
      :class="FOCUS_RING"
      class="min-h-11 self-start rounded-full border border-line bg-ground px-4 text-sm font-medium text-ink hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
      @click="run"
    >
      {{ busy ? 'Asking Gravatar...' : 'Use my Gravatar' }}
    </button>
    <p
      v-if="message"
      :class="failed ? 'text-pop' : 'text-muted'"
      class="text-xs"
      role="status"
    >
      {{ message }}
    </p>
  </div>
</template>
