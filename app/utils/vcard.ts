/**
 * vCard 3.0 text (RFC 2426) for the "Save my contact" tile (WP11).
 * Pure: no Vue, no Node. The build writes it to `public/site/contact.vcf`
 * (content/site-extras.ts), the editor offers the same text as a preview.
 *
 * Input: the top-level `contact` object and the profile NAME, nothing else.
 * The private `profile.email` never enters this function. No `PHOTO`: a
 * base64 picture would make the file large, and the page already shows it.
 */
import type { Contact } from '../../types/profile'
import { splitName } from './site-head'

const CRLF = '\r\n'
/** RFC 2426 2.6: a line is folded at 75 octets. */
const MAX_LINE_OCTETS = 75

/**
 * Drops C0 / C1 controls (a tab becomes a space, line breaks stay) and the bidi
 * controls: never in a contact card. By code point, so this file holds no control character.
 */
function stripUnsafe(value: string): string {
  return [...value].map((char) => {
    const code = char.codePointAt(0) ?? 0
    if (code === 0x09) return ' '
    if (code === 0x0A || code === 0x0D) return char
    if (code < 0x20 || (code >= 0x7F && code <= 0x9F)) return ''
    if ((code >= 0x202A && code <= 0x202E) || (code >= 0x2066 && code <= 0x2069)) return ''
    return char
  }).join('')
}

/** Text value: `\` `,` `;` get a backslash, a line break becomes `\n`. */
export function escapeVCardText(value: string): string {
  return stripUnsafe(value)
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** Fold at 75 octets (UTF-8), never inside a character. A continuation line starts with one space. */
export function foldVCardLine(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let octets = 0
  for (const char of line) {
    const size = encoder.encode(char).byteLength
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1
    if (octets + size > limit) {
      parts.push(current)
      current = ''
      octets = 0
    }
    current += char
    octets += size
  }
  parts.push(current)
  return parts.join(`${CRLF} `)
}

/** No line break may reach a value that is not escaped (URL, TEL, EMAIL): the schema refuses them, this is the second guard. */
const oneLine = (value: string) => stripUnsafe(value).replace(/[\r\n]+/g, '').trim()

export function buildVCard(contact: Contact, profileName: string): string {
  const fullName = (contact.fullName ?? profileName).replace(/\s+/g, ' ').trim()
  const name = splitName(fullName)
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    // N = family;given;additional;prefix;suffix. One word = the given name.
    `N:${escapeVCardText(name?.last ?? '')};${escapeVCardText(name?.first ?? fullName)};;;`,
    `FN:${escapeVCardText(fullName)}`,
    ...(contact.org ? [`ORG:${escapeVCardText(contact.org)}`] : []),
    ...(contact.title ? [`TITLE:${escapeVCardText(contact.title)}`] : []),
    ...(contact.phone ? [`TEL;TYPE=CELL:${oneLine(contact.phone)}`] : []),
    ...(contact.email ? [`EMAIL;TYPE=INTERNET:${oneLine(contact.email)}`] : []),
    ...(contact.url ? [`URL:${oneLine(contact.url)}`] : []),
    ...(contact.note ? [`NOTE:${escapeVCardText(contact.note)}`] : []),
    'END:VCARD',
  ]
  return lines.map(foldVCardLine).join(CRLF) + CRLF
}
