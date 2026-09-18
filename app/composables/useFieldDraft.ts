/**
 * One text field of the editor (NOTES.md, "Editor input fix"). The rules are in
 * `app/utils/field-draft.ts`; this file makes the state reactive, follows the
 * model, and tells the page about the field so the save bar can list the
 * values that were "not saved" and the save key can check the fields first.
 * A field never blocks the save (WP17).
 */
import type { InjectionKey } from 'vue'
import { createFieldDraft, fieldDraftState, type FieldDraftOptions } from '~/utils/field-draft'

interface FieldDraftEntry {
  label: () => string
  error: () => string | undefined
  /** The field is empty and the model kept its last valid value (`keepLast`). */
  kept: () => boolean
  flush: () => boolean
}

interface FieldDraftRegistry {
  add: (entry: FieldDraftEntry) => void
  remove: (entry: FieldDraftEntry) => void
}

const REGISTRY_KEY: InjectionKey<FieldDraftRegistry> = Symbol('tilebox-field-drafts')
const GROUP_KEY: InjectionKey<string> = Symbol('tilebox-field-draft-group')

/**
 * The page calls this once. `problems` = one line per mounted field whose text
 * is not in the draft (a FORMAT error). `kept` = one line per emptied field that
 * kept its last value (the name). `flushAll()` checks every field with waiting
 * keys now. The save goes on in every case: it writes everything else.
 */
export function provideFieldDrafts() {
  const entries = shallowReactive(new Set<FieldDraftEntry>())
  provide(REGISTRY_KEY, {
    add: entry => entries.add(entry),
    remove: entry => entries.delete(entry),
  })

  const problems = computed(() => [...entries].flatMap((entry) => {
    const error = entry.error()
    return error === undefined ? [] : [`${entry.label()}: ${error}`]
  }))

  const kept = computed(() => [...entries].flatMap((entry) => {
    if (!entry.kept()) return []
    const label = entry.label()
    const name = (label.split(' > ').pop() ?? label)
    return [`${name} is empty: kept the last saved ${name.toLowerCase()}`]
  }))

  function flushAll(): void {
    for (const entry of entries) entry.flush()
  }

  return { problems, kept, flushAll }
}

/** The tab of the fields below this component. The save bar shows it in front of the label: "Blocks > URL". */
export function provideFieldDraftGroup(name: string) {
  provide(GROUP_KEY, name)
}

export interface UseFieldDraftOptions extends Omit<FieldDraftOptions, 'setTimer' | 'clearTimer'> {
  /** The name of the field in the save bar. */
  label: () => string
}

export function useFieldDraft(options: UseFieldDraftOptions) {
  const state = reactive(fieldDraftState(options.model()))
  const field = createFieldDraft(options, state)
  const registry = inject(REGISTRY_KEY, null)
  const group = inject(GROUP_KEY, '')

  watch(options.model, value => field.modelChanged(value))

  const entry: FieldDraftEntry = {
    label: () => (group ? `${group} > ${options.label()}` : options.label()),
    error: () => state.error,
    kept: () => state.kept,
    flush: field.flush,
  }
  onMounted(() => registry?.add(entry))
  onBeforeUnmount(() => {
    // The form may already show another block: nothing is committed from here on.
    field.dispose()
    registry?.remove(entry)
  })

  return field
}
