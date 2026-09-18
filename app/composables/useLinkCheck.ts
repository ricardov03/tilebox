/**
 * Editor state of the dead-link check (WP11). Dev only. "Check links" sends the
 * DRAFT to the dev-only route `POST /api/links/check`; the answer lives in
 * memory only (`useState`): nothing is written to the profile or to disk.
 * Results are keyed by URL, so a badge goes away when the URL of a block changes.
 */
import type { LinkCheckResult } from '~~/content/link-check'
import type { Block, Profile } from '~~/types/profile'

interface LinkCheckState {
  busy: boolean
  error: string | null
  /** Time of the last finished check, as text for the summary line. */
  checkedAt: string | null
  byUrl: Record<string, LinkCheckResult>
}

/** The URL of a block that the check covers. `null` for a block without one. */
export function checkedUrlOf(block: Block): string | null {
  if (block.type === 'link' || block.type === 'social' || block.type === 'map' || block.type === 'video') return block.url
  if (block.type === 'image') return block.source?.url ?? null
  return null
}

export function useLinkCheck() {
  const state = useState<LinkCheckState>('tilebox-link-check', () => ({ busy: false, error: null, checkedAt: null, byUrl: {} }))

  async function run(profile: Profile) {
    if (state.value.busy) return
    state.value.busy = true
    state.value.error = null
    try {
      const res = await $fetch<{ results: LinkCheckResult[] }>('/api/links/check', { method: 'POST', body: profile })
      state.value.byUrl = Object.fromEntries(res.results.map(result => [result.url, result]))
      state.value.checkedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    catch (error) {
      state.value.error = error instanceof Error ? error.message : 'The link check failed'
    }
    finally {
      state.value.busy = false
    }
  }

  function resultFor(block: Block): LinkCheckResult | null {
    const url = checkedUrlOf(block)
    return url ? state.value.byUrl[url] ?? null : null
  }

  const counts = computed(() => {
    const all = Object.values(state.value.byUrl)
    const count = (status: LinkCheckResult['status']) => all.filter(result => result.status === status).length
    return { total: all.length, ok: count('ok'), blocked: count('blocked'), broken: count('broken') }
  })

  return { state, counts, run, resultFor }
}
