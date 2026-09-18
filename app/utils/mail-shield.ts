/**
 * Email spam shield (WP17). PLAN.md section 6.
 *
 * The problem the owner named: "I don't want my email inbox to get dynamite of
 * spam." Harvesters read the HTML of a page and collect every `mailto:` and
 * every `name@host` they find. So the built site carries NEITHER: it carries a
 * TOKEN, and the page turns that token back into an address in memory, in the
 * browser, after a real person moved, typed, scrolled or tapped.
 *
 * The token: the local part and the domain are each REVERSED and then
 * base64url encoded, so no file of `dist/` holds the address, a part of it, or
 * the string `mailto:`. `q` is the same treatment for a query (`subject=Hi`).
 * This is NOT encryption and never pretends to be: it is a shape no harvester
 * regex matches, and anything the browser can read a determined bot can read
 * too. README, "Email protection", says so in plain words.
 *
 * Pure and client safe: no Node, no Vue, no network. base64 is written out by
 * hand (no `Buffer`, no `btoa`: `btoa` cannot take a unicode string, and
 * `Buffer` does not exist in a browser). `types/profile.ts`, the public
 * components and the scripts all import this file.
 */

/** What ships instead of an address. Never a raw address, never `mailto:`. */
export interface MailToken {
  /** The local part (before the `@`), reversed, then base64url. */
  u: string
  /** The domain (after the `@`), reversed, then base64url. */
  d: string
  /** A query without its `?` (`subject=Hello`), reversed, then base64url. Absent = no query. */
  q?: string
}

export class MailShieldError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MailShieldError'
  }
}

/**
 * The scheme the shield removes from the public data, built from its code points.
 * The string itself must be in NO file of `dist/` (docs/invariants.md): a harvester
 * greps for it. A literal here would end up in a JS chunk, and the check would
 * fail for the right reason. Same for every message of this feature: they say
 * "a mail link", never the scheme. `.map()` on purpose: the minifier folds
 * `String.fromCharCode(109, 97, ...)` straight back into the literal.
 */
export const MAILTO_PREFIX: string = [109, 97, 105, 108, 116, 111, 58].map(code => String.fromCharCode(code)).join('')

/**
 * What a harvester looks for. ONE rule for the guard of `PublicProfileSchema`,
 * `check:profile` and the tests. The first group is the character in front:
 * a local part that follows a letter, a digit or a `/` is part of a URL path
 * (`https://mastodon.social/@ada`), not an address.
 */
export const RAW_EMAIL_PATTERN = /(^|[^A-Za-z0-9._%+\-/])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}/

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** base64url without padding. */
function toBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at] ?? 0
    const b = bytes[at + 1]
    const c = bytes[at + 2]
    const word = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += ALPHABET[(word >> 18) & 63]
    out += ALPHABET[(word >> 12) & 63]
    if (b !== undefined) out += ALPHABET[(word >> 6) & 63]
    if (c !== undefined) out += ALPHABET[word & 63]
  }
  return out
}

function fromBase64Url(text: string): Uint8Array {
  const values: number[] = []
  for (const char of text) {
    const value = ALPHABET.indexOf(char)
    if (value === -1) throw new MailShieldError(`mail token: "${char}" is not base64url`)
    values.push(value)
  }
  const bytes: number[] = []
  for (let at = 0; at < values.length; at += 4) {
    const chunk = values.slice(at, at + 4)
    if (chunk.length === 1) throw new MailShieldError('mail token: a base64url group of one character')
    const word = chunk.reduce((sum, value, index) => sum | (value << (18 - index * 6)), 0)
    bytes.push((word >> 16) & 255)
    if (chunk.length > 2) bytes.push((word >> 8) & 255)
    if (chunk.length > 3) bytes.push(word & 255)
  }
  return new Uint8Array(bytes)
}

/** By CODE POINT, so an emoji or an accented letter survives the round trip. */
function reverse(text: string): string {
  return [...text].reverse().join('')
}

function hide(text: string): string {
  return toBase64Url(new TextEncoder().encode(reverse(text)))
}

function reveal(part: string): string {
  const text = reverse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(part)))
  if (text === '') throw new MailShieldError('mail token: an empty part')
  return text
}

export function isMailtoUrl(url: string): boolean {
  return url.trim().toLowerCase().startsWith(MAILTO_PREFIX)
}

/** Nothing invisible, no space, no line break, no second `@`. */
function assertSafe(part: string, what: string): void {
  if (part === '') throw new MailShieldError(`${what} is empty`)
  if (/[\s@<>,;:"'\\]/.test(part) || [...part].some(char => (char.codePointAt(0) ?? 0) < 0x20)) {
    throw new MailShieldError(`${what} has a character an address may not hold: "${part}"`)
  }
}

/**
 * One address to one token. `params` becomes the `q` part (`{ subject: 'Hello' }`).
 * Throws `MailShieldError` on anything that is not an address: the caller has
 * already run the value through `z.email()` or through `encodeMailto()`.
 */
export function encodeEmail(address: string, params?: Readonly<Record<string, string>>): MailToken {
  const trimmed = address.trim()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0 || at === trimmed.length - 1) throw new MailShieldError(`not an email address: "${address}"`)
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  assertSafe(local, 'the local part')
  assertSafe(domain, 'the domain')
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    throw new MailShieldError(`the domain needs a dot: "${domain}"`)
  }
  const entries = Object.entries(params ?? {}).filter(([, value]) => value !== '')
  if (entries.length === 0) return { u: hide(local), d: hide(domain) }
  const query = new URLSearchParams(entries).toString()
  return { u: hide(local), d: hide(domain), q: hide(query) }
}

/**
 * A `mailto:` URL to one token. `null` for anything this cannot read, so a
 * caller never throws on owner text: a tile without a target is "incomplete"
 * and the build leaves it out (`incompleteReason` in types/profile.ts).
 */
export function encodeMailto(url: string): MailToken | null {
  if (!isMailtoUrl(url)) return null
  const rest = url.trim().slice(MAILTO_PREFIX.length)
  const cut = rest.indexOf('?')
  const address = cut === -1 ? rest : rest.slice(0, cut)
  const query = cut === -1 ? '' : rest.slice(cut + 1)
  try {
    const token = encodeEmail(decodeURIComponent(address))
    return query === '' ? token : { ...token, q: hide(query) }
  }
  catch {
    return null
  }
}

/** True for a value that has the shape of a token. Used by the guards and the schema. */
export function isMailToken(value: unknown): value is MailToken {
  if (typeof value !== 'object' || value === null) return false
  const token = value as Record<string, unknown>
  return typeof token.u === 'string' && typeof token.d === 'string' && (token.q === undefined || typeof token.q === 'string')
}

/** The token back to `local@domain`. Throws `MailShieldError` on a token that is not one. */
export function decodeEmail(token: MailToken): string {
  if (!isMailToken(token)) throw new MailShieldError('mail token: not a token')
  return `${reveal(token.u)}@${reveal(token.d)}`
}

/** The `mailto:` URL, with the query when the token has one. Built in memory, never in markup. */
export function mailHref(token: MailToken): string {
  const address = decodeEmail(token)
  return token.q === undefined ? `${MAILTO_PREFIX}${address}` : `${MAILTO_PREFIX}${address}?${reveal(token.q)}`
}

/**
 * "hello at example dot com": what a visitor reads while the page still has no
 * address, and what a visitor with JavaScript off reads for good. It matches no
 * harvester regex, because it holds no `@` and no dot.
 */
export function humanEmail(token: MailToken): string {
  return decodeEmail(token)
    .replace(/@/g, ' at ')
    .replace(/\./g, ' dot ')
    .replace(/\s+/g, ' ')
    .trim()
}
