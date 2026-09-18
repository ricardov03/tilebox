/**
 * The state machine of one editor text field (NOTES.md, "Editor input fix").
 * Pure: no Vue, no DOM. `useFieldDraft()` gives it a reactive `state`, the
 * tests give it a plain object and fake timers.
 *
 * Rules:
 * - `state.text` is what the input shows. Only the user writes it, plus a
 *   change of the model from OUTSIDE (undo, "Use fetched title", a reload)
 *   while the user is not typing in the field.
 * - The check runs `delay` ms after the last key, and at once on blur, Enter,
 *   a paste and `flush()` (the save key). Never on every key.
 * - A value that passes is committed. A value that fails is not: the text
 *   stays, `state.error` says why, the model keeps its last valid value.
 * - Empty + required = the error "Required". Empty + optional = `commit('')`.
 */

/** How long the check waits after the last key. */
export const FIELD_DEBOUNCE_MS = 600
export const FIELD_REQUIRED_MESSAGE = 'Required'

export interface FieldDraftState {
  /** What the input shows. */
  text: string
  /** Why the text is not in the model. `undefined` = no problem. */
  error: string | undefined
  /** Keys were typed and the check did not run yet. */
  pending: boolean
  focused: boolean
  /** The user changed the text since the field got the focus. */
  edited: boolean
  /** The field lost the focus at least once: an error may be announced (`role="alert"`). */
  blurred: boolean
}

export interface FieldDraftOptions {
  /** The value in the model now. '' when the key is absent. */
  model: () => string
  /** Called with a value that passed the check and differs from the model. '' = an emptied optional field. */
  commit: (value: string) => void
  /** The reason a non-empty value is refused, or `undefined`. */
  validate?: (value: string) => string | undefined
  /** An empty value is an error. */
  required?: () => boolean
  /** Text to value: trim a URL, drop the `@` of a handle. The input keeps the raw text. */
  normalize?: (text: string) => string
  delay?: number
  /** Timers can be replaced in tests. */
  setTimer?: (run: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface FieldDraft {
  state: FieldDraftState
  /** The user typed. `now` = check at once (a paste). */
  input: (text: string, now?: boolean) => void
  focus: () => void
  /** Check now, then let the model in again. */
  blur: () => void
  /** Check now (Enter). `true` = no error. */
  check: () => boolean
  /** Check now only when keys are waiting (the save key). `true` = no error. */
  flush: () => boolean
  /** The model has a new value. */
  modelChanged: (value: string) => void
  /** Stop the timer. Nothing is committed after this. */
  dispose: () => void
}

export function fieldDraftState(text: string): FieldDraftState {
  return { text, error: undefined, pending: false, focused: false, edited: false, blurred: false }
}

export function createFieldDraft(options: FieldDraftOptions, state: FieldDraftState = fieldDraftState(options.model())): FieldDraft {
  const delay = options.delay ?? FIELD_DEBOUNCE_MS
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms))
  const clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>))
  let timer: unknown
  let disposed = false
  /** The last value this field committed. The model change that follows is our own, not one from outside. */
  let lastCommitted: string | undefined

  function stopTimer() {
    if (timer !== undefined) clearTimer(timer)
    timer = undefined
  }

  function commit(value: string) {
    if (value === options.model()) return
    lastCommitted = value
    options.commit(value)
  }

  function check(): boolean {
    stopTimer()
    if (disposed) return state.error === undefined
    state.pending = false
    const value = options.normalize ? options.normalize(state.text) : state.text
    if (value.trim() === '') {
      if (options.required?.()) {
        state.error = FIELD_REQUIRED_MESSAGE
        return false
      }
      state.error = undefined
      commit('')
      return true
    }
    const reason = options.validate?.(value)
    if (reason !== undefined) {
      state.error = reason
      return false
    }
    state.error = undefined
    commit(value)
    return true
  }

  function input(text: string, now = false) {
    if (disposed) return
    state.text = text
    state.edited = true
    // No message while the user types: the old one is about the old text.
    state.error = undefined
    state.pending = true
    stopTimer()
    if (now) check()
    else timer = setTimer(check, delay)
  }

  function focus() {
    state.focused = true
  }

  function blur() {
    state.focused = false
    // An untouched field has nothing new to check, and its text may be older than the model.
    if (state.edited || state.pending) check()
    state.edited = false
    state.blurred = true
  }

  function flush(): boolean {
    return state.pending ? check() : state.error === undefined
  }

  function take(value: string) {
    stopTimer()
    state.text = value
    state.error = undefined
    state.pending = false
    state.edited = false
  }

  function modelChanged(value: string) {
    if (disposed) return
    if (value === lastCommitted) {
      // Our own commit. Without the focus the input may show the stored form (a trimmed URL).
      if (!state.focused) take(value)
      return
    }
    lastCommitted = undefined
    // From outside. The text the user is typing wins: the next check commits it over this value.
    if (state.focused && state.edited) return
    take(value)
  }

  function dispose() {
    stopTimer()
    disposed = true
  }

  return { state, input, focus, blur, check, flush, modelChanged, dispose }
}
