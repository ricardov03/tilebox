/**
 * Builds the favicon set, the web manifest and the social preview image into
 * `public/site/` (ignored by git). WP10b. One module for both callers:
 * `scripts/build-site-assets.ts` (tsx, predev + pregenerate) and the dev-only
 * route `POST /api/site/assets` (Nitro, with the editor's draft).
 *
 * - Favicon source, in order: `site.favicon` (your upload) > the avatar
 *   (`profile.avatar`, else the downloaded Gravatar file; cut to a circle) >
 *   an initials tile in the active color preset.
 * - Social image 1200x630: `site.ogImage` (your upload, cover) > a generated
 *   card (satori -> SVG -> sharp -> PNG). The card always uses Geist
 *   (`assets/fonts/*.ttf`, SIL OFL 1.1) and the LIGHT colors of the active preset.
 * - No network. Never throws: a broken source falls to the next one, and one
 *   line per problem lands in `messages`.
 *
 * Paths come from `ROOT` in ./resolve.ts, never from this file's location:
 * Nitro bundles this module into `.nuxt/` (NOTES.md, WP7 regression fix).
 * No Vue or Nuxt imports: tsx runs this file.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import satori from 'satori'
import sharp, { type Sharp } from 'sharp'
import { COLOR_PRESETS, type ColorSet } from '../app/utils/presets'
import {
  cleanHandle,
  initialsOf,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  resolveSiteUrl,
  siteHost,
  siteTitle,
  splitName,
} from '../app/utils/site-head'
import type { Profile } from '../types/profile'
import { GRAVATAR_FILE } from './gravatar'
import { ROOT } from './resolve'
import { SITE_DIR, SITE_FILES, SITE_PUBLIC_DIR } from './site-files'

export type FaviconSource = 'upload' | 'avatar' | 'initials' | 'none'
export type OgImageSource = 'upload' | 'generated' | 'none'

export interface BuildSiteAssetsOptions {
  profile: Profile
  /** `NUXT_PUBLIC_SITE_URL`. It wins over `site.url` for the host line of the card. */
  envSiteUrl?: string
  /** Where `/avatar.jpg` and `/site-uploads/x.png` live. Default: `<ROOT>/public`. */
  publicDir?: string
  /** Default: `<ROOT>/public/site`. Tests pass a temp folder. */
  outDir?: string
  /** Default: `<ROOT>/assets/fonts`. */
  fontsDir?: string
  /** Default: `public/avatar.gravatar.jpg`. */
  gravatarFile?: string
}

export interface BuildSiteAssetsResult {
  /** File names written to `outDir`, sorted. */
  files: string[]
  faviconSource: FaviconSource
  ogSource: OgImageSource
  /** One line per problem, no trailing newline. Empty = all good. */
  messages: string[]
  /** Cache-busting stamp for the editor previews. */
  version: string
}

const MASTER_SIZE = 512
/** The maskable safe zone is a circle of 80% of the icon. A circle of 70% and a square of 56% stay inside it. */
const MASK_CIRCLE_SIZE = Math.round(MASTER_SIZE * 0.7)
const MASK_SQUARE_SIZE = Math.round(MASTER_SIZE * 0.56)
const OG_MAX_BYTES = 1024 * 1024
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const FONT_FAMILY = 'Geist'

const reasonOf = (error: unknown) => (error instanceof Error ? error.message.split('\n')[0] ?? '' : String(error))

/** `/site-uploads/a.png` -> `<publicDir>/site-uploads/a.png`. Throws for a remote URL or a path that leaves `publicDir`. */
function localFile(publicDir: string, publicPath: string): string {
  const clean = publicPath.split(/[?#]/)[0] ?? ''
  if (!clean.startsWith('/') || clean.startsWith('//')) throw new Error(`"${publicPath}" is not a local path`)
  const file = resolve(publicDir, `.${clean}`)
  if (!file.startsWith(resolve(publicDir) + sep)) throw new Error(`"${publicPath}" is outside public/`)
  return file
}

/* ---------- satori ---------- */

interface CardNode {
  type: 'div' | 'img'
  props: {
    style?: Record<string, string | number>
    children?: CardNode | string | (CardNode | string)[]
    src?: string
    width?: number
    height?: number
  }
}

type SatoriFont = { name: string, data: Buffer, weight: 400 | 600, style: 'normal' }
const fontCache = new Map<string, Promise<SatoriFont[]>>()

function loadFonts(fontsDir: string): Promise<SatoriFont[]> {
  let fonts = fontCache.get(fontsDir)
  if (!fonts) {
    fonts = Promise.all([
      readFile(resolve(fontsDir, 'Geist-Regular.ttf')),
      readFile(resolve(fontsDir, 'Geist-SemiBold.ttf')),
    ]).then(([regular, semiBold]): SatoriFont[] => [
      { name: FONT_FAMILY, data: regular, weight: 400, style: 'normal' },
      { name: FONT_FAMILY, data: semiBold, weight: 600, style: 'normal' },
    ])
    fonts.catch(() => fontCache.delete(fontsDir))
    fontCache.set(fontsDir, fonts)
  }
  return fonts
}

async function renderSvg(node: CardNode, width: number, height: number, fontsDir: string): Promise<string> {
  // satori types its input as a React node. It only reads `type` and `props`, so plain objects are enough.
  return satori(node as unknown as Parameters<typeof satori>[0], { width, height, fonts: await loadFonts(fontsDir) })
}

/* ---------- favicon ---------- */

interface TileColors {
  bg: string
  fg: string
}

/** The initials as SVG `<path>` data (satori turns text into outlines, so no font is needed to show them). */
async function initialsPaths(initials: string, fontSize: number, fontsDir: string): Promise<string[]> {
  const svg = await renderSvg({
    type: 'div',
    props: {
      style: {
        display: 'flex',
        width: MASTER_SIZE,
        height: MASTER_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT_FAMILY,
        fontWeight: 600,
        fontSize,
        letterSpacing: '-0.04em',
        color: '#000000',
      },
      children: initials,
    },
  }, MASTER_SIZE, MASTER_SIZE, fontsDir)
  const paths = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].flatMap(match => (match[1] ? [match[1]] : []))
  if (paths.length === 0) throw new Error('no glyph outlines for the initials')
  return paths
}

/**
 * The initials tile. `radius` 0 = full bleed (Apple and maskable icons: the
 * system cuts the corners). With `dark`, a `prefers-color-scheme` media query
 * swaps the colors (the `icon.svg` file). Without it the fills are inline,
 * which every SVG renderer reads (the PNG master).
 */
function initialsTile(paths: string[], light: TileColors, options: { radius: number, dark?: TileColors }): string {
  const { radius, dark } = options
  const glyphs = (attrs: string) => paths.map(d => `<path ${attrs} d="${d}"/>`).join('')
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MASTER_SIZE} ${MASTER_SIZE}" width="${MASTER_SIZE}" height="${MASTER_SIZE}">`
  if (!dark) {
    return `${open}<rect width="${MASTER_SIZE}" height="${MASTER_SIZE}" rx="${radius}" fill="${light.bg}"/>${glyphs(`fill="${light.fg}"`)}</svg>\n`
  }
  const style = `.b{fill:${light.bg}}.f{fill:${light.fg}}@media (prefers-color-scheme:dark){.b{fill:${dark.bg}}.f{fill:${dark.fg}}}`
  return `${open}<style>${style}</style><rect class="b" width="${MASTER_SIZE}" height="${MASTER_SIZE}" rx="${radius}"/>${glyphs('class="f"')}</svg>\n`
}

/** 32x32 PNG inside an ICO container: ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) + the PNG bytes. */
export function icoFromPng(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type 1 = icon
  header.writeUInt16LE(1, 4) // one image
  header.writeUInt8(size >= 256 ? 0 : size, 6) // width (0 = 256)
  header.writeUInt8(size >= 256 ? 0 : size, 7) // height
  header.writeUInt8(0, 8) // no palette
  header.writeUInt8(0, 9) // reserved
  header.writeUInt16LE(1, 10) // color planes
  header.writeUInt16LE(32, 12) // bits per pixel
  header.writeUInt32LE(png.byteLength, 14) // size of the image data
  header.writeUInt32LE(header.byteLength, 18) // offset of the image data
  return Buffer.concat([header, png])
}

interface FaviconArt {
  source: Exclude<FaviconSource, 'none'>
  /** 512x512 PNG, transparent outside the shape. */
  master: Buffer
  /** Written as `icon.svg` when set. */
  svg?: string
  /** Full-bleed 512 PNG for the Apple icon, when the art has one (initials). */
  bleed?: Buffer
  /** Full-bleed 512 PNG with the content inside the maskable safe zone, when the art has one (initials). */
  mask?: Buffer
  shape: 'circle' | 'square'
}

const resizeTo = (input: Buffer, size: number) =>
  sharp(input).resize(size, size, { fit: 'contain', background: TRANSPARENT }).png().toBuffer()

async function uploadArt(file: string): Promise<FaviconArt> {
  const isSvg = extname(file).toLowerCase() === '.svg'
  const raw = await readFile(file)
  const master = await sharp(raw, isSvg ? { density: 300 } : {})
    .resize(MASTER_SIZE, MASTER_SIZE, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer()
  return { source: 'upload', master, shape: 'square', ...(isSvg ? { svg: raw.toString('utf8') } : {}) }
}

async function avatarArt(file: string): Promise<FaviconArt> {
  const circle = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER_SIZE}" height="${MASTER_SIZE}"><circle cx="${MASTER_SIZE / 2}" cy="${MASTER_SIZE / 2}" r="${MASTER_SIZE / 2}"/></svg>`,
  )
  const master = await sharp(await readFile(file))
    .rotate()
    .resize(MASTER_SIZE, MASTER_SIZE, { fit: 'cover' })
    .ensureAlpha()
    .composite([{ input: circle, blend: 'dest-in' }])
    .png()
    .toBuffer()
  return { source: 'avatar', master, shape: 'circle' }
}

async function initialsArt(name: string, colors: { light: ColorSet, dark: ColorSet }, fontsDir: string): Promise<FaviconArt> {
  const initials = initialsOf(name)
  const light = { bg: colors.light.accent, fg: colors.light['accent-soft'] }
  const dark = { bg: colors.dark.accent, fg: colors.dark['accent-soft'] }
  const scale = initials.length > 1 ? 1 : 1.2
  const paths = await initialsPaths(initials, Math.round(MASTER_SIZE * 0.46 * scale), fontsDir)
  const safePaths = await initialsPaths(initials, Math.round(MASTER_SIZE * 0.32 * scale), fontsDir)
  const radius = Math.round(MASTER_SIZE * 0.22)
  const png = (svg: string) => sharp(Buffer.from(svg)).resize(MASTER_SIZE, MASTER_SIZE).png().toBuffer()
  return {
    source: 'initials',
    master: await png(initialsTile(paths, light, { radius })),
    svg: initialsTile(paths, light, { radius, dark }),
    bleed: await png(initialsTile(paths, light, { radius: 0 })),
    mask: await png(initialsTile(safePaths, light, { radius: 0 })),
    shape: 'square',
  }
}

/** The art on the ground color: full size for Apple, inside the safe zone for the maskable icon. */
async function onGround(art: Buffer, size: number, inner: number, ground: string): Promise<Buffer> {
  return sharp({ create: { width: size, height: size, channels: 4, background: ground } })
    .composite([{ input: await resizeTo(art, inner), gravity: 'centre' }])
    .flatten({ background: ground })
    .png()
    .toBuffer()
}

/* ---------- social image ---------- */

async function avatarDataUri(file: string, size: number): Promise<string> {
  const png = await sharp(await readFile(file)).rotate().resize(size, size, { fit: 'cover' }).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

function ogCard(profile: Profile, colors: ColorSet, host: string, avatar: string | null): CardNode {
  const info = profile.profile
  const handle = cleanHandle(info.handle)
  const footer = [handle ? `@${handle}` : '', host].filter(Boolean).join('  ·  ')
  const avatarSize = 184
  const picture: CardNode = avatar
    ? { type: 'img', props: { src: avatar, width: avatarSize, height: avatarSize, style: { borderRadius: avatarSize / 2 } } }
    : {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
            backgroundColor: colors.accent,
            color: colors['accent-soft'],
            fontSize: 72,
            fontWeight: 600,
            letterSpacing: '-0.04em',
          },
          children: initialsOf(info.name),
        },
      }
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        padding: 44,
        backgroundColor: colors.ground,
        fontFamily: FONT_FAMILY,
      },
      children: {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            flexGrow: 1,
            padding: '56px 64px',
            borderRadius: 44,
            border: `2px solid ${colors.line}`,
            backgroundColor: colors.tile,
          },
          children: [
            {
              type: 'div',
              props: {
                style: { display: 'flex', alignItems: 'center', gap: 48 },
                children: [
                  picture,
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', flexDirection: 'column', flexGrow: 1, flexBasis: 0, gap: 20 },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              display: 'block',
                              lineClamp: 2,
                              color: colors.ink,
                              fontSize: 76,
                              fontWeight: 600,
                              lineHeight: 1,
                              letterSpacing: '-0.04em',
                            },
                            children: info.name,
                          },
                        },
                        ...(info.bio.trim()
                          ? [{
                              type: 'div' as const,
                              props: {
                                style: { display: 'block', lineClamp: 3, color: colors.muted, fontSize: 32, lineHeight: 1.4 },
                                children: info.bio.trim(),
                              },
                            }]
                          : []),
                      ],
                    },
                  },
                ],
              },
            },
            {
              type: 'div',
              props: {
                style: { display: 'flex', alignItems: 'center', gap: 24 },
                children: [
                  { type: 'div', props: { style: { width: 72, height: 10, borderRadius: 5, backgroundColor: colors.accent } } },
                  {
                    type: 'div',
                    props: {
                      // The "mono" line of the page. Only Geist ships with the repo, so it is Geist with wide tracking.
                      style: { display: 'flex', color: colors.muted, fontSize: 28, letterSpacing: '0.04em' },
                      children: footer,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    },
  }
}

async function ogPng(input: Sharp): Promise<Buffer> {
  const resized = await input.resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, { fit: 'cover' }).png({ compressionLevel: 9 }).toBuffer()
  if (resized.byteLength < OG_MAX_BYTES) return resized
  // A photo as a full-color PNG can pass 1 MB. A 256-color palette keeps it well under.
  return sharp(resized).png({ compressionLevel: 9, palette: true, quality: 80 }).toBuffer()
}

/* ---------- the build ---------- */

export async function buildSiteAssets(options: BuildSiteAssetsOptions): Promise<BuildSiteAssetsResult> {
  const { profile } = options
  const publicDir = options.publicDir ?? resolve(ROOT, 'public')
  const outDir = options.outDir ?? SITE_DIR
  const fontsDir = options.fontsDir ?? resolve(ROOT, 'assets/fonts')
  const gravatarFile = options.gravatarFile ?? GRAVATAR_FILE
  const colors = COLOR_PRESETS[profile.profile.theme.colors]
  const site = profile.site
  const messages: string[] = []
  const files = new Set<string>()
  const result = (faviconSource: FaviconSource, ogSource: OgImageSource): BuildSiteAssetsResult => ({
    files: [...files].sort(),
    faviconSource,
    ogSource,
    messages,
    version: Date.now().toString(36),
  })

  const write = async (name: string, body: Buffer | string) => {
    await writeFile(resolve(outDir, name), body)
    files.add(name)
  }

  try {
    await mkdir(outDir, { recursive: true })
  }
  catch (error) {
    messages.push(`site: cannot create ${outDir} (${reasonOf(error)}), kept the fallback files`)
    return result('none', 'none')
  }

  /** The avatar file the page shows: `profile.avatar`, else the downloaded Gravatar. `null` = initials. Throws for a remote avatar. */
  const avatarFile = (): string | null => {
    if (profile.profile.avatar) return localFile(publicDir, profile.profile.avatar)
    return existsSync(gravatarFile) ? gravatarFile : null
  }

  // Favicon set.
  let faviconSource: FaviconSource = 'none'
  const artSources: [string, () => Promise<FaviconArt | null>][] = [
    ['favicon upload', async () => (site?.favicon ? uploadArt(localFile(publicDir, site.favicon)) : null)],
    ['avatar', async () => {
      const file = avatarFile()
      return file ? avatarArt(file) : null
    }],
    ['initials', () => initialsArt(profile.profile.name, colors, fontsDir)],
  ]
  let art: FaviconArt | null = null
  for (const [label, make] of artSources) {
    try {
      art = await make()
      if (art) break
    }
    catch (error) {
      messages.push(`site: ${label} not usable (${reasonOf(error)}), trying the next source`)
    }
  }
  if (art) {
    try {
      const ground = colors.light.ground
      const inner = art.shape === 'circle' ? MASK_CIRCLE_SIZE : MASK_SQUARE_SIZE
      await write(SITE_FILES.faviconIco, icoFromPng(await resizeTo(art.master, 32), 32))
      await write(SITE_FILES.icon192, await resizeTo(art.master, 192))
      await write(SITE_FILES.icon512, await resizeTo(art.master, MASTER_SIZE))
      await write(SITE_FILES.appleTouchIcon, await onGround(art.bleed ?? art.master, 180, 180, ground))
      await write(SITE_FILES.iconMask, art.mask
        ? await onGround(art.mask, MASTER_SIZE, MASTER_SIZE, ground)
        : await onGround(art.master, MASTER_SIZE, inner, ground))
      if (art.svg) await write(SITE_FILES.iconSvg, art.svg)
      else await rm(resolve(outDir, SITE_FILES.iconSvg), { force: true })

      const name = profile.profile.name
      const manifest = {
        name: siteTitle(profile.profile, site),
        short_name: (splitName(name)?.first ?? name).slice(0, 12),
        start_url: '/',
        display: 'browser',
        theme_color: ground,
        background_color: ground,
        icons: [
          { src: `${SITE_PUBLIC_DIR}/${SITE_FILES.icon192}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${SITE_PUBLIC_DIR}/${SITE_FILES.icon512}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${SITE_PUBLIC_DIR}/${SITE_FILES.iconMask}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      }
      await write(SITE_FILES.manifest, `${JSON.stringify(manifest, null, 2)}\n`)
      faviconSource = art.source
    }
    catch (error) {
      messages.push(`site: favicon set not written (${reasonOf(error)}), the page keeps /favicon.ico`)
    }
  }
  else {
    messages.push('site: no favicon source worked, the page keeps /favicon.ico')
  }

  // Social preview image.
  let ogSource: OgImageSource = 'none'
  if (site?.ogImage) {
    try {
      await write(SITE_FILES.ogImage, await ogPng(sharp(await readFile(localFile(publicDir, site.ogImage))).rotate()))
      ogSource = 'upload'
    }
    catch (error) {
      messages.push(`site: social image upload not usable (${reasonOf(error)}), generating one`)
    }
  }
  if (ogSource === 'none') {
    try {
      let avatar: string | null = null
      try {
        const file = avatarFile()
        avatar = file ? await avatarDataUri(file, 368) : null
      }
      catch {
        avatar = null // no readable avatar: the card shows the initials
      }
      const host = siteHost(resolveSiteUrl(options.envSiteUrl, site))
      const svg = await renderSvg(ogCard(profile, colors.light, host, avatar), OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, fontsDir)
      await write(SITE_FILES.ogImage, await ogPng(sharp(Buffer.from(svg))))
      ogSource = 'generated'
    }
    catch (error) {
      messages.push(`site: social image not generated (${reasonOf(error)}), the page keeps /og.png`)
    }
  }

  return result(faviconSource, ogSource)
}
