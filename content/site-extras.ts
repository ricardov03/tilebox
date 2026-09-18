/**
 * The two WP11 files of `public/site/` (ignored by git):
 * - `contact.vcf`: the vCard of the "Save my contact" tile, only when `contact.enabled` is true.
 * - `qr.svg`: the QR code of the page, only when the site URL is known and is https.
 *
 * A sibling of ./site-assets.ts (the favicon set and the social image), run right
 * after it by `scripts/build-site-assets.ts` and by the dev-only route
 * `POST /api/site/assets`. No network. Never throws: one line per file lands in `messages`.
 * A file that is not wanted any more is REMOVED, so `siteAssetsIfPresent()` (and with it
 * the build, which drops a `contact` / `qr` block without its file) never sees a stale one.
 *
 * The QR code is an SVG that OUR code draws (uqr) from a checked URL string and
 * two preset colors. It is not a remote SVG. It always uses the LIGHT colors on a
 * solid ground: a light-on-dark QR code does not scan on many phones.
 *
 * Paths come from `ROOT` in ./resolve.ts, never from this file's location.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { renderSVG } from 'uqr'
import { COLOR_PRESETS } from '../app/utils/presets'
import { resolveSiteUrl } from '../app/utils/site-head'
import { buildVCard } from '../app/utils/vcard'
import type { Profile } from '../types/profile'
import { isSiteUrl } from '../types/site'
import { SITE_DIR, SITE_EXTRA_FILES } from './site-files'

export interface BuildSiteExtrasOptions {
  profile: Profile
  /** `NUXT_PUBLIC_SITE_URL`. It wins over `site.url`. */
  envSiteUrl?: string
  /** Default: `<ROOT>/public/site`. Tests pass a temp folder. */
  outDir?: string
  /**
   * `profile` is the editor's DRAFT, not the saved file ("Regenerate", "Make the QR code"). A draft draws
   * the QR code (the owner pressed a button for it, and the panel shows it). It never REMOVES a file:
   * `contact.vcf` and `qr.svg` on disk belong to the saved profile, and the page in dev drops their tiles
   * when they are gone. It never WRITES `contact.vcf` either: the public tile serves that file, and an email
   * that is typed and not saved must not be in it. The save and every build write and remove both.
   */
  draft?: boolean
}

export interface BuildSiteExtrasResult {
  /** File names written to `outDir`, sorted. */
  files: string[]
  /** The URL inside the QR code. '' = no QR code. */
  qrUrl: string
  /** One line per file, no trailing newline. */
  messages: string[]
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error))

/** Quiet zone of 2 modules. The tile adds its own padding on top. */
const QR_BORDER = 2

/** The QR code of `url` as SVG text. The caller checks the URL with `isSiteUrl` (https only). */
export function qrSvg(url: string, colors: { ink: string, ground: string }): string {
  return renderSVG(url, { ecc: 'M', border: QR_BORDER, blackColor: colors.ink, whiteColor: colors.ground })
}

export async function buildSiteExtras(options: BuildSiteExtrasOptions): Promise<BuildSiteExtrasResult> {
  const { profile } = options
  const outDir = options.outDir ?? SITE_DIR
  const files: string[] = []
  const messages: string[] = []
  const vcfFile = resolve(outDir, SITE_EXTRA_FILES.contactCard)
  const qrFile = resolve(outDir, SITE_EXTRA_FILES.qrCode)
  const hasBlock = (type: 'contact' | 'qr') => profile.blocks.some(block => block.type === type && !block.hidden)

  try {
    await mkdir(outDir, { recursive: true })
  }
  catch (error) {
    return { files, qrUrl: '', messages: [`site: cannot create ${outDir} (${reasonOf(error)}), no contact card, no QR code`] }
  }

  // Contact card. Only the `contact` object and the profile name go in: never `profile.email`.
  // A DRAFT never touches it: the public tile serves this file, no editor preview reads it, and an email
  // that was typed and not saved must not be in a file the page hands out. It follows the save and the build.
  if (options.draft) {
    messages.push('site: the contact card follows the save, not the draft')
  }
  else if (profile.contact?.enabled) {
    try {
      await writeFile(vcfFile, buildVCard(profile.contact, profile.profile.name), 'utf8')
      files.push(SITE_EXTRA_FILES.contactCard)
      messages.push(`site: contact card written (/site/${SITE_EXTRA_FILES.contactCard}). Everything in it is public.`)
    }
    catch (error) {
      await rm(vcfFile, { force: true }).catch(() => undefined)
      messages.push(`site: contact card not written (${reasonOf(error)})`)
    }
  }
  else {
    await rm(vcfFile, { force: true }).catch(() => undefined)
    if (hasBlock('contact')) messages.push('site: no contact card (contact.enabled is off), so the "Save my contact" tile is left out')
  }

  // QR code of the page.
  const siteUrl = resolveSiteUrl(options.envSiteUrl, profile.site)
  let qrUrl = ''
  if (siteUrl && isSiteUrl(siteUrl)) {
    // Draw, write a scratch file, rename: a draw that throws (a URL with more data than a code can hold) or
    // a write that fails never leaves a half-written `qr.svg`.
    const scratch = `${qrFile}.${process.pid}.tmp`
    try {
      const colors = COLOR_PRESETS[profile.profile.theme.colors].light
      qrUrl = `${siteUrl}/`
      await writeFile(scratch, `${qrSvg(qrUrl, colors)}\n`, 'utf8')
      await rename(scratch, qrFile)
      files.push(SITE_EXTRA_FILES.qrCode)
      messages.push(`site: QR code written for ${qrUrl}`)
    }
    catch (error) {
      qrUrl = ''
      await rm(scratch, { force: true }).catch(() => undefined)
      // A save or a build: the old code is for another URL now, so it goes. A DRAFT never removes the file of
      // the saved profile (docs/invariants.md 8), the same rule as the no-URL branch below.
      if (!options.draft) await rm(qrFile, { force: true }).catch(() => undefined)
      messages.push(`site: QR code not written (${reasonOf(error)})`)
    }
  }
  else {
    if (!options.draft) await rm(qrFile, { force: true }).catch(() => undefined)
    const why = siteUrl ? `the site URL ${siteUrl} is not https` : 'no site URL: set NUXT_PUBLIC_SITE_URL or the site URL in the Site tab'
    if (hasBlock('qr')) messages.push(`site: no QR code (${why}), so the QR tile is left out`)
  }

  return { files: files.sort(), qrUrl, messages }
}

/** The QR code on disk as a square PNG (the "Download PNG" button of the editor). `null` when there is no `qr.svg`. */
export async function qrPng(size: number = 1024, dir: string = SITE_DIR): Promise<Buffer | null> {
  let svg: Buffer
  try {
    svg = await readFile(resolve(dir, SITE_EXTRA_FILES.qrCode))
  }
  catch {
    return null
  }
  // Loaded here: a broken sharp install must not stop the contact card or the QR SVG.
  const { default: sharp } = await import('sharp')
  // Nearest neighbour: the modules stay sharp squares.
  return sharp(svg, { density: 300 }).resize(size, size, { kernel: 'nearest' }).png().toBuffer()
}
