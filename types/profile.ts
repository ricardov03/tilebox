/**
 * Contract for `content/profile.json`. PLAN.md section 6.
 * Frozen after WP0. Changes need a note in NOTES.md.
 */
import { z } from 'zod'
import { ICON_NAME_RE, ICON_SETS_MESSAGE } from '../app/utils/icon-sets'
import { COLOR_PRESET_IDS, FONT_PRESET_IDS } from '../app/utils/presets'
import { NETWORK_IDS } from '../app/utils/networks'
import { endsBeforeStart, isOnPage } from '../app/utils/schedule'
import { resolveSiteUrl } from '../app/utils/site-head'
import { SIZES } from '../app/utils/sizes'
import { withUtm, type UtmSettings } from '../app/utils/utm'
import { LOCAL_ICON_PATH, LOCAL_THUMB_PATH } from './local-paths'
import { PublicSiteSchema, SiteSchema, toPublicSite, type PublicSiteExtras } from './site'

const id = z.string().min(1)
const url = z.url()
const size = z.enum(SIZES)
/** Full Iconify name like `line-md:github`, from one of the two supported sets only (WP18, `app/utils/icon-sets.ts`). */
const iconName = z.string().regex(ICON_NAME_RE, ICON_SETS_MESSAGE)

/** Optional on every block (WP10a). `true` = the build drops the block: it is in no file of `dist/`. */
const hidden = z.boolean().optional()
/**
 * Schedule (WP11), optional on every block. ISO 8601 with an offset (`2026-12-01T09:00:00-05:00` or `...Z`).
 * The BUILD applies it (`toPublicProfile`): a future `startsAt` or a past `endsAt` removes the block like `hidden`.
 * A future `endsAt` stays on the public block (the page hides the tile when the time has passed); `startsAt` never ships.
 */
const isoDateTime = z.iso.datetime({ offset: true, error: 'Must be an ISO 8601 date with an offset, like 2026-12-01T09:00:00-05:00' })
const schedule = { startsAt: isoDateTime.optional(), endsAt: isoDateTime.optional() }
/** Per-block opt-out of the UTM tags of `site.utm` (WP11). Absent = false. Never shipped. */
const noUtm = z.boolean().optional()
/** Local files the unfurl engine wrote (content/unfurl.ts). Never a remote URL. Icons are PNG only (./local-paths.ts). */
export const localIconPath = z.string().regex(LOCAL_ICON_PATH, 'favicon must be a local path like /icons/<hash>.png')
export const localThumbPath = z.string().regex(LOCAL_THUMB_PATH, 'image must be a local path like /thumbs/<hash>.webp')

export const SPOTLIGHTS = ['pop', 'wobble', 'buzz'] as const
export type Spotlight = (typeof SPOTLIGHTS)[number]

/** What the website said about itself. Kept for the editor ("Use fetched title"). Never shipped to the public page. */
export const LinkMetaSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  siteName: z.string().optional(),
  themeColor: z.string().optional(),
  source: z.enum(['oembed', 'html', 'brand']),
  fetchedAt: z.string().min(1),
}).strict()

export const ImageSourceSchema = z.object({
  provider: z.enum(['pexels', 'unsplash', 'r2']),
  id: z.string().min(1),
  url: url.optional(),
  author: z.string().optional(),
  authorUrl: url.optional(),
}).strict()

export const LinkBlockSchema = z.object({
  id,
  type: z.literal('link'),
  size,
  title: z.string().min(1),
  url,
  description: z.string().optional(),
  icon: iconName.optional(),
  accent: z.boolean().optional(),
  pop: z.boolean().optional(),
  hidden,
  ...schedule,
  noUtm,
  /** Link preview (WP10a). Absent = false. `true`: icon and text may come from the website (fetched on your machine). */
  enrich: z.boolean().optional(),
  /** The second switch. Absent = false. `true`: the website's image shows on 2x1, 1x2 and 2x2 tiles. */
  showImage: z.boolean().optional(),
  favicon: localIconPath.optional(),
  image: localThumbPath.optional(),
  imageAlt: z.string().optional(),
  meta: LinkMetaSchema.optional(),
  /** A gentle attention animation. At most one block of the profile may have it. */
  spotlight: z.enum(SPOTLIGHTS).optional(),
}).strict()

export const SocialBlockSchema = z.object({
  id,
  type: z.literal('social'),
  size,
  network: z.enum(NETWORK_IDS),
  url,
  label: z.string().optional(),
  hidden,
  ...schedule,
  noUtm,
}).strict()

export const ImageBlockSchema = z.object({
  id,
  type: z.literal('image'),
  size,
  src: z.string().min(1),
  alt: z.string().min(1),
  caption: z.string().optional(),
  source: ImageSourceSchema.nullable(),
  hidden,
  ...schedule,
}).strict()

export const TextBlockSchema = z.object({
  id,
  type: z.literal('text'),
  size,
  title: z.string().optional(),
  body: z.string(),
  footnote: z.string().optional(),
  hidden,
  ...schedule,
}).strict()

export const SectionBlockSchema = z.object({
  id,
  type: z.literal('section'),
  title: z.string().min(1),
  hidden,
  ...schedule,
}).strict()

export const MapBlockSchema = z.object({
  id,
  type: z.literal('map'),
  size,
  label: z.string().min(1),
  sublabel: z.string().optional(),
  url,
  hidden,
  ...schedule,
  noUtm,
}).strict()

export const VideoBlockSchema = z.object({
  id,
  type: z.literal('video'),
  size,
  url,
  title: z.string().optional(),
  thumbnail: z.string().optional(),
  hidden,
  ...schedule,
  noUtm,
}).strict()

/**
 * "Save my contact" tile (WP11). A download link to `/site/contact.vcf`, the vCard the build
 * writes from the top-level `contact` object. No file at build time = the build drops the block.
 */
export const ContactBlockSchema = z.object({
  id,
  type: z.literal('contact'),
  size,
  /** Default: "Save my contact". */
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  /** Default: `line-md:account`. */
  icon: iconName.optional(),
  hidden,
  ...schedule,
}).strict()

export const QR_SIZES = ['1x1', '2x2'] as const

/** QR code of the page (WP11): `/site/qr.svg`, drawn by the build when the site URL is known. No file = the build drops the block. */
export const QrBlockSchema = z.object({
  id,
  type: z.literal('qr'),
  size: z.enum(QR_SIZES),
  /** Default: the host of the site URL. */
  caption: z.string().optional(),
  hidden,
  ...schedule,
}).strict()

export const BlockSchema = z.discriminatedUnion('type', [
  LinkBlockSchema,
  SocialBlockSchema,
  ImageBlockSchema,
  TextBlockSchema,
  SectionBlockSchema,
  MapBlockSchema,
  VideoBlockSchema,
  ContactBlockSchema,
  QrBlockSchema,
]).superRefine((block, ctx) => {
  if (endsBeforeStart(block)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'endsAt must be after startsAt' })
})

export const CONTACT_TEXT_MAX = 120
export const CONTACT_NOTE_MAX = 500

/**
 * The vCard of the "Save my contact" tile (WP11). EVERYTHING here is PUBLIC by intent:
 * with `enabled: true` the build writes it to `/site/contact.vcf`, a file anyone can download.
 * `contact.email` is its own field. The private `profile.email` is never copied into it.
 */
export const ContactSchema = z.object({
  enabled: z.boolean().optional(),
  /** Default: `profile.name`. */
  fullName: z.string().min(1).max(CONTACT_TEXT_MAX).optional(),
  org: z.string().min(1).max(CONTACT_TEXT_MAX).optional(),
  title: z.string().min(1).max(CONTACT_TEXT_MAX).optional(),
  phone: z.string().regex(/^\+?[0-9][0-9 ().-]{2,30}$/, 'Must be a phone number like +57 300 123 4567').optional(),
  email: z.email().optional(),
  url: z.url({ protocol: /^https?$/, error: 'Must be an http(s) URL' }).optional(),
  note: z.string().min(1).max(CONTACT_NOTE_MAX).optional(),
}).strict()

export const ThemeSchema = z.object({
  colors: z.enum(COLOR_PRESET_IDS),
  fonts: z.enum(FONT_PRESET_IDS),
  mode: z.enum(['system', 'light', 'dark']),
}).strict()

export const HIGHLIGHTS_MAX = 3
export const HIGHLIGHT_MAX_CHARS = 80

export const ProfileInfoSchema = z.object({
  name: z.string().min(1),
  handle: z.string().min(1),
  bio: z.string(),
  /** Up to 3 short lines under the bio. Empty = nothing renders. */
  highlights: z.array(z.string().min(1).max(HIGHLIGHT_MAX_CHARS)).max(HIGHLIGHTS_MAX).default([]),
  /** Required. Private unless `showEmail` is true: the build removes it from the public profile. */
  email: z.email(),
  showEmail: z.boolean().default(false),
  avatar: z.string().nullable().optional(),
  status: z.string().optional(),
  theme: ThemeSchema,
}).strict()

export const LayoutSchema = z.object({
  desktop: z.array(id),
  mobile: z.array(id).optional(),
}).strict()

export const ProfileSchema = z
  .object({
    profile: ProfileInfoSchema,
    blocks: z.array(BlockSchema),
    layout: LayoutSchema,
    /** Site metadata (WP10b, ./site.ts). Optional: a profile without it uses the defaults. */
    site: SiteSchema.optional(),
    /** The public vCard (WP11). Optional: a profile without it has no "Save my contact" file. */
    contact: ContactSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>()
    data.blocks.forEach((block, index) => {
      if (ids.has(block.id)) {
        ctx.addIssue({ code: 'custom', path: ['blocks', index, 'id'], message: `Duplicate block id "${block.id}"` })
      }
      ids.add(block.id)
    })

    const checkLayout = (key: 'desktop' | 'mobile', list: string[] | undefined) => {
      if (!list) return
      const seen = new Set<string>()
      list.forEach((blockId, index) => {
        if (!ids.has(blockId)) {
          ctx.addIssue({ code: 'custom', path: ['layout', key, index], message: `layout.${key} has unknown block id "${blockId}"` })
        }
        if (seen.has(blockId)) {
          ctx.addIssue({ code: 'custom', path: ['layout', key, index], message: `layout.${key} lists "${blockId}" twice` })
        }
        seen.add(blockId)
      })
    }
    checkLayout('desktop', data.layout.desktop)
    checkLayout('mobile', data.layout.mobile)

    const spotlights = data.blocks.flatMap((block, index) => (block.type === 'link' && block.spotlight ? [index] : []))
    spotlights.slice(1).forEach((index) => {
      ctx.addIssue({ code: 'custom', path: ['blocks', index, 'spotlight'], message: 'Only one block may have a spotlight' })
    })

    const desktop = new Set(data.layout.desktop)
    data.blocks.forEach((block, index) => {
      if (!desktop.has(block.id)) {
        ctx.addIssue({ code: 'custom', path: ['blocks', index, 'id'], message: `Block "${block.id}" is missing from layout.desktop` })
      }
    })
  })

export type Profile = z.infer<typeof ProfileSchema>
export type ProfileInfo = z.infer<typeof ProfileInfoSchema>

/**
 * What the public page gets (the `#profile` alias). Never the raw file.
 * `email` is there only when `showEmail` is true. `showEmail` itself is dropped:
 * an email in the public profile means "show it". `avatar` is already resolved
 * (the uploaded one, else the Gravatar file, else missing = initials).
 */
export const PublicProfileInfoSchema = ProfileInfoSchema
  .omit({ email: true, showEmail: true, avatar: true })
  .extend({ email: z.email().optional(), avatar: z.string().optional() })
  .strict()

export const PublicProfileSchema = z.object({
  profile: PublicProfileInfoSchema,
  blocks: z.array(BlockSchema),
  layout: LayoutSchema,
  site: PublicSiteSchema.optional(),
  /** Only the `download` name of `/site/contact.vcf`. The vCard fields live in that file alone. */
  contact: z.object({ fileName: z.string().min(1) }).strict().optional(),
}).strict()

export type PublicProfile = z.infer<typeof PublicProfileSchema>
export type PublicProfileInfo = z.infer<typeof PublicProfileInfoSchema>
export type Theme = z.infer<typeof ThemeSchema>
export type Block = z.infer<typeof BlockSchema>
export type BlockType = Block['type']
export type LinkBlock = z.infer<typeof LinkBlockSchema>
export type SocialBlock = z.infer<typeof SocialBlockSchema>
export type ImageBlock = z.infer<typeof ImageBlockSchema>
export type TextBlock = z.infer<typeof TextBlockSchema>
export type SectionBlock = z.infer<typeof SectionBlockSchema>
export type MapBlock = z.infer<typeof MapBlockSchema>
export type VideoBlock = z.infer<typeof VideoBlockSchema>
export type ContactBlock = z.infer<typeof ContactBlockSchema>
export type QrBlock = z.infer<typeof QrBlockSchema>
export type Contact = z.infer<typeof ContactSchema>
export type ImageSource = z.infer<typeof ImageSourceSchema>
export type LinkMeta = z.infer<typeof LinkMetaSchema>

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileValidationError'
  }
}

/**
 * The public path of the downloaded Gravatar (file: `public/avatar.gravatar.webp`, a WebP that sharp wrote: content/gravatar-fetch.ts).
 * Here and not in content/gravatar.ts: that module imports Node built-ins, and
 * the editor page (client) needs this value too.
 */
export const GRAVATAR_PUBLIC_PATH = '/avatar.gravatar.webp'

/** Emails that mean "not set yet". No Gravatar lookup, and `check:profile` warns on a personal file. */
export const PLACEHOLDER_EMAILS: readonly string[] = ['you@example.com', 'hello@example.com']

export function isPlaceholderEmail(email: string): boolean {
  return PLACEHOLDER_EMAILS.includes(email.trim().toLowerCase())
}

/**
 * The sanitizer. Full profile in, public profile out.
 * - `email` is kept only when `showEmail` is true.
 * - `avatar`: `profile.avatar` when set, else `gravatarPath` (pass it only when the file exists), else no key.
 * - `site` (WP10b) is public by nature: passed through without the upload paths,
 *   plus the generated asset paths and the build date (`siteExtras`).
 * Pure: no file access. nuxt.config.ts, the editor preview and the tests call it.
 */
export function toPublicProfileInfo(info: ProfileInfo, gravatarPath?: string): PublicProfileInfo {
  const { email, showEmail, avatar, ...rest } = info
  const resolvedAvatar = avatar || gravatarPath
  return {
    ...rest,
    ...(showEmail ? { email } : {}),
    ...(resolvedAvatar ? { avatar: resolvedAvatar } : {}),
  }
}

/** Build-time facts of `toPublicProfile()` (WP11). */
export interface PublicBuildOptions {
  /** The build time: decides the schedule. Default: the time of the call. Tests pass a fixed date. */
  now?: Date
  /** `NUXT_PUBLIC_SITE_URL`. It wins over `site.url`. A link to the site itself gets no UTM tags. */
  envSiteUrl?: string
}

interface PublicBlockContext {
  utm?: UtmSettings
  siteUrl?: string
}

/** `Ada Lovelace` -> `ada-lovelace.vcf`. The `download` name of the contact tile. */
export function contactFileName(name: string): string {
  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'contact'}.vcf`
}

/**
 * One block for the public page. Editor-only fields are dropped:
 * `startsAt` and `noUtm` always (WP11; `endsAt` stays, the page needs it),
 * `enrich` and `meta` of a link always, `image` and `imageAlt` when `showImage` is off.
 * With `context.utm`, the URL of a link, social, map or video block gets the UTM tags (app/utils/utm.ts).
 */
export function toPublicBlock(block: Block, context: PublicBlockContext = {}): Block {
  const tagged = (link: string, skip: boolean | undefined) => (skip ? link : withUtm(link, context.utm, context.siteUrl))
  switch (block.type) {
    case 'link': {
      const { startsAt: _startsAt, noUtm: skip, enrich: _enrich, meta: _meta, image, imageAlt, ...rest } = block
      const next = { ...rest, url: tagged(rest.url, skip) }
      return block.showImage && image ? { ...next, image, ...(imageAlt ? { imageAlt } : {}) } : next
    }
    case 'social':
    case 'map':
    case 'video': {
      const { startsAt: _startsAt, noUtm: skip, ...rest } = block
      return { ...rest, url: tagged(rest.url, skip) }
    }
    default: {
      const { startsAt: _startsAt, ...rest } = block
      return rest
    }
  }
}

/** Why the build leaves a block out. `null` = the block is on the page. */
export type BlockDropReason = 'hidden' | 'scheduled' | 'expired' | 'no-contact-file' | 'no-qr-file'

/** One rule for the build, `check:profile` and the tests. `assets` = the generated files that exist. */
export function blockDropReason(block: Block, now: Date, assets: PublicSiteExtras['assets'] = {}): BlockDropReason | null {
  if (block.hidden) return 'hidden'
  if (!isOnPage(block, now)) return block.endsAt && Date.parse(block.endsAt) <= now.getTime() ? 'expired' : 'scheduled'
  if (block.type === 'contact' && !assets.contactCard) return 'no-contact-file'
  if (block.type === 'qr' && !assets.qrCode) return 'no-qr-file'
  return null
}

/**
 * Removed here, with their ids in both layouts, so they are in no HTML, payload or JS file of the built site:
 * - hidden blocks (`hidden: true`, WP10a);
 * - blocks outside their schedule at `build.now` (WP11): a future `startsAt`, a past `endsAt`;
 * - `contact` and `qr` blocks whose generated file does not exist (`siteExtras.assets`).
 * `site` (WP10b) goes through `toPublicSite()`. Everything that reads the public
 * profile (the head, JSON-LD `sameAs`) therefore sees visible blocks only.
 * The top-level `contact` object never ships: the page gets the `download` file name only.
 */
export function toPublicProfile(profile: Profile, gravatarPath?: string, siteExtras?: PublicSiteExtras, build: PublicBuildOptions = {}): PublicProfile {
  const now = build.now ?? new Date()
  const dropped = new Set(profile.blocks.filter(block => blockDropReason(block, now, siteExtras?.assets) !== null).map(block => block.id))
  const visible = (ids: string[]) => ids.filter(blockId => !dropped.has(blockId))
  // The ONE rule for "where the page lives" (env first, then `site.url`, only a real http(s) URL counts): the head, the QR code and the editor use it too.
  const context: PublicBlockContext = { utm: profile.site?.utm, siteUrl: resolveSiteUrl(build.envSiteUrl, profile.site) }
  return {
    profile: toPublicProfileInfo(profile.profile, gravatarPath),
    blocks: profile.blocks.filter(block => !dropped.has(block.id)).map(block => toPublicBlock(block, context)),
    layout: {
      desktop: visible(profile.layout.desktop),
      ...(profile.layout.mobile ? { mobile: visible(profile.layout.mobile) } : {}),
    },
    site: toPublicSite(profile.site, siteExtras),
    ...(siteExtras?.assets?.contactCard
      ? { contact: { fileName: contactFileName(profile.contact?.fullName ?? profile.profile.name) } }
      : {}),
  }
}

/** Parse unknown JSON into a typed Profile. Throws a readable error on failure. */
export function parseProfile(json: unknown): Profile {
  const result = ProfileSchema.safeParse(json)
  if (!result.success) {
    throw new ProfileValidationError(`content/profile.json is not valid:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
