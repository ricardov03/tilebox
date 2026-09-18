# Plan: tilebox

A Bento-style personal portfolio. Static. Self-hosted.
Repo: `github.com/ricardov03/tilebox` (Ricardo creates it on GitHub). npm name `tilebox` is free (checked 2026-09-17).

Date: 2026-09-17 (v4: canvas synced, images phase)
Status: v1 done. WP6 release tooling done. WP7 (personal data out of git) done. WP8 publish command on `wp/8-publish` (needs Ricardo's real login for the final check). WP9 profile extras (pulsing dot, highlights, private email, Gravatar avatar) on `wp/9-profile-extras`. Open: real content from Ricardo, Safari/Firefox manual check, history rewrite to drop old attribution trailers. Next: section 13 (Pexels).
Design canvas: https://claude.ai/artifact/NxtZpWcB2B3JEwwL3kahzZ (local copy of the boards: `design/canvas/`)

## 0. Rules for every agent (read first)

1. Read this file fully before you touch code.
2. Only edit files your work package (WP) owns. See section 8. If you need a change in another WP's file, write it in `NOTES.md` under your WP heading. Do not edit it.
3. The contract files (section 8, WP0) are frozen after WP0. Do not change `types/profile.ts` or `app/assets/css/main.css` tokens without a note.
4. TypeScript strict. No `any`. No `console.log` left behind.
5. No third-party JS on the public page. No runtime network calls on the public page.
6. Every WP ends with: `npm run lint`, `npm run typecheck`, `npm run generate` all green. Paste the output in `NOTES.md`.
7. Every WP is reviewed by Grok before it is "done" (section 9). Fix all blocking findings.
8. Commit per WP on a branch `wp/<n>-<name>`. Small commits. Message in present tense.

## 1. What we build

A small personal page like Bento.me / Linktree.
- One page. Profile block. A grid of tiles (Bento style). Each tile has a size.
- You edit it on your machine. No backend. No database.
- You push to Git. Cloudflare Pages (or Netlify) builds it and hosts it.

## 2. Reference: what Bento.me did

- Linktree bought Bento in June 2023. Bento shut down on 2026-02-13.
- Grid of tiles. Sizes `1x1`, `2x1`, `1x2`, `2x2` on a 4-column grid.
- Tile types: link, social, image, text, section title, map, video.
- Separate order for mobile and desktop. Themes. Custom domain.

We copy the first three. We skip analytics, auth, paid domains.

## 3. Stack (decided)

| Part | Choice | Version (2026-09-17) |
|---|---|---|
| Framework | Nuxt 4, static output (`nuxt generate`) | nuxt 4.5.2 |
| Node | Active LTS | 24 (Nuxt 4.5 needs `^22.19 || ^24.11`) |
| CSS | Tailwind CSS 4 via `@tailwindcss/vite` | tailwindcss 4.3.3 |
| Fonts | `@nuxt/fonts` (self-hosts Google Fonts at build) | 0.14.0 |
| Icons | `@nuxt/icon` + Iconify JSON packs. Default set `line-md`. Fallback `simple-icons` for brands. Browse at https://icones.js.org | 2.5.1 |
| Drag and drop (editor only) | `vue-draggable-plus` (SortableJS). Fallback: gridstack.js | 0.6.1 / 13.3.0 |
| Lint | ESLint via `@nuxt/eslint` | |
| Package manager | npm | |

Do NOT use `@nuxtjs/tailwindcss`. Its Tailwind 4 branch is still beta after a year. Tailwind's own Nuxt guide uses the Vite plugin.

### 3.1 Tailwind setup

```bash
npm install tailwindcss @tailwindcss/vite
```

```ts
// nuxt.config.ts
import tailwindcss from '@tailwindcss/vite'
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  modules: ['@nuxt/fonts', '@nuxt/icon', '@nuxt/eslint'],
  // profile.json is read here at config time (see section 5.4)
  fonts: { families: fontsFor(profile.profile.theme.fonts) },
  icon: {
    provider: 'none',
    mode: 'svg',                      // line-md icons animate. CSS mask mode kills that.
    clientBundle: { scan: true, sizeLimitKb: 256, icons: iconsIn(profile) },
  },
  routeRules: { '/edit': { prerender: false }, '/api/**': { prerender: false } },
  nitro: { prerender: { crawlLinks: true, ignore: ['/edit', '/api'] } },
})
```

```css
/* app/assets/css/main.css */
@import "tailwindcss";
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
@theme {
  /* filled from section 5 after the design pick */
}
```

Gotchas found in research:
- `@nuxt/fonts` only downloads a font that appears in generated CSS. Use each `font-*` utility at least once, or set `fonts.families[{ name, global: true }]`.
- Default font weights are `400 700`. List the weights you need in `fonts.families`.
- Add `.data/` to `.gitignore` (fonts cache).
- `@nuxt/icon`: `provider: 'none'` stops runtime calls to the Iconify API. `scan: true` only finds literal icon names like `lucide:mail`. Dynamic names must be listed in `clientBundle.icons`.
- Icon `mode: 'svg'` is required. `line-md` icons are animated SVG. CSS mask mode drops the animation.
- `nuxt generate` = `nuxt build --prerender`. Server routes do not exist in the output. They run only in dev. That is what we want for `/api/save`.
- `import.meta.dev` is a build-time flag in Nitro. Code behind it is removed from the prod build.

### 3.2 Dev-only save route

```ts
// server/api/save.post.ts
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404 })
  const body = await readBody(event)
  // validate with the zod schema from types/profile.ts before writing
  await writeFile(resolve(process.cwd(), 'content/profile.json'), JSON.stringify(body, null, 2))
  return { ok: true }
})
```

## 4. Grid system (editor drag-and-drop)

Public page grid needs no library. It is CSS Grid:
- 4 columns at `>= 1024px`, 2 columns below, 1 column at `< 400px`.
- `2x1` = `col-span-2`. `1x2` = `row-span-2`. `2x2` = both. `section` = full row, auto height.
- `grid-auto-rows` fixed per breakpoint (desktop 240px, phone 173px). `grid-auto-flow: dense` is OFF. Order is the user's order.

Editor drag-and-drop (research 2026-09-17, npm data):

| Library | Version | Weekly dl | 2D spans + reflow | Size gz | License | Verdict |
|---|---|---|---|---|---|---|
| vue-draggable-plus (SortableJS) | 0.6.1 | 210k | No. Reorders a list. CSS grid reflows. | 14 kB | MIT | **Pick** |
| gridstack.js + `gridstack/dist/vue` | 13.3.0 | 419k | Yes. x/y/w/h engine. | 23 kB + CSS | MIT | Fallback |
| grid-layout-plus | 1.1.1 | 81k | Yes | 43 kB | MIT | Heavier, v2 in beta |
| @formkit/drag-and-drop | 0.6.1 | 79k | No | 5 kB | MIT | Lighter Sortable, less tested on grids |
| swapy | 1.0.5 | 15k | No, swap only | 8 kB | GPL-3 | Reject |
| muuri, vue-grid-layout | 2021 / 2022 | | | | | Dead |

Why vue-draggable-plus: our data model is an ordered list per breakpoint plus a size. Sortable reorders that list on the real CSS grid. The editor stays what-you-see-is-what-you-get. No new data model.

Known issue: SortableJS #2335. CSS grid with mixed item heights can jitter when you drag across rows.
Mitigation (required in WP3):
- `swapThreshold: 0.65`, `invertSwap: true`, `animation: 150`, `forceFallback: true`.
- Custom `direction()` from the SortableJS README (full/half column example).
- Editor component is `app/components/editor/BlockGridEditor.client.vue`. Two instances: desktop 4-col and mobile 2-col.
- Dynamic `import()` of the lib inside the client component. Never at top of a shared file.

If Sortable feels janky with 2x2 tiles after 1 day of tuning, switch to gridstack. Convert its x/y output to our order arrays by row-major sort. Say so in `NOTES.md`.

## 5. Design system: presets (like PowerPoint themes)

The page has a theme made of 3 parts. Each part is a preset you pick in the editor.
Like the Design tab in PowerPoint: one click changes the whole page.

```
theme = { colors: <color preset>, fonts: <font preset>, mode: system | light | dark }
```

Reference boards on the canvas: https://claude.ai/artifact/NxtZpWcB2B3JEwwL3kahzZ
(board A = `lunchbox` colors + `lunchbox` fonts. Board B = `night` colors + `night` fonts.)

### 5.1 Color roles (same 13 slots in every preset)

Same idea as PowerPoint theme colors. Every component uses only these names.

| Role | CSS var | Used for |
|---|---|---|
| ground | `--color-ground` | page background |
| tile | `--color-tile` | tile background |
| line | `--color-line` | tile border, dividers |
| ink | `--color-ink` | headings, main text |
| muted | `--color-muted` | secondary text |
| accent | `--color-accent` | the one highlighted tile, focus ring, links on hover |
| accent-ink | `--color-accent-ink` | text on top of accent |
| accent-soft | `--color-accent-soft` | small text on the accent tile |
| pop | `--color-pop` | one small highlight tile |
| pop-ink | `--color-pop-ink` | text on the pop tile |
| dot | `--color-dot` | status dot |
| photo | `--color-photo` | image tile placeholder while loading |
| hover | `--color-hover` | link hover color |

### 5.2 Color presets (3 for v1)

Canvas sync 2026-09-17: the design tool reworked both boards. Board A is now the CONDOMERA light look. Board B is the CONDOMERA dark look. So `condomera` is the default preset. Its light values come from board A. Its dark values come from board B.

| Role | `condomera` (default) | `lunchbox` | `night` |
|---|---|---|---|
| ground | `#EEF4F8` | `#E8EBE4` | `#131826` |
| tile | `#FFFFFF` | `#FFFFFF` | `#1B2233` |
| line | `rgba(12,74,110,0.10)` | `rgba(27,33,28,0.08)` | `#2B3448` |
| ink | `#0B1F33` | `#1B211C` | `#EEF1F7` |
| muted | `#4A6075` | `#5A635B` | `#9AA3B8` |
| accent | `#0C4A6E` (sky-900) | `#3E6B3B` moss | `#F3B33D` amber |
| accent-ink | `#FFFFFF` | `#FFFFFF` | `#131826` |
| accent-soft | `#BAE6FD` (sky-200) | `#DCE5D6` | `#0C4A6E` |
| pop | `#0369A1` (sky-700, was sky-600; white text needs 4.5:1) | `#F0C24B` yuzu | `#F3B33D` |
| pop-ink | `#FFFFFF` | `#1B211C` | `#131826` |
| dot | `#0EA5E9` (sky-500) | `#F0C24B` | `#F3B33D` |
| photo | `#C7DEEC` | `#C9D3C2` | `#232B40` |
| hover | `#0369A1` (sky-700) | `#3E6B3B` | `#F3B33D` |

Dark mode of each preset (`[data-theme=dark]`):

| Role | `condomera` dark (board B) | `lunchbox` dark | `night` dark (= light) |
|---|---|---|---|
| ground | `#081726` | `#161A17` | `#131826` |
| tile | `#0F2438` | `#1F2521` | `#1B2233` |
| line | `#1E3A55` | `rgba(238,241,236,0.10)` | `#2B3448` |
| ink | `#EAF3FA` | `#EEF1EC` | `#EEF1F7` |
| muted | `#9FB6CA` | `#A5ADA6` | `#9AA3B8` |
| accent | `#38BDF8` (sky-400) | `#5C8F58` | `#F3B33D` |
| accent-ink | `#081726` | `#0F140F` | `#131826` |
| accent-soft | `#0A3D5C` (was `#0C4A6E`, contrast) | `#0F1A0D` (was `#2E4A2C`, contrast) | `#0C4A6E` |
| pop | `#38BDF8` | `#F0C24B` | `#F3B33D` |
| pop-ink | `#081726` | `#1B211C` | `#131826` |
| dot | `#38BDF8` | `#F0C24B` | `#F3B33D` |
| photo | `#16324B` | `#2A332C` | `#232B40` |
| hover | `#7DD3FC` (sky-300) | `#8FBF8B` | `#F3B33D` |

`accent-soft` is the small text on top of the accent tile (the domain label). `pop-ink` is text on the pop tile.

`condomera` matches `landing-condomera/DESIGN.md`: sky primary, slate neutral. Keep it in sync if the brand changes.
`night` light mode: `#F2F3F6` ground, `#FFFFFF` tile, `#DDE1EA` line, `#131826` ink, `#5B6478` muted, amber accent, `#131826` accent-ink, hover `#855400` (dark amber; the bright amber fails contrast on light).

Layout note: board B shows a left-rail layout. That is NOT the dark mode layout. Dark mode keeps the hero-tile layout of board A. The rail layout can become a `layout` preset later (section 13).

### 5.3 Font presets (3 for v1)

Each preset is a font group with 3 roles: display, body, mono. Mono is for small data labels: handles, domains, dates, time zone. Google Fonts only, self-hosted by `@nuxt/fonts`.

| Preset | Display | Body | Mono | Feel |
|---|---|---|---|---|
| `geist` (default, on the canvas) | Geist 600, tracking -0.04em | Geist 400/500 | Geist Mono 400/500 | clean, product |
| `lunchbox` | Fraunces 500, `opsz 144`, `SOFT 40`, tracking -0.03em | Instrument Sans 400/500/600 | IBM Plex Mono 400/500 | warm, editorial |
| `night` | Bricolage Grotesque 700, `opsz 96`, tracking -0.045em | Bricolage Grotesque 400/500 | JetBrains Mono 400/500 | bold, studio |

Type scale (from the canvas, same in all presets):

| Token | Desktop | Phone | Use |
|---|---|---|---|
| name | 68px / 1.0, weight 600 | 42px / 1.0 | profile name (h1) |
| tile-title | 34px / 1.05, weight 600 | 26px | big link tile title |
| tile-heading | 26px / 1.1, weight 600 | 22px | text tile heading |
| label | 18px / 1.3, weight 600 | 16px | small tile label |
| bio | 19px / 1.45 | 16px | profile bio |
| body | 16px / 1.55 | 14px / 1.5 | text tile body |
| meta (mono) | 14px / 1.4 | 13px | handles, domains, time zone |
| footnote (mono) | 13px | 12px | dates |
| status | 15px, weight 500 | 14px | status line next to the dot |

Any color preset works with any font preset. 9 combinations. The canvas shows `condomera` + `geist` in light (board A) and dark (board B).

### 5.4 How presets are wired

- `app/assets/css/presets.css`: one `[data-colors="<name>"]` block per color preset (light values), one `[data-colors="<name>"][data-theme="dark"]` block for dark. One `[data-fonts="<name>"]` block per font preset that sets `--font-display`, `--font-sans` and `--font-mono`.
- `main.css` uses `@theme inline { --color-ground: var(--color-ground); ... }` so Tailwind utilities like `bg-ground` read the live variables.
- `<html data-colors="lunchbox" data-fonts="lunchbox" data-theme="light">`. Set from `profile.json` at render. Mode toggled by `useTheme`.
- `nuxt.config.ts` imports `content/profile.json` at config time. It builds `fonts.families` for the chosen font preset only. Other presets are not downloaded. Switching preset = save in editor + restart dev (the editor tells you).
- Presets live in `app/utils/presets.ts` as typed objects (name, label, roles, fonts). The editor and the CSS are generated from the same source. `scripts/build-presets.ts` writes `presets.css` from it. Runs in `predev` and `pregenerate`.
- Adding a preset = add one object to `presets.ts`. Nothing else.

### 5.5 Icons

- Library: `@nuxt/icon` with local Iconify JSON packs. No runtime network.
- Default set: `line-md` (https://icones.js.org/collection/line-md). 1218 animated line icons. Install `@iconify-json/line-md`.
- Brand fallback: `simple-icons`. Install `@iconify-json/simple-icons`. Use only when `line-md` lacks the brand (WhatsApp, Dribbble, Behance, Medium).
- Any icon in `profile.json` is a full Iconify name: `line-md:github`. Any collection works if its `@iconify-json/<prefix>` pack is installed.
- Public page bundle: `nuxt.config.ts` collects every icon name in `profile.json` plus the social map into `icon.clientBundle.icons`. Zero icons fetched at runtime.
- Editor icon picker (`app/components/editor/IconPicker.vue`): a search box. Dev only, so it may call the Iconify search API (`https://api.iconify.design/search?query=<q>&prefix=line-md`). It shows results as live `<Icon>` previews. It has a link "Browse all on icones.js.org". You can also paste any `prefix:name`.
- `scripts/check-icons.ts`: reads `profile.json`, checks every icon name exists in an installed pack. Fails `generate` with a clear message if not. The save route runs the same check and returns the error to the editor.

Social network map (`app/utils/networks.ts`):

| network | icon | label |
|---|---|---|
| github | `line-md:github` | GitHub |
| linkedin | `line-md:linkedin` | LinkedIn |
| x | `line-md:twitter-x` | X |
| instagram | `line-md:instagram` | Instagram |
| youtube | `line-md:youtube` | YouTube |
| tiktok | `line-md:tiktok` | TikTok |
| discord | `line-md:discord` | Discord |
| telegram | `line-md:telegram` | Telegram |
| mastodon | `line-md:mastodon` | Mastodon |
| spotify | `line-md:spotify` | Spotify |
| reddit | `line-md:reddit` | Reddit |
| facebook | `line-md:facebook` | Facebook |
| email | `line-md:email` | Email |
| whatsapp | `simple-icons:whatsapp` | WhatsApp |
| dribbble | `simple-icons:dribbble` | Dribbble |
| behance | `simple-icons:behance` | Behance |
| medium | `simple-icons:medium` | Medium |

UI icons: link `line-md:link`, external `line-md:external-link`, map `line-md:map-marker`, play `line-md:play`, home `line-md:home`.

### 5.6 Design rules for agents
- Real `<a>` for every link tile. Focus ring visible: 2px `--color-accent` outline, 2px offset.
- Text contrast 4.5:1 minimum on every preset, light and dark, for every text pair including accent-soft and hover. `npm run check:contrast` runs in `pregenerate` and fails the build on a regression. Values above are the checked ones (2026-09-17).
- Tiles: `rounded-tile` = 24px on phones, 28px from 768px (one token, `--radius-tile`, responsive). 1px `--color-line` border. No shadow. Hover: lift 2px.
- Motion: one page-load stagger of tiles (40ms each, 300ms, opacity + 8px translate). `line-md` icons draw themselves once on load. The status dot pulses (`animate-pulse`, WP9). Nothing else. Respect `prefers-reduced-motion` (stagger off; icons get `animation: none` via CSS).
- Avatar: 96px circle desktop, 64px phone. Fallback = initials on the accent color with accent-soft text. Compact scale (WP9, when the profile has highlights or a visible email): 64px desktop, 40px phone, name 56px / 36px, bio 17px / 16px limited to 3 lines, so the fixed 2x2 tile never overflows.
- Photo tile: image covers the tile. Caption sits bottom-left on a soft scrim only if `caption` is set.
- No gradients, no shadows, no emoji as icons.

## 6. Data shape (`content/profile.json`)

Two files, one shape (WP7): `content/profile.json` is the user's document, ignored by git, created by `predev` from the example, written by the editor. `content/profile.example.json` is the tracked sample. `content/resolve.ts` picks the personal file when it exists, else the example; every entry point (`nuxt.config.ts`, scripts, server routes, tests) goes through it. GitHub CI and the release zip build the example. Personal images (`public/avatar.*`, `public/blocks/*` except `sample.jpg`) and the fetched `public/icons/*`, `public/thumbs/*` are ignored too.

```json
{
  "profile": {
    "name": "Ricardo Vargas",
    "handle": "ricardov",
    "bio": "Front-end developer. I build web products with Nuxt and Vue.",
    "highlights": ["Nuxt, Vue and TypeScript", "Design systems and accessible UI", "Founder of CONDOMERA"],
    "email": "you@example.com",
    "showEmail": false,
    "avatar": "/avatar.jpg",
    "status": "Now building CONDOMERA",
    "theme": { "colors": "condomera", "fonts": "geist", "mode": "system" }
  },
  "blocks": [
    { "id": "b1", "type": "link",    "size": "2x1", "title": "CONDOMERA", "url": "https://condomera.com", "description": "Software for condominium boards.", "accent": true },
    { "id": "b2", "type": "social",  "size": "1x1", "network": "github",   "url": "https://github.com/x", "label": "@ricardov" },
    { "id": "b3", "type": "social",  "size": "1x1", "network": "linkedin", "url": "https://linkedin.com/in/x" },
    { "id": "b4", "type": "image",   "size": "2x2", "src": "/blocks/photo.jpg", "alt": "...", "caption": "A photo tile.", "source": null },
    { "id": "b5", "type": "text",    "size": "1x2", "title": "Now", "body": "Markdown ok", "footnote": "Updated Sep 2026" },
    { "id": "b6", "type": "map",     "size": "1x1", "label": "Bogota", "sublabel": "GMT-5", "url": "https://maps.google.com/?q=Bogota" },
    { "id": "b7", "type": "link",    "size": "1x1", "title": "Say hello", "url": "mailto:x@y.z", "icon": "line-md:email", "pop": true },
    { "id": "b8", "type": "section", "title": "Projects" },
    { "id": "b9", "type": "video",   "size": "2x1", "url": "https://youtube.com/watch?v=...", "title": "A talk" }
  ],
  "layout": {
    "desktop": ["b1","b2","b3","b4","b5","b6","b7","b8","b9"],
    "mobile":  ["b1","b4","b2","b3","b5","b6","b7","b8","b9"]
  }
}
```

Rules:
- `profile.highlights` (WP9): optional, max 3 strings, 1 to 80 chars each, default `[]`. A real `<ul>` under the bio.
- `profile.email` (WP9): required, `z.email()`. `profile.showEmail`: boolean, default `false`. The public page never imports this file. It imports `#profile` = `.nuxt/tilebox/public-profile.json`, the output of `toPublicProfile()` (`types/profile.ts`), written by `modules/public-profile.ts`: no `email` unless `showEmail` is true, no `showEmail` key, `avatar` already resolved. Type: `PublicProfile`.
- Avatar precedence (WP9): `profile.avatar` when set, else `/avatar.gravatar.jpg` when `scripts/fetch-avatar.ts` downloaded it (Gravatar, sha256 of the email, build time only, never at runtime), else initials.
- `id` unique. `size` in `1x1 | 2x1 | 1x2 | 2x2`. `section` has no size.
- `layout.mobile` optional. Falls back to `layout.desktop`.
- Validate with `zod` in `types/profile.ts`. Export both the schema and the TS types from it.
- Social `network` is a key of the map in section 5.5 (`app/utils/networks.ts`).
- `theme.colors` and `theme.fonts` are keys of `app/utils/presets.ts`. zod enum. Unknown key = validation error.
- `icon` on any block is optional. Full Iconify name. Link tiles without `icon` show the fetched favicon.
- `image.source` is `null` in v1. Later it holds `{ provider: 'unsplash' | 'pexels' | 'r2', id, url, author, authorUrl }` (section 13). The schema has the field from day one so old JSON stays valid.

## 7. Folder layout

```
tilebox/
  PLAN.md  NOTES.md  README.md
  content/profile.json          # yours, ignored by git (WP7)
  content/profile.example.json  # the tracked sample
  content/resolve.ts            # picks profile.json or the example
  public/avatar.jpg  public/blocks/  public/icons/  public/og.png   # avatar, blocks/* (except sample.jpg), icons/* ignored
  app/
    app.vue
    assets/css/main.css  assets/css/presets.css   # presets.css is generated
    pages/index.vue           # public page (prerendered)
    pages/edit.vue            # local editor (dev only)
    layouts/default.vue
    components/
      ProfileHeader.vue  BentoGrid.vue  ThemeToggle.vue
      blocks/  index.ts  LinkBlock.vue  SocialBlock.vue  ImageBlock.vue
               TextBlock.vue  SectionBlock.vue  MapBlock.vue  VideoBlock.vue
      editor/  BlockForm.vue  BlockList.vue  LayoutSwitch.vue  ImagePicker.vue
               ThemePanel.vue  IconPicker.vue  BlockGridEditor.client.vue
    composables/useProfile.ts  useTheme.ts
    utils/networks.ts  sizes.ts  presets.ts
  server/api/save.post.ts  server/api/upload.post.ts   # dev only
  types/profile.ts
  scripts/fetch-favicons.ts   # runs before generate
  scripts/build-presets.ts    # presets.ts -> presets.css, runs predev + pregenerate
  scripts/check-icons.ts      # every icon in profile.json exists in an installed pack
  scripts/check-contrast.ts   # WCAG numbers for all presets
  nuxt.config.ts  app.config.ts  eslint.config.mjs  tsconfig.json
  netlify.toml  .nvmrc  .gitignore  .github/workflows/ci.yml
```

## 8. Work packages (for parallel agents)

WP0 runs first, alone. WP1 to WP4 run in parallel after WP0. WP5 runs last.

### WP0. Scaffold + contract (sequential, 1 agent)
First: `git init`, first commit, then `git remote add origin git@github.com:ricardov03/tilebox.git` and `git push -u origin main`. The GitHub repo already exists (Ricardo made it).
Owns: `nuxt.config.ts`, `app.config.ts`, `package.json`, `tsconfig.json`, `eslint.config.mjs`, `app/app.vue`, `app/assets/css/*`, `types/profile.ts`, `content/profile.json`, `app/utils/*`, `scripts/build-presets.ts`, `scripts/check-contrast.ts`, `.gitignore`, `.nvmrc`, `NOTES.md`.
Done when: `npm run dev` shows a blank page with the fonts loaded. `npm run generate` outputs `dist/`. `presets.ts` has the 3 color presets (13 roles each, light + dark) and 3 font presets (display, body, mono) from section 5. `build-presets.ts` generates `presets.css`. `check-contrast.ts` passes for all presets, light and dark. `types/profile.ts` has zod schema + types + `SIZES` map + preset enums. `content/profile.json` validates. `nuxt.config.ts` derives `fonts.families` and `icon.clientBundle.icons` from `profile.json`. `@iconify-json/line-md` and `@iconify-json/simple-icons` installed. `<Icon name="line-md:github">` renders and animates.

### WP1. Public page shell
Owns: `app/pages/index.vue`, `app/layouts/default.vue`, `app/components/ProfileHeader.vue`, `app/components/BentoGrid.vue`, `app/components/ThemeToggle.vue`, `app/composables/useProfile.ts`, `app/composables/useTheme.ts`.
Uses: `app/components/blocks/index.ts` from WP2. Until it exists, render a grey placeholder tile per block.
Done when: the grid matches the canvas board at 1280 and 390. Theme toggle works and persists. `useSeoMeta` has title, description, OG image. Page-load stagger done.

### WP2. Block components
Owns: `app/components/blocks/*`, `scripts/fetch-favicons.ts`, `scripts/check-icons.ts`, `public/icons/`, `public/thumbs/`. May add its scripts to `package.json` (`check:icons`, `fetch:favicons`, `pregenerate`) with a note in `NOTES.md`.
Done when: all 7 block types render from `content/profile.json` on all 3 color presets. Link tile shows `icon` if set, else a favicon fetched at build (fallback `line-md:link`). `check-icons.ts` runs in `pregenerate` and fails on an unknown icon. Video tile shows a thumbnail and loads the iframe only on click. Map tile is a link, no map JS. All tiles keyboard focusable.

### WP3. Local editor
Owns: `app/pages/edit.vue`, `app/components/editor/*`, `server/api/*`, `server/utils/*`, `app/composables/useEditor.ts`. May add its dependencies and scripts to `package.json` with a note in `NOTES.md`.
Done when: at `/edit` you can add, edit, delete, resize, reorder (drag) blocks. Desktop / mobile order switch. Theme panel: 3 color swatches, 3 font cards, mode switch. Click = live preview. Icon picker with Iconify search (line-md first) and a link to icones.js.org. Save runs `check-icons` and zod. Changing the font preset shows a note: restart `npm run dev` to download the new fonts. Save writes `content/profile.json` after zod validation. Image picker copies a file into `public/blocks/`. `/edit` is NOT in `dist/`. Save route 404s in prod build.

### WP4. Deploy + docs + CI
Owns: `netlify.toml`, `README.md`, `.github/workflows/ci.yml`, `public/og.png`.
Done when: CI runs lint + typecheck + generate on push. README says how to edit, run, deploy. Cloudflare Pages settings written down (build `npm run generate`, output `dist`, `NODE_VERSION=24`). No Nitro preset set. `nitro.prerender.autoSubfolderIndex: false`.

### WP5. Integration + QA (sequential, 1 agent)
Owns: nothing new. Fixes across WPs allowed here only.
Done when: Lighthouse mobile 94+ performance and 100 on the other three; the page-load stagger costs ~1 point by design. axe has 0 serious issues. Headless Chromium verified by Playwright; Safari and Firefox are a manual check by Ricardo. Real content in `profile.json` (from Ricardo).

### WP6. Release and deploy tooling
Owns: `scripts/release.mjs`, `.versionrc.json`, `commitlint.config.mjs`, `releases/`, `.github/workflows/release.yml`, `package.json` scripts (`release`, `deploy`, `deploy:preview`, `prepare`, `simple-git-hooks`).
Design (decided by Ricardo): releases start locally with `npm run release`. No bot, no PAT, no API keys. The pipeline only validates a pushed tag and publishes the GitHub Release with `GITHUB_TOKEN`. Deploy to Cloudflare Pages is a manual local wrangler command. Commit messages are checked by a local git hook (commitlint), not in CI. The plain-words release summary is drafted by a local AI CLI (`claude`, fallback `grok`), shown in the terminal, and accepted, edited or replaced by the user.
Done when: `git commit -m "bad message"` is rejected by the hook and `chore: x` passes. `node scripts/release.mjs --dry-run --no-ai --skip-tests` prints the next version and the release file preview and leaves the tree clean. `node scripts/release.mjs --dry-run --skip-tests --yes` shows a draft from `claude -p`. `.github/workflows/release.yml` is valid YAML and fails when the tag differs from `package.json`. `releases/v0.1.0.md` exists. README has "Commit messages", "Release" and "Deploy" sections. `npm run lint`, `npm run typecheck`, `npm run generate` green.

### WP7. Personal data out of git
Owns: `content/*` (`profile.example.json`, `resolve.ts`, `README.md`), the "Personal data" block in `.gitignore`, `public/icons/.gitkeep`, `public/thumbs/.gitkeep`, `scripts/ensure-profile.ts`, `scripts/validate-profile.ts`, `tests/e2e/repo.spec.ts`, `app/components/blocks/empty-manifest.ts`, the `#profile` and `#manifest/*` aliases in `nuxt.config.ts`, the profile read and write paths in `server/utils/editor.ts`, `package.json` scripts (`ensure:profile`, `predev`), the personal-data preflight in `scripts/release.mjs`.
Design (decided by Ricardo): `content/profile.json` is the user's personal document. It is never committed, pushed, or replaced by a git update or a release. Same for personal images. The repo ships a sample (`content/profile.example.json`). One resolver (`content/resolve.ts`) picks the personal file when it exists, else the example, and every entry point uses it. The save route always writes the personal file. `predev` creates the personal file from the example; `pregenerate` does not, so CI and the release zip build the sample site. Only `npm run deploy` / `npm run deploy:preview` publish the real site.
Done when: `git ls-files` has `content/profile.example.json` and not `content/profile.json`, `public/avatar.*`, `public/icons/manifest.json` or `public/thumbs/*`. A fresh clone builds with `npm run generate` without a `profile.json` and prints `profile: content/profile.example.json (example)`. The first `npm run dev` creates `content/profile.json`, prints one line about it, and `git status` stays clean. `npm run release` fails when `content/profile.json` or an image other than `sample.jpg` is tracked. `tests/e2e/repo.spec.ts` runs in the `static` project. `content/README.md` and the README section "Your personal data" exist. `npm run lint`, `npm run typecheck`, `npm run generate`, Playwright static green.

### WP8. Publish command
Owns: `scripts/publish.mjs`, `package.json` scripts (`publish`, `site:publish`, `deploy`, `deploy:preview`) and the `netlify-cli` dev dependency, README "Publish" section, `.tilebox/` and `.netlify/` lines in `.gitignore`.
Design (decided by Ricardo): `npm run publish` publishes from the user's machine, like `netlify init` + `netlify deploy --prod`. First run: pick a provider (Cloudflare Pages or Netlify), log in with the browser, pick a site name, check the free subdomain is available (Cloudflare: DNS lookup of `<name>.pages.dev`; Netlify: HTTPS HEAD of `<name>.netlify.app`, 404 = free), create the project, build with `NUXT_PUBLIC_SITE_URL` = the live URL, upload, print the live URL, save the choices in `.tilebox/publish.json`. Later runs: build + upload + print. No API key or token in the repo, ever; the CLIs (`wrangler`, `netlify-cli`, both dev dependencies) keep the login in the home folder. The old `deploy` and `deploy:preview` scripts are thin aliases of `publish`. Node built-ins only, same style as `scripts/release.mjs`.
Done when: `npm run publish -- --help` prints the usage. With fake `wrangler` and `netlify` shims first on `PATH`, `--provider cloudflare --name <free> --yes --no-build` and the Netlify equivalent create the project, write `.tilebox/publish.json` (provider, name, accountId or accountSlug, siteId, url, createdAt, lastPublishedAt) and print `Live: <url>`; the Netlify auto-suffix case stores the real name. A taken name (real DNS: `hono.pages.dev`; real HTTPS: `hono.netlify.app`) is refused before create. Invalid names, `--reset`, provider conflicts and a logged-out CLI fail with a clear message and exit 1 or 2. README "Publish" section, CLAUDE.md command, NOTES.md `## WP8`. `npm run lint` (covers `scripts/*.mjs`), `npm run typecheck`, `npm run generate` green. A real login and a real upload are verified by Ricardo.

### WP9. Profile extras
Owns: the `highlights`, `email`, `showEmail` fields and the `PublicProfile` types + `toPublicProfile()` in `types/profile.ts`, `modules/public-profile.ts`, the `#profile` alias target in `nuxt.config.ts`, `app/composables/useProfile.ts`, `app/components/ProfileHeader.vue`, `content/gravatar.ts`, `content/migrate.ts`, `scripts/fetch-avatar.ts`, the migration in `scripts/ensure-profile.ts`, the placeholder warning in `scripts/validate-profile.ts`, `server/api/avatar/gravatar.{get,post}.ts`, `app/components/editor/HighlightsField.vue`, `app/components/editor/GravatarButton.vue`, the Profile tab in `app/pages/edit.vue`, `tests/e2e/privacy.spec.ts`, `package.json` scripts (`fetch:avatar`, its place in `predev` and `pregenerate`).
Design (decided by Ricardo): (A) the status dot pulses, not under `prefers-reduced-motion`, and is `aria-hidden`. (B) Up to 3 highlights under the bio, as a list. (C) The email is required and private by default: with `showEmail: false` it is in no file of the built site, because the page imports a sanitized copy of the profile, never the raw file. With `showEmail: true` it is a `mailto:` link with `line-md:email` under the highlights. (D) The avatar comes from the email through Gravatar, downloaded at build time to `public/avatar.gravatar.jpg` (ignored by git). An uploaded `profile.avatar` wins. The public page never calls gravatar.com. The editor has the email field, the visibility checkbox, 3 highlight inputs with counters and a "Use my Gravatar" button (dev-only route).
Done when: `grep -r "hello@example.com" dist | wc -l` is 0 after `npm run generate` on the example. `tests/e2e/privacy.spec.ts` (every text file of `dist/` + the sanitizer unit checks) is green. A long bio + 3 long highlights + email + status stay inside the 2x2 tile at 1280 and 390. An old `profile.json` gets the 3 new keys from `ensure:profile`, one printed line, nothing else changed; a second run does nothing. A save in `/edit` reaches the public page in dev without a restart. `public/avatar.gravatar.jpg` is never tracked. axe stays at 0 violations. `npm run lint`, `npm run typecheck`, `npm run generate`, Playwright `static` and `dev` green. README, `content/README.md`, NOTES.md `## WP9`.

## 9. Code review with Grok

- Reviewer: Grok. Tools to run it: TBD (Ricardo provides).
- When: at the end of every WP, before merge. And once on the whole repo after WP5.
- Input: the WP branch diff plus this `PLAN.md` and the WP's `NOTES.md` section.
- Review prompt must ask for: correctness, TypeScript strictness, a11y, SSG safety (nothing runtime-only on the public page), files touched outside the WP's ownership, and unmet "Done when" items.
- Output: a list with severity `blocking | should | nit`. Blocking must be fixed. `should` fixed or answered in `NOTES.md`. `nit` optional.
- Fix loop: max 2 rounds per WP. After that, escalate to Ricardo.

## 10. Order of work

1. Decisions are in section 11. Done.
2. WP0.
3. WP1, WP2, WP3, WP4 in parallel. Each ends with a Grok review.
4. Merge WPs into `main`. WP5.
5. Push. Connect Cloudflare Pages. Check the live URL on a phone.

## 11. Decisions (answered 2026-09-17)

| Question | Answer |
|---|---|
| Design direction | Hero-tile layout (board A). Canvas reworked in the design tool on 2026-09-17: default presets are now colors `condomera`, fonts `geist`. Board B = dark mode values. |
| Who writes code | Agents in this session. The architect merges and runs the review loop. |
| Grok review timing | After each WP, before merge. Plus one full pass after WP5. |
| Editor `/edit` in v1 | Yes. WP3 runs in parallel. |
| Host | Cloudflare Pages first. Netlify config kept as backup. |
| Name (2026-09-17) | `tilebox`. Package name in `package.json` too. Folder renamed to `/Users/ricardov/Code/FrontEnd/tilebox` on 2026-09-17. |
| Theme system (2026-09-17, later) | Presets like PowerPoint. 3 color presets: `condomera`, `lunchbox`, `night`. 3 font presets: `geist`, `lunchbox`, `night`. |
| Images (2026-09-17, later) | v1 = local files in `public/blocks/`. Phase 2 = Pexels picker (decided). Phase 3 = personal uploads to R2. See section 13. |
| Icons (2026-09-17, later) | Iconify via `@nuxt/icon`. Default set `line-md`. Brand fallback `simple-icons`. Picker links to icones.js.org. |

Still needed from Ricardo before WP5 (not blocking):
- Real links: GitHub, LinkedIn, X, email, CONDOMERA URL.
- City for the map tile. Avatar image. One photo for the 2x2 tile.
- The Grok review tools (section 9).

## 12. Risks

- Favicon fetch at build fails offline. Fallback icon. Never fail the build.
- Cloudflare's default Node is 22.16, too old for Nuxt 4.5. Set `NODE_VERSION=24`.
- `@nuxt/icon` in SSG defaults to the Iconify API. `provider: 'none'` is required.
- `line-md` animations are inside the SVG. `prefers-reduced-motion` needs a CSS rule: `[data-reduced] svg * { animation: none !important }`. WP2 owns it.
- Reading `profile.json` in `nuxt.config.ts` means a preset or icon change needs a dev server restart. The editor says so after save.
- Drag-and-drop libs may touch `window` at import. Load them with `<ClientOnly>` and dynamic `import()` inside `/edit` only.

## 13. Later phases (not in v1)

### 13.1 Stock images for the Image block (Unsplash / Pexels)
Goal: pick a photo in the editor without leaving it. The public page stays static.

- Editor gets `ImagePicker.vue` tabs: `Local file` (v1) | `Unsplash` | `Pexels`.
- Search calls the provider API from the dev-only Nitro route `server/api/images/search.get.ts`. API keys live in `.env` (`UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`). Never shipped to the client. Never needed at build.
- On pick: the dev route downloads the chosen size (max 1600px wide) into `public/blocks/<id>.jpg`. The block gets `src: "/blocks/<id>.jpg"` and `source: { provider, id, url, author, authorUrl }`.
- The page shows a small credit line on the photo tile when `source` is set: "Photo by <author> on Unsplash". Both providers require attribution. Unsplash also requires a call to its download endpoint on pick. The dev route does that.
- Rate limits (verify before starting): Unsplash demo 50 req/h, Pexels 200 req/h. Fine for one person.
- Provider decided 2026-09-17: **Pexels** first. Unsplash later if wanted. Pexels rules: show "Photos provided by Pexels" somewhere on the page and credit the photographer with a link. Key: `PEXELS_API_KEY`.
- Owner: a new WP7 (WP6 is the release tooling). Depends on WP3. Grok review as usual.

### 13.2 Personal images on Cloudflare R2 (or similar)
Goal: use your own photos without committing big files to Git.

- Bucket on R2 with a public custom domain (`img.<yourdomain>`). Or Cloudflare Images if you want resizing on the fly.
- Editor tab `Upload`. The dev route `server/api/images/upload.post.ts` puts the file in R2 with the S3 API. Keys in `.env`. The block gets `src: "https://img.<yourdomain>/<id>.jpg"` and `source: { provider: 'r2', id }`.
- Also upload the avatar the same way.
- Add `@nuxt/image` only if we need `srcset`. With static generate it can prerender sizes for local files. Remote R2 files need Cloudflare Images or a `provider: 'cloudflare'` config. Decide then.
- Owner: WP7. Depends on WP6.

### 13.3 Other ideas
- `layout` preset: `hero-tile` (board A) | `rail` (board B left column).
- Import a Bento.me export zip.
- Open Graph image built at generate time from the profile.
- Blog or notes tile that reads a markdown folder.

## Sources
- https://tailwindcss.com/docs/installation/framework-guides/nuxt
- https://tailwindcss.com/docs/theme
- https://nuxt.com/docs/4.x/getting-started/prerendering
- https://nuxt.com/docs/4.x/api/advanced/import-meta
- https://fonts.nuxt.com/get-started/configuration
- https://github.com/nuxt/icon
- https://icones.js.org/collection/line-md
- https://api.iconify.design/collection?prefix=line-md (1218 icons, checked 2026-09-17)
- /Users/ricardov/Code/FrontEnd/landing-condomera/DESIGN.md (CONDOMERA colors)
- https://nuxt.com/deploy/cloudflare
- https://developers.cloudflare.com/pages/configuration/build-image/
- https://github.com/nuxt/nuxt/issues/28526
- https://github.com/alfred-skyblue/vue-draggable-plus
- https://github.com/SortableJS/Sortable/issues/2335
- https://github.com/gridstack/gridstack.js/tree/master/vue
- https://alternativeto.net/news/2025/12/bento-to-shut-down-in-2026-as-linktree-takes-over-and-offers-migration-path/
