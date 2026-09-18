/**
 * Contract for `content/profile.json`. PLAN.md section 6.
 * Frozen after WP0. Changes need a note in NOTES.md.
 */
import { z } from 'zod'
import { COLOR_PRESET_IDS, FONT_PRESET_IDS } from '../app/utils/presets'
import { NETWORK_IDS } from '../app/utils/networks'
import { SIZES } from '../app/utils/sizes'

const id = z.string().min(1)
const url = z.url()
const size = z.enum(SIZES)
/** Full Iconify name like `line-md:github`. */
const iconName = z.string().regex(/^[a-z0-9-]+:[a-z0-9-]+$/, 'Icon must be a full Iconify name like line-md:github')

/** Optional on every block (WP10a). `true` = the build drops the block: it is in no file of `dist/`. */
const hidden = z.boolean().optional()
/** Local files the unfurl engine wrote (content/unfurl.ts). Never a remote URL. */
const localIconPath = z.string().regex(/^\/icons\/[a-z0-9]+\.(png|jpg|webp|gif|svg)$/, 'favicon must be a local path like /icons/<hash>.png')
const localThumbPath = z.string().regex(/^\/thumbs\/[a-z0-9]+\.webp$/, 'image must be a local path like /thumbs/<hash>.webp')

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
}).strict()

export const TextBlockSchema = z.object({
  id,
  type: z.literal('text'),
  size,
  title: z.string().optional(),
  body: z.string(),
  footnote: z.string().optional(),
  hidden,
}).strict()

export const SectionBlockSchema = z.object({
  id,
  type: z.literal('section'),
  title: z.string().min(1),
  hidden,
}).strict()

export const MapBlockSchema = z.object({
  id,
  type: z.literal('map'),
  size,
  label: z.string().min(1),
  sublabel: z.string().optional(),
  url,
  hidden,
}).strict()

export const VideoBlockSchema = z.object({
  id,
  type: z.literal('video'),
  size,
  url,
  title: z.string().optional(),
  thumbnail: z.string().optional(),
  hidden,
}).strict()

export const BlockSchema = z.discriminatedUnion('type', [
  LinkBlockSchema,
  SocialBlockSchema,
  ImageBlockSchema,
  TextBlockSchema,
  SectionBlockSchema,
  MapBlockSchema,
  VideoBlockSchema,
])

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
export type ImageSource = z.infer<typeof ImageSourceSchema>
export type LinkMeta = z.infer<typeof LinkMetaSchema>

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileValidationError'
  }
}

/**
 * The public path of the downloaded Gravatar (file: `public/avatar.gravatar.jpg`).
 * Here and not in content/gravatar.ts: that module imports Node built-ins, and
 * the editor page (client) needs this value too.
 */
export const GRAVATAR_PUBLIC_PATH = '/avatar.gravatar.jpg'

/** Emails that mean "not set yet". No Gravatar lookup, and `check:profile` warns on a personal file. */
export const PLACEHOLDER_EMAILS: readonly string[] = ['you@example.com', 'hello@example.com']

export function isPlaceholderEmail(email: string): boolean {
  return PLACEHOLDER_EMAILS.includes(email.trim().toLowerCase())
}

/**
 * The sanitizer. Full profile in, public profile out.
 * - `email` is kept only when `showEmail` is true.
 * - `avatar`: `profile.avatar` when set, else `gravatarPath` (pass it only when the file exists), else no key.
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

/**
 * One block for the public page. Editor-only link fields are dropped:
 * `enrich` and `meta` always, `image` and `imageAlt` when `showImage` is off.
 */
export function toPublicBlock(block: Block): Block {
  if (block.type !== 'link') return block
  const { enrich: _enrich, meta: _meta, image, imageAlt, ...rest } = block
  return block.showImage && image ? { ...rest, image, ...(imageAlt ? { imageAlt } : {}) } : rest
}

/**
 * Hidden blocks (`hidden: true`) are removed here, with their ids in both
 * layouts, so they are in no HTML, payload or JS file of the built site (WP10a).
 */
export function toPublicProfile(profile: Profile, gravatarPath?: string): PublicProfile {
  const hiddenIds = new Set(profile.blocks.filter(block => block.hidden).map(block => block.id))
  const visible = (ids: string[]) => ids.filter(blockId => !hiddenIds.has(blockId))
  return {
    profile: toPublicProfileInfo(profile.profile, gravatarPath),
    blocks: profile.blocks.filter(block => !block.hidden).map(toPublicBlock),
    layout: {
      desktop: visible(profile.layout.desktop),
      ...(profile.layout.mobile ? { mobile: visible(profile.layout.mobile) } : {}),
    },
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
