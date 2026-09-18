/**
 * WP11. Editor panels that edit top-level keys of the draft (`site.share`,
 * `site.utm`, `contact`) read and write it through this composable. The draft
 * comes from `useEditor()` by provide / inject, so no parent needs a new prop.
 * An object that ends up empty is removed: the schema is strict and the file stays small.
 */
import type { Contact, Profile } from '~~/types/profile'
import type { Site } from '~~/types/site'

function withoutEmpty<T extends object>(value: T): T | undefined {
  return Object.keys(value).length ? value : undefined
}

export function useSiteDraft() {
  const draft = useEditorDraft()
  const site = computed<Site>(() => draft.value?.site ?? {})
  const contact = computed<Contact>(() => draft.value?.contact ?? {})

  function assign<K extends 'site' | 'contact'>(key: K, value: Profile[K]) {
    if (!draft.value) return
    if (value === undefined) Reflect.deleteProperty(draft.value, key)
    else draft.value[key] = value
  }

  /** `undefined` removes the key. */
  function setSiteKey<K extends keyof Site>(key: K, value: Site[K] | undefined) {
    const next: Site = { ...site.value }
    if (value === undefined) Reflect.deleteProperty(next, key)
    else next[key] = value
    assign('site', withoutEmpty(next))
  }

  /** `undefined`, '' and `false` remove the key. */
  function setContactKey<K extends keyof Contact>(key: K, value: Contact[K] | undefined) {
    const next: Contact = { ...contact.value }
    if (value === undefined || value === '' || value === false) Reflect.deleteProperty(next, key)
    else next[key] = value
    assign('contact', withoutEmpty(next))
  }

  return { draft, site, contact, setSiteKey, setContactKey }
}
