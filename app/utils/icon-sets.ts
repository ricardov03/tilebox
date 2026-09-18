/**
 * The icon sets tilebox supports. WP18, PLAN.md section 5.5.
 * ONE source of truth: the schema (`types/profile.ts`), the local search and the SVG route
 * (`content/icon-index.ts`), the save check, `scripts/check-icons.ts`, `nuxt.config.ts` and
 * the profile migration all read this list. The order is the search order: `line-md` first.
 * Pure: no Vue or Node imports. The app, the server, the scripts and the tests use it.
 */
export const ICON_SETS = ['line-md', 'simple-icons'] as const

export type IconSet = (typeof ICON_SETS)[number]

/** `line-md and simple-icons`, for messages. */
export const ICON_SETS_TEXT = ICON_SETS.join(' and ')

/** The message of every refusal, so the editor, the scripts and the schema say the same thing. */
export const ICON_SETS_MESSAGE = `Use an icon from ${ICON_SETS.join(' or ')}`

/** Where to browse a set. */
export function iconSetUrl(set: IconSet): string {
  return `https://icones.js.org/collection/${set}`
}

/** A full icon name: an allowed set, a colon, then lower case words joined by single hyphens. */
export const ICON_NAME_RE = new RegExp(`^(${ICON_SETS.join('|')}):[a-z0-9]+(?:-[a-z0-9]+)*$`)

export function isAllowedIconName(name: unknown): name is `${IconSet}:${string}` {
  return typeof name === 'string' && ICON_NAME_RE.test(name)
}

/** The set of a full icon name, or `undefined` when the name is not an allowed one. */
export function iconSetOf(name: unknown): IconSet | undefined {
  if (!isAllowedIconName(name)) return undefined
  const prefix = name.slice(0, name.indexOf(':'))
  return ICON_SETS.find(set => set === prefix)
}
