/**
 * One text field of the editor (NOTES.md, "Editor input fix"). The rules are in
 * `app/utils/field-draft.ts`; this file makes the state reactive, follows the
 * model, and tells the page about the field so the save bar can list the
 * fields that are "not saved yet" and the save key can check them first.
 */
import type { InjectionKey } from 'vue'
import { createFieldDraft, fieldDraftState, type FieldDraftOptions } from '~/utils/field-draft'

interface FieldDraftEntry {
  label: () => string
  error: () => string | undefined
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
 * is not in the draft. `flushAll()` checks every field with waiting keys now
 * and answers `true` when no field has a problem.
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

  function flushAll(): boolean {
    for (const entry of entries) entry.flush()
    return problems.value.length === 0
  }

  return { problems, flushAll }
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
