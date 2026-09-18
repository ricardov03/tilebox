/**
 * Editor state for /edit (WP3). Dev only.
 * Holds a deep-cloned draft of content/profile.json, tracks dirty state,
 * and talks to the dev-only routes in server/api.
 */
import type { Block, BlockType, Profile, Theme } from '~~/types/profile'

export type LayoutKey = 'desktop' | 'mobile'
export type EditorTab = 'profile' | 'blocks' | 'theme' | 'site'
/** Where the inline delete confirm shows: a list row, a preview tile or the block form. */
export type DeleteSource = 'list' | 'tile' | 'form'

export interface DeleteTarget {
  id: string
  where: DeleteSource
}

/** How long "Block deleted. Undo" stays in the save bar. */
export const UNDO_MS = 8000

/** The last deleted block and where it was. Memory only: a reload or a save remount forgets it. */
interface DeletedBlock {
  block: Block
  blockIndex: number
  desktopIndex: number
  /** `null` when there is no mobile layout, -1 when the id was not in it. */
  mobileIndex: number | null
  wasSelected: boolean
}

export const BLOCK_TYPES: readonly BlockType[] = ['link', 'social', 'image', 'text', 'section', 'map', 'video'] as const

/**
 * Grid columns, row height and gap for the preview. Same shape as BentoGrid
 * (`--row`, `--gap`, `auto-rows-auto`, tiles carry their height). The desktop
 * row shrinks with the pane so 4 columns fit next to the panel.
 */
export const PREVIEW_GRID_CLASSES: Record<2 | 4, string> = {
  4: 'grid-cols-4 [--gap:16px] [--row:clamp(120px,13vw,240px)] xl:[--gap:20px]',
  2: 'grid-cols-2 [--gap:12px] [--row:173px]',
}

/** Token focus ring for editor controls (same as the public page). */
export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
export const INPUT_CLASS = `min-h-11 rounded-xl border border-line bg-ground px-3 text-sm text-ink ${FOCUS_RING}`
export const LABEL_CLASS = 'text-sm font-medium text-ink'

/** Narrow an event target to a form control. `null` for anything else. */
export function formControl(event: Event): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return target
  return null
}

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  link: 'Link',
  social: 'Social',
  image: 'Image',
  text: 'Text',
  section: 'Section',
  map: 'Map',
  video: 'Video',
}

/** A fresh block with sensible defaults. Id is `b<timestamp36>`. */
export function newBlock(type: BlockType): Block {
  const id = `b${Date.now().toString(36)}`
  switch (type) {
    case 'link':
      return { id, type, size: '1x1', title: 'New link', url: 'https://example.com' }
    case 'social':
      return { id, type, size: '1x1', network: 'github', url: 'https://github.com/' }
    case 'image':
      return { id, type, size: '2x2', src: '/blocks/sample.jpg', alt: 'Sample image', source: null }
    case 'text':
      return { id, type, size: '1x2', title: 'Note', body: 'Write something.' }
    case 'section':
      return { id, type, title: 'Section' }
    case 'map':
      return { id, type, size: '1x1', label: 'City', sublabel: 'GMT-5', url: 'https://maps.google.com/?q=City' }
    case 'video':
      return { id, type, size: '2x1', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Video' }
  }
}

/** One short line that names a block in lists and preview tiles. */
export function blockSummary(block: Block): string {
  switch (block.type) {
    case 'link': return block.title
    case 'social': return block.label ?? block.network
    case 'image': return block.caption ?? block.alt
    case 'text': return block.title ?? block.body.slice(0, 40)
    case 'section': return block.title
    case 'map': return block.label
    case 'video': return block.title ?? block.url
  }
}

interface SaveResponse {
  ok: true
  restartNeeded: boolean
}

interface ErrorPayload {
  data?: { errors?: string[] }
  statusMessage?: string
  message?: string
}

function errorsOf(error: unknown): string[] {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const payload = (error as { data?: ErrorPayload }).data
    const list = payload?.data?.errors
    if (Array.isArray(list) && list.length) return list
    if (payload?.statusMessage) return [payload.statusMessage]
    if (payload?.message) return [payload.message]
  }
  return [error instanceof Error ? error.message : String(error)]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * UI state that must survive a page remount. Saving writes profile.json,
 * which app.vue imports through useProfile, so Vite HMR remounts the page
 * after every save. sessionStorage keeps the editor where it was.
 */
const STORAGE_KEY = 'tilebox-editor'

interface PersistedUi {
  tab: EditorTab
  layoutKey: LayoutKey
  selectedId: string | null
  lastSavedAt: string | null
  restartNeeded: boolean
}

function readUi(): Partial<PersistedUi> {
  if (!import.meta.client) return {}
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<PersistedUi>) : {}
  }
  catch {
    return {}
  }
}

function writeUi(ui: PersistedUi) {
  if (!import.meta.client) return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ui))
  }
  catch {
    // storage blocked: the editor still works, it just forgets its place on remount
  }
}

export function useEditor() {
  const draft = ref<Profile | null>(null)
  const saved = ref<string>('')
  const loading = ref(true)
  const loadError = ref<string | null>(null)
  const saving = ref(false)
  const errors = ref<string[]>([])
  const ui = readUi()
  const lastSavedAt = ref<Date | null>(ui.lastSavedAt ? new Date(ui.lastSavedAt) : null)
  const restartNeeded = ref(ui.restartNeeded ?? false)

  const tab = ref<EditorTab>(ui.tab ?? 'blocks')
  const layoutKey = ref<LayoutKey>(ui.layoutKey ?? 'desktop')
  const selectedId = ref<string | null>(ui.selectedId ?? null)

  watch([tab, layoutKey, selectedId, lastSavedAt, restartNeeded], () => {
    writeUi({
      tab: tab.value,
      layoutKey: layoutKey.value,
      selectedId: selectedId.value,
      lastSavedAt: lastSavedAt.value?.toISOString() ?? null,
      restartNeeded: restartNeeded.value,
    })
  })

  /** The draft as text. Drives `dirty` and tells the undo notice when the draft changed. */
  const serialized = computed(() => (draft.value === null ? '' : JSON.stringify(draft.value)))
  const dirty = computed(() => draft.value !== null && serialized.value !== saved.value)

  /** The block whose inline "Delete? Yes / No" is open, and where it shows. One at a time. */
  const deleteTarget = ref<DeleteTarget | null>(null)
  const lastDeleted = shallowRef<DeletedBlock | null>(null)
  /** Text for the polite live region in the save bar: "Block deleted." or "Block restored." */
  const notice = ref<string | null>(null)
  /** The draft right after the delete or the undo. Any other draft means "the next change". */
  let noticeDraft = ''
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  const canUndo = computed(() => lastDeleted.value !== null)

  function clearNotice() {
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = undefined
    lastDeleted.value = null
    notice.value = null
  }

  function showNotice(text: string) {
    if (noticeTimer) clearTimeout(noticeTimer)
    notice.value = text
    noticeDraft = draft.value === null ? '' : JSON.stringify(draft.value)
    noticeTimer = setTimeout(clearNotice, UNDO_MS)
  }

  watch(serialized, (value) => {
    if (notice.value !== null && value !== noticeDraft) clearNotice()
  })
  onScopeDispose(clearNotice)

  /** Ids in the current layout. Mobile falls back to desktop (PLAN.md 6). */
  const currentIds = computed<string[]>(() => {
    if (!draft.value) return []
    if (layoutKey.value === 'mobile') return draft.value.layout.mobile ?? draft.value.layout.desktop
    return draft.value.layout.desktop
  })

  /** Blocks in the current layout order. Ids without a block are skipped. */
  const orderedBlocks = computed<Block[]>(() => {
    if (!draft.value) return []
    const byId = new Map(draft.value.blocks.map(b => [b.id, b]))
    return currentIds.value.flatMap((id) => {
      const block = byId.get(id)
      return block ? [block] : []
    })
  })

  const selectedBlock = computed<Block | null>(() =>
    draft.value?.blocks.find(b => b.id === selectedId.value) ?? null,
  )

  async function load() {
    loading.value = true
    loadError.value = null
    try {
      const data = await $fetch<Profile>('/api/profile')
      clearNotice()
      deleteTarget.value = null
      draft.value = clone(data)
      saved.value = JSON.stringify(draft.value)
    }
    catch (error) {
      loadError.value = errorsOf(error).join(' ')
    }
    finally {
      loading.value = false
    }
  }

  async function save() {
    if (!draft.value || saving.value || !dirty.value) return
    saving.value = true
    errors.value = []
    try {
      const res = await $fetch<SaveResponse>('/api/save', { method: 'POST', body: draft.value })
      saved.value = JSON.stringify(draft.value)
      lastSavedAt.value = new Date()
      restartNeeded.value = res.restartNeeded
    }
    catch (error) {
      errors.value = errorsOf(error)
    }
    finally {
      saving.value = false
    }
  }

  function setOrder(ids: string[]) {
    if (!draft.value) return
    if (layoutKey.value === 'mobile') draft.value.layout.mobile = [...ids]
    else draft.value.layout.desktop = [...ids]
  }

  function addBlock(type: BlockType) {
    if (!draft.value) return
    const block = newBlock(type)
    draft.value.blocks.push(block)
    draft.value.layout.desktop.push(block.id)
    draft.value.layout.mobile?.push(block.id)
    selectedId.value = block.id
    tab.value = 'blocks'
  }

  function updateBlock(next: Block) {
    if (!draft.value) return
    const index = draft.value.blocks.findIndex(b => b.id === next.id)
    if (index === -1) return
    draft.value.blocks[index] = next
  }

  /** Open the inline confirm for a block. Nothing is deleted yet. */
  function requestDelete(id: string, where: DeleteSource) {
    if (!draft.value?.blocks.some(b => b.id === id)) return
    deleteTarget.value = { id, where }
  }

  function cancelDelete() {
    deleteTarget.value = null
  }

  /** The one delete action. Removes the block and its id from both layouts, and keeps what Undo needs. */
  function deleteBlock(id: string) {
    if (!draft.value) return
    deleteTarget.value = null
    const blockIndex = draft.value.blocks.findIndex(b => b.id === id)
    const block = draft.value.blocks[blockIndex]
    if (!block) return
    const deleted: DeletedBlock = {
      block: clone(block),
      blockIndex,
      desktopIndex: draft.value.layout.desktop.indexOf(id),
      mobileIndex: draft.value.layout.mobile ? draft.value.layout.mobile.indexOf(id) : null,
      wasSelected: selectedId.value === id,
    }
    draft.value.blocks = draft.value.blocks.filter(b => b.id !== id)
    draft.value.layout.desktop = draft.value.layout.desktop.filter(x => x !== id)
    if (draft.value.layout.mobile) {
      draft.value.layout.mobile = draft.value.layout.mobile.filter(x => x !== id)
    }
    if (selectedId.value === id) selectedId.value = null
    lastDeleted.value = deleted
    showNotice('Block deleted.')
  }

  /** Put the last deleted block back at its old index in `blocks` and in both layouts. Returns its id. */
  function undoDelete(): string | null {
    const deleted = lastDeleted.value
    if (!draft.value || !deleted) return null
    const { block, blockIndex, desktopIndex, mobileIndex, wasSelected } = deleted
    if (draft.value.blocks.some(b => b.id === block.id)) {
      clearNotice()
      return null
    }
    const at = (index: number, length: number) => (index < 0 ? length : Math.min(index, length))
    draft.value.blocks.splice(at(blockIndex, draft.value.blocks.length), 0, block)
    if (desktopIndex !== -1) {
      const desktop = draft.value.layout.desktop
      desktop.splice(at(desktopIndex, desktop.length), 0, block.id)
    }
    const mobile = draft.value.layout.mobile
    if (mobile && mobileIndex !== null && mobileIndex !== -1) {
      mobile.splice(at(mobileIndex, mobile.length), 0, block.id)
    }
    if (wasSelected) selectedId.value = block.id
    lastDeleted.value = null
    showNotice('Block restored.')
    return block.id
  }

  /** Move a block one step in the current layout. `delta` is -1 or 1. */
  function moveBlock(id: string, delta: -1 | 1) {
    const ids = [...currentIds.value]
    const from = ids.indexOf(id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= ids.length) return
    ids.splice(from, 1)
    ids.splice(to, 0, id)
    setOrder(ids)
  }

  function setTheme(theme: Theme) {
    if (!draft.value) return
    draft.value.profile.theme = { ...theme }
  }

  function select(id: string | null) {
    selectedId.value = id
    if (id) tab.value = 'blocks'
  }

  return {
    draft,
    loading,
    loadError,
    saving,
    errors,
    lastSavedAt,
    restartNeeded,
    dirty,
    tab,
    layoutKey,
    selectedId,
    currentIds,
    orderedBlocks,
    selectedBlock,
    deleteTarget,
    notice,
    canUndo,
    load,
    save,
    setOrder,
    addBlock,
    updateBlock,
    requestDelete,
    cancelDelete,
    deleteBlock,
    undoDelete,
    moveBlock,
    setTheme,
    select,
  }
}
