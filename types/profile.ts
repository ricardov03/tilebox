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
}).strict()

export const SocialBlockSchema = z.object({
  id,
  type: z.literal('social'),
  size,
  network: z.enum(NETWORK_IDS),
  url,
  label: z.string().optional(),
}).strict()

export const ImageBlockSchema = z.object({
  id,
  type: z.literal('image'),
  size,
  src: z.string().min(1),
  alt: z.string().min(1),
  caption: z.string().optional(),
  source: ImageSourceSchema.nullable(),
}).strict()

export const TextBlockSchema = z.object({
  id,
  type: z.literal('text'),
  size,
  title: z.string().optional(),
  body: z.string(),
  footnote: z.string().optional(),
}).strict()

export const SectionBlockSchema = z.object({
  id,
  type: z.literal('section'),
  title: z.string().min(1),
}).strict()

export const MapBlockSchema = z.object({
  id,
  type: z.literal('map'),
  size,
  label: z.string().min(1),
  sublabel: z.string().optional(),
  url,
}).strict()

export const VideoBlockSchema = z.object({
  id,
  type: z.literal('video'),
  size,
  url,
  title: z.string().optional(),
  thumbnail: z.string().optional(),
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

export const ProfileInfoSchema = z.object({
  name: z.string().min(1),
  handle: z.string().min(1),
  bio: z.string(),
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

    const desktop = new Set(data.layout.desktop)
    data.blocks.forEach((block, index) => {
      if (!desktop.has(block.id)) {
        ctx.addIssue({ code: 'custom', path: ['blocks', index, 'id'], message: `Block "${block.id}" is missing from layout.desktop` })
      }
    })
  })

export type Profile = z.infer<typeof ProfileSchema>
export type ProfileInfo = z.infer<typeof ProfileInfoSchema>
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

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileValidationError'
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
