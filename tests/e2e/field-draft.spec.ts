/**
 * The state machine of an editor text field (app/utils/field-draft.ts).
 * No browser, no server: a fake model and a fake clock.
 */
import { expect, test } from '@playwright/test'
import { createFieldDraft, FIELD_DEBOUNCE_MS, type FieldDraftOptions } from '../../app/utils/field-draft'

/** A field on a one-value model, with a clock the test moves by hand. */
function setup(initial: string, options: Partial<FieldDraftOptions> = {}) {
  let model = initial
  let now = 0
  let nextHandle = 1
  const timers = new Map<number, { at: number, run: () => void }>()
  const commits: string[] = []
  const field = createFieldDraft({
    model: () => model,
    commit: (value) => {
      commits.push(value)
      model = value
      field.modelChanged(value)
    },
    validate: value => (value.startsWith('https://') && value.includes('.') ? undefined : 'Invalid URL'),
    required: () => true,
    setTimer: (run, ms) => {
      timers.set(nextHandle, { at: now + ms, run })
      return nextHandle++
    },
    clearTimer: handle => timers.delete(handle as number),
    ...options,
  })
  return {
    field,
    commits,
    model: () => model,
    /** A change that does not come from the field. */
    setModel(value: string) {
      model = value
      field.modelChanged(value)
    },
    tick(ms: number) {
      now += ms
      for (const [handle, timer] of [...timers]) {
        if (timer.at > now) continue
        timers.delete(handle)
        timer.run()
      }
    },
    type(text: string, from = '') {
      let typed = from
      for (const key of text) {
        typed += key
        field.input(typed)
        this.tick(30)
      }
    },
  }
}

test('typing through invalid states: no check on a key, the text is never rewritten', () => {
  const t = setup('https://old.example')
  t.field.focus()
  t.field.input('')
  t.type('https://exa')
  expect(t.field.state).toMatchObject({ text: 'https://exa', error: undefined, pending: true })
  expect(t.commits).toEqual([])

  t.tick(FIELD_DEBOUNCE_MS - 31)
  expect(t.field.state.pending).toBe(true)
  t.tick(1)
  expect(t.field.state).toMatchObject({ text: 'https://exa', error: 'Invalid URL', pending: false })
  expect(t.model()).toBe('https://old.example')

  // The next key hides the old message and starts the wait again.
  t.type('mple.com', 'https://exa')
  expect(t.field.state.error).toBeUndefined()
  t.tick(FIELD_DEBOUNCE_MS)
  expect(t.commits).toEqual(['https://example.com'])
  expect(t.field.state).toMatchObject({ text: 'https://example.com', error: undefined, pending: false })
})

test('an empty required field: "Required", the model keeps the last valid value', () => {
  const t = setup('https://old.example')
  t.field.focus()
  t.field.input('')
  t.field.blur()
  expect(t.field.state).toMatchObject({ text: '', error: 'Required', blurred: true, pending: false })
  expect(t.commits).toEqual([])
  expect(t.model()).toBe('https://old.example')
  expect(t.field.flush()).toBe(false)
})

test('an empty optional field commits the empty value', () => {
  const t = setup('A note', { required: () => false, validate: undefined })
  t.field.focus()
  t.field.input('   ')
  t.field.blur()
  expect(t.commits).toEqual([''])
  expect(t.field.state).toMatchObject({ text: '', error: undefined })
})

test('blur, Enter, a paste and flush check at once', () => {
  const t = setup('https://old.example')
  t.field.focus()
  t.field.input('https://a.example')
  t.field.blur()
  expect(t.commits).toEqual(['https://a.example'])

  t.field.focus()
  t.field.input('https://b.example')
  expect(t.field.check()).toBe(true)
  t.field.input('https://c.example', true)
  t.field.input('https://d.example')
  expect(t.field.flush()).toBe(true)
  expect(t.commits).toEqual(['https://a.example', 'https://b.example', 'https://c.example', 'https://d.example'])
  // The timer of the last key is gone: nothing runs twice.
  t.tick(FIELD_DEBOUNCE_MS * 2)
  expect(t.commits).toHaveLength(4)
})

test('a change from outside: taken without the focus, never over the text you type', () => {
  const t = setup('Old title', { validate: undefined })
  t.setModel('Fetched title')
  expect(t.field.state.text).toBe('Fetched title')

  // With the focus but no key yet: there is nothing of yours to keep.
  t.field.focus()
  t.setModel('Fetched again')
  expect(t.field.state.text).toBe('Fetched again')

  t.field.input('Mine')
  t.setModel('Fetched a third time')
  expect(t.field.state.text).toBe('Mine')
  t.tick(FIELD_DEBOUNCE_MS)
  expect(t.model()).toBe('Mine')

  // A refused text goes when the model changes from outside (undo, "Use fetched title").
  t.field.input('')
  t.field.blur()
  expect(t.field.state.error).toBe('Required')
  t.setModel('Restored')
  expect(t.field.state).toMatchObject({ text: 'Restored', error: undefined })
})

test('the stored form shows only after the field lost the focus', () => {
  const t = setup('', { normalize: text => text.trim().replace(/\/+$/, '') })
  t.field.focus()
  t.field.input('https://a.example/')
  t.tick(FIELD_DEBOUNCE_MS)
  expect(t.commits).toEqual(['https://a.example'])
  // You may be about to type a path: the slash stays.
  expect(t.field.state.text).toBe('https://a.example/')
  t.type('docs', 'https://a.example/')
  t.field.blur()
  expect(t.model()).toBe('https://a.example/docs')
  expect(t.field.state.text).toBe('https://a.example/docs')
})

test('a debounced commit, then a blur: the field shows the stored form, not the raw text', () => {
  const t = setup('', { normalize: text => text.trim().replace(/\/+$/, '') })
  t.field.focus()
  t.field.input('  https://a.example/')
  t.tick(FIELD_DEBOUNCE_MS)
  expect(t.commits).toEqual(['https://a.example'])
  // Still typing: the raw text stays.
  expect(t.field.state.text).toBe('  https://a.example/')
  // The blur checks the same value again. Nothing new is committed, and the input still follows the model.
  t.field.blur()
  expect(t.commits).toEqual(['https://a.example'])
  expect(t.field.state).toMatchObject({ text: 'https://a.example', error: undefined, pending: false })
})

test('a refused value keeps its raw text on a blur', () => {
  const t = setup('https://old.example', { normalize: text => text.trim() })
  t.field.focus()
  t.field.input('  not a url ')
  t.field.blur()
  expect(t.commits).toEqual([])
  expect(t.field.state).toMatchObject({ text: '  not a url ', error: 'Invalid URL' })
})

test('after dispose nothing is committed', () => {
  const t = setup('https://old.example')
  t.field.focus()
  t.field.input('https://new.example')
  t.field.dispose()
  t.tick(FIELD_DEBOUNCE_MS)
  t.field.blur()
  expect(t.commits).toEqual([])
})
