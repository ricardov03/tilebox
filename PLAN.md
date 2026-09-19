# Plan: tilebox

A Bento-style personal portfolio. Static. Self-hosted.
Repo: `github.com/ricardov03/tilebox` (Ricardo creates it on GitHub). npm name `tilebox` is free (checked 2026-09-17).

Date: 2026-09-17 (v4: canvas synced, images phase)
Status: v1 done. WP6 release tooling done. WP7 (personal data out of git) done. WP8 publish command on `wp/8-publish` (needs Ricardo's real login for the final check). WP9 profile extras (pulsing dot, highlights, private email, Gravatar avatar) on `wp/9-profile-extras`. WP10 (smart links, site metadata) secured; ready to merge. WP11 (Linktree second wave: schedule, save contact, QR code, share button, UTM tags, link check) and WP12 (Pexels photo picker, section 13.1) are merged with the editor input fix and the review pipeline on `wp/14-reviewed`. WP11 second wave and WP12 Pexels reviewed and secured (NOTES.md, "WP14 review round"). WP15 review follow-up on `wp/15-review-followup` (NOTES.md, "WP15 review follow-up"): all WP11/WP12 blocks reviewed with evidence=full (B5a, B5b in two halves, B3 again; 5 real findings fixed, 2 false positives), the review pipeline retries a 1-turn stub and labels the evidence, and the Gravatar download follows the rules of the link icons (`public/avatar.gravatar.webp`). WP16 review align on `wp/16-review-align` (NOTES.md, "WP16"): the stub retry is now a fresh Grok call, not a resume (the shape the owner measured in his other project: 8 of 8); the three verdicts WP15 owed are in (Gravatar PASS, the WP15 editor fixes 1 real warning fixed, the pipeline reviews itself PASS); and every delete control of the editor is one small red outlined trash button (new `danger` / `danger-ink` tokens, 72 contrast pairs pass, axe on the editor list and form). The fixes of WP16 have no Grok verdict of their own yet. WP12 needs Ricardo's real Pexels key for one live check. WP18 (two icon sets, local icon search) on `wp/18-icon-sets`: icons come from `line-md` and `simple-icons` only, the editor's icon search and icon previews read the installed packs from disk (no `api.iconify.design`), and `ensure:profile` removes an icon of another set from an old profile. WP17 owner feedback round (NOTES.md, "WP17"): the status dot pings, the icon picker shows only the icon, a caption and the search box and resolves the icon from the link, email addresses never reach `dist/` (the mail shield: a token plus `ProtectedEmail.vue`), and an empty field never blocks a save (every text optional, an "Incomplete" badge instead). WP17 has no Grok verdict yet. WP19 integration on `wp/19-integration` (NOTES.md, "WP19 integration"): WP17 is merged onto WP16 + WP18 and the branch is green. The 5 conflicts were resolved by keeping both sides (the schema keeps `ICON_NAME_RE` and the mail tokens; `docs/invariants.md` was renumbered because both branches had claimed rule 20). Wired: the icon picker draws every preview from `/api/icons/svg?name=...&color=<ink>` with 22 of 22 requests HTTP 200 and none to `api.iconify.design`, proven on a real dev server; the relaxed schema still refuses an icon of another set; and an icon the migration removed never makes a block `incomplete`. ONE Playwright run: 400 passed, 2 skipped (static 300, dev 100). WP20 review round on `wp/20-reviewed` (NOTES.md, "WP20 review round"): the independent Grok review of `origin/main..wp/19-integration`, 4 blocks, 5 calls, 1 first-turn stub that the fresh retry rescued, every block `evidence=full`, no blind run. 7 findings, 7 real, 0 false positives, all fixed in 6 commits: the mail guard no longer crashes `npm run generate` (the page parses `PublicProfileShapeSchema`, the shape without the guard), the guard now reads EVERY part of the public copy including `site` (WP17's stated deviation, closed), a public mail tile keeps its envelope, an untitled mail or phone link is named by its address in the editor, the current icon of the picker has an accessible name, and `ensure:profile` no longer writes `you@example.com` back into a file that cleared its email. ONE Playwright run: 408 passed, 2 skipped (static 306, dev 102). **Reviewed: the public data contract (`types/profile.ts`), the mail shield and its components, the editor icon picker and field-draft files, and how they fit together (`--scope pr` over 16 files, run after the fixes). NOT reviewed: WP18's icon engine and routes and WP16's delete controls (unchanged in this range, so they have no verdict at all), every other file the range touches (`BlockForm.vue`, `BlockList.vue`, `PreviewTile.vue`, the other block components, `content/site-assets.ts`, `content/unfurl-cache.ts`, `app/utils/vcard.ts`, `app/utils/site-head.ts`, the scripts and every test file), and the last fix commit `215da75`.** Open: those blocks still owe a verdict before a merge (rule 21); an address typed into `contact.note` still reaches `/site/contact.vcf` and no check catches it; real content from Ricardo, Safari/Firefox manual check, history rewrite to drop old attribution trailers. Next: review the blocks named above, then section 13.4.
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

### 5.1 Color roles (same 15 slots in every preset)

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
| danger | `--color-danger` | editor only (WP16): the outlined trash button (icon + 1px border), the filled "Yes" of the delete confirm. Not used by the public page |
| danger-ink | `--color-danger-ink` | editor only (WP16): text on a filled `danger` background |

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
| danger | `#C81E1E` | `#B42318` | `#F87171` |
| danger-ink | `#FFFFFF` | `#FFFFFF` | `#131826` |

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
| danger | `#F87171` | `#F97066` | `#F87171` |
| danger-ink | `#081726` (the ground) | `#161A17` (the ground) | `#131826` (the ground) |

`accent-soft` is the small text on top of the accent tile (the domain label). `pop-ink` is text on the pop tile.
`danger` and `danger-ink` (WP16) are the only red in the system and only the editor uses them. `npm run check:contrast` holds `danger` on `tile` and on `ground` at 4.5:1 (the icon and its border sit on both) and `danger-ink` on `danger` at 4.5:1. The 12% hover fill is `color-mix` of the token (`bg-danger/12`), so there is no `danger-soft` role.

`condomera` matches `landing-condomera/DESIGN.md`: sky primary, slate neutral. Keep it in sync if the brand changes.
`night` light mode: `#F2F3F6` ground, `#FFFFFF` tile, `#DDE1EA` line, `#131826` ink, `#5B6478` muted, amber accent, `#131826` accent-ink, hover `#855400` (dark amber; the bright amber fails contrast on light), danger `#B42318`, danger-ink `#FFFFFF`.

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
- **TWO SETS ONLY (WP18, decided by Ricardo 2026-09-18).** `ICON_SETS` in `app/utils/icon-sets.ts` is `['line-md', 'simple-icons']` and it is the ONE source of truth. The order is the search order.
  - Default set: `line-md` (https://icones.js.org/collection/line-md). Animated line icons. `@iconify-json/line-md`.
  - Brand fallback: `simple-icons` (https://icones.js.org/collection/simple-icons). `@iconify-json/simple-icons`. Used when `line-md` lacks the brand (WhatsApp, Dribbble, Behance, Medium).
  - `package.json` may list NO other `@iconify-json/*` pack. A static test fails when it does, or when `ICON_SETS` and the installed packs disagree.
  - Every icon name is `<set>:<name>`, checked with ONE pattern, `ICON_NAME_RE` = `^(line-md|simple-icons):[a-z0-9]+(?:-[a-z0-9]+)*$`, built from the list. Helpers: `isAllowedIconName()`, `iconSetOf()`, `iconSetUrl()`. The refusal message is always "Use an icon from line-md or simple-icons" (`ICON_SETS_MESSAGE`).
  - An icon the pack marks `hidden: true` is refused too: simple-icons marks the brands it removed (LinkedIn, Twitter, Amazon, Slack) and a later pack update drops them. `line-md:linkedin` is the replacement. An alias is hidden when any icon of its parent chain is hidden.
  - Old profiles: `content/migrate.ts` REMOVES an icon of another set from its block (the tile falls back to its automatic icon) and prints one line, `profile: removed icon "<name>" from block <id> (only line-md and simple-icons are supported)`. It runs from `ensure:profile` in `predev`, is idempotent, keeps 2-space JSON with a final newline, and never touches `content/profile.example.json`.
- Brand icon from the URL (WP10a): `app/utils/brand-icons.ts` maps about 60 hosts to an icon (`line-md` first, else `simple-icons`, never an icon the pack marks `hidden`). A link tile without `icon` uses it. No network. The built site bundles only the brands its profile uses. Every value of the map is validated against `isAllowedIconName()`.
- Public page bundle: `nuxt.config.ts` collects every icon name in `profile.json` plus the social map into `icon.clientBundle.icons`. `iconsIn()` drops a name of another set instead of trying to bundle it. Zero icons fetched at runtime.
- **Editor icon search: LOCAL (WP18).** `content/icon-index.ts` builds one index from `node_modules/@iconify-json/<set>/icons.json`, found with `createRequire` from `ROOT` (`content/resolve.ts`), never from the bundled file location. The index holds every key of `icons` and of `aliases` minus the hidden ones; it is built once per dev process.
  - `GET /api/icons/search?q=<text>` -> `{ icons, sets, total }`, at most 48 `prefix:name`. Query: lower case, trimmed, cut to 64 characters, split on spaces and hyphens. Rank: exact name, then name starts with the query, then every token is a prefix of a name segment, then name contains the query. Ties: `line-md` before `simple-icons`, then the shorter name, then the alphabet. A query that is itself an allowed name and exists is the FIRST result. An empty query returns a small curated default list (`UI_ICONS` plus the networks), so the grid is never blank.
  - `GET /api/icons/svg?name=<prefix:name>[&color=<rrggbb>]` -> `image/svg+xml` built from the local pack (`body`, the pack's width/height, `currentColor`), `Cache-Control: max-age=3600`, the sandbox CSP and `nosniff` of the asset folders. 400 for another set, 404 for a missing or hidden icon.
  - Both routes are dev only (`import.meta.dev` dynamic import, then `assertEditorRequest`) with zod input validation. No `api.iconify.design`, so the editor searches icons offline and no search text leaves the machine.
  - `app/components/editor/IconPicker.vue` keeps its search box, its live previews and its "Browse all on icones.js.org" link. You can still paste a full name, but only from the two sets.
- `scripts/check-icons.ts`: ONE rule, `iconProblem()` of `content/icon-index.ts`, the same one the save route uses. It checks the profile icons, `UI_ICONS`, the networks map and the brand map: an allowed set, the icon exists, the icon is not hidden. It points at https://icones.js.org/collection/line-md and https://icones.js.org/collection/simple-icons. Fails `generate` with a clear message.

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
    { "id": "b7", "type": "link",    "size": "1x1", "title": "Say hello", "url": "mailto:x@y.z", "pop": true },
    { "id": "b8", "type": "section", "title": "Projects" },
    { "id": "b9", "type": "video",   "size": "2x1", "url": "https://youtube.com/watch?v=...", "title": "A talk" },
    { "id": "b10", "type": "link",   "size": "2x1", "title": "Nuxt", "url": "https://nuxt.com/", "spotlight": "pop",
      "enrich": true, "showImage": true, "favicon": "/icons/fb6ffcbd70de0858.png", "image": "/thumbs/3da768251b881db0.webp", "imageAlt": "...",
      "meta": { "title": "Nuxt: The Full-Stack Vue Framework", "description": "...", "siteName": "Nuxt", "themeColor": "#020420", "source": "html", "fetchedAt": "2026-09-18T08:12:31.492Z" } },
    { "id": "b11", "type": "text",   "size": "1x1", "body": "A draft", "hidden": true }
  ],
  "layout": {
    "desktop": ["b1","b2","b3","b4","b5","b6","b7","b8","b9","b10","b11"],
    "mobile":  ["b1","b4","b2","b3","b5","b6","b7","b8","b9","b10","b11"]
  },
  "site": {
    "title": "Ricardo Vargas, front-end developer",
    "description": "I build web products with Nuxt and Vue.",
    "url": "https://example.com",
    "lang": "en",
    "noindex": false,
    "xHandle": "ricardov03",
    "jobTitle": "Front-end developer",
    "location": "Bogota",
    "favicon": "/site-uploads/favicon-1a2b3c.png",
    "ogImage": "/site-uploads/og-4d5e6f.jpg"
  }
}
```

Rules:
- `profile.highlights` (WP9): optional, max 3 strings, 1 to 80 chars each, default `[]`. A real `<ul>` under the bio.
- **Every text is optional (WP17), except `profile.name`.** Absent-able: `profile.handle`, `profile.bio`, `profile.email`, link `title` and `url`, social `url`, image `src` and `alt`, text `body`, section `title`, map `label` and `url`, video `url`, and the `contact` / `qr` tile texts. An emptied field in the editor REMOVES the key (no `""` ever reaches the file: the schemas are strict and use `.min(1)`). `profile.name` stays `z.string().min(1)`, and the editor keeps the last valid name instead of blocking the save.
- **Incomplete blocks (WP17).** `incompleteReason(block)` names the ONE value a tile cannot exist without: a link, social, map or video block needs a `url` (or the `mail` token the build made from it), an image a `src`, a text block a `body`, a section a `title`. While it is missing the block is valid, it saves, the editor shows an "Incomplete: add a URL" badge on the row and on the preview tile (dimmed like hidden), `check:profile` prints a warning, and `blockDropReason()` answers `incomplete`, so the build leaves it out like a hidden block. An image with `src` and no `alt` renders `alt=""` and gets a soft, non-blocking hint in the editor.
- `profile.email` (WP17: optional, was required; `z.email()`). `profile.showEmail`: boolean, default `false`. No email = no Gravatar lookup and no email line, whatever `showEmail` says. The public page never imports this file. It imports `#profile` = `.nuxt/tilebox/public-profile.json`, the output of `toPublicProfile()` (`types/profile.ts`), written by `modules/public-profile.ts`: no `showEmail` key, `avatar` already resolved. Type: `PublicProfile`.
- **The mail shield (WP17), `app/utils/mail-shield.ts`.** No email address and no mail scheme is in ANY file of `dist/`. The public side carries a TOKEN `{ u, d, q? }`: the local part and the domain (and a query) each reversed, then base64url. `toPublicProfileInfo()` turns a shown `profile.email` into `profile.emailToken`; `toPublicBlock()` turns a `mailto:` url of a link, social, map or video block into `mail` and REMOVES `url` (so UTM tagging cannot touch it, and `check:links` has nothing to ask). `PublicProfileSchema` carries `emailToken` and `mail` and has a guard refinement that FAILS when the public profile or its blocks still hold an `@`-address or the mail scheme; `check:profile` prints that guard as a warning. The SAVED file never holds a token (`ProfileSchema` refuses it): the editor keeps editing the real address and the real `mailto:` urls. `app/components/ProtectedEmail.vue` ships a `<button>` with no href and the human form ("hello at example dot com"), and becomes `<a href="mailto:...">` after the first human signal (`useHumanSignal`: pointermove, pointerdown, touchstart, keydown, scroll, focusin, once and passive). The honest limit is in the README: it stops harvesters that read HTML or never touch the page, not a bot that drives a browser.
- Avatar precedence (WP9): `profile.avatar` when set, else `/avatar.gravatar.webp` when `scripts/fetch-avatar.ts` downloaded it (Gravatar, sha256 of the email, build time only, never at runtime; since WP15 through the guarded request, gravatar hosts only, and stored as a new WebP: `content/gravatar-fetch.ts`), else initials.
- `site` (WP10b): optional top-level object, zod strict, every key optional, schema in `types/site.ts`. `title` max 70 (default `Name (@handle)`), `description` max 160 (default the bio), `url` https without a trailing slash, `lang` BCP 47 (default `en`), `noindex` (default false), `xHandle` without `@`, `jobTitle`, `location`, `favicon` and `ogImage` (local paths of uploads in `public/site-uploads/`). An old profile without `site` stays valid; no migration. `toPublicProfile()` passes `site` through without the two upload paths and adds `assets` (the files of `public/site/` that exist at config time) and `builtAt`.
- Site URL precedence (WP10b): `NUXT_PUBLIC_SITE_URL` > `site.url` > unknown (no canonical, no og:url, relative og:image).
- `id` unique. `size` in `1x1 | 2x1 | 1x2 | 2x2`. `section` has no size.
- `layout.mobile` optional. Falls back to `layout.desktop`.
- Validate with `zod` in `types/profile.ts`. Export both the schema and the TS types from it.
- Social `network` is a key of the map in section 5.5 (`app/utils/networks.ts`).
- `theme.colors` and `theme.fonts` are keys of `app/utils/presets.ts`. zod enum. Unknown key = validation error.
- `icon` on any block is optional. Full Iconify name. A link tile without `icon` shows, in order: the brand icon of its URL, its local `favicon` file, `line-md:link` (WP10a).
- `hidden` (WP10a): optional boolean on EVERY block type. `toPublicProfile()` removes a hidden block and its id from both layouts, so it is in no file of `dist/`. The editor keeps it, dimmed.
- Link preview fields (WP10a), all optional, strict objects, old profiles stay valid: `enrich` (absent = false; the editor sets `true` on new links), `showImage` (absent = false, the second switch), `favicon` (`/icons/<hash>.png`, a local path only, PNG only since the WP10 security round), `image` (`/thumbs/<hash>.webp`, a local path only), `imageAlt`, `meta` `{ title?, description?, siteName?, themeColor?, source: 'oembed' | 'html' | 'brand', fetchedAt }`. `title` and `description` stay the display fields; fetched values fill them only when empty. The public profile never has `enrich` or `meta`, and has `image` only with `showImage`.
- `spotlight` (WP10a): optional `'pop' | 'wobble' | 'buzz'` on link blocks. At most ONE block of the profile (zod `superRefine`).
- Schedule (WP11): optional `startsAt` and `endsAt` on EVERY block type, ISO 8601 with an offset (`z.iso.datetime({ offset: true })`), `endsAt` after `startsAt` (`superRefine` on `BlockSchema`). `toPublicProfile(profile, gravatarPath?, siteExtras?, { now?, envSiteUrl? })` removes a block with a future `startsAt` or a past `endsAt` like a hidden block. The public block keeps `endsAt` only; `startsAt` never ships.
- UTM (WP11): optional `site.utm` `{ source, medium, campaign? }`, values `[a-z0-9_-]{1,40}`; optional `noUtm` on link, social, map and video blocks. `toPublicProfile()` adds the tags to external http(s) URLs. The public profile has no `site.utm` and no `noUtm`. `site.share` (optional boolean, absent = true) is the share button.
- Contact card (WP11): optional top-level `contact`, strict: `enabled`, `fullName` (default `profile.name`), `org`, `title`, `phone`, `email`, `url`, `note`. Public by intent. The public profile gets only `contact.fileName` (the `download` name), and only when `public/site/contact.vcf` exists. WP17 adds `shareEmail` (optional boolean, absent = off): the `EMAIL` line reaches the vCard only with `shareEmail: true`, because that file is public and the format needs a raw address. `public/robots.txt` carries `Disallow: /site/contact.vcf`, which only polite bots honour.
- New block types (WP11): `contact` (`title?`, `description?`, `icon?`, any size) and `qr` (`caption?`, size `1x1` or `2x2`). The build removes them when their file (`public/site/contact.vcf`, `public/site/qr.svg`) does not exist: `site.assets.contactCard` / `site.assets.qrCode`.
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
  scripts/fetch-links.ts      # link previews + YouTube thumbnails, runs before generate (was fetch-favicons.ts)
  content/unfurl.ts  content/unfurl-cache.ts   # the link preview engine (WP10a)
  content/pexels.ts           # the Pexels search + pick engine (WP12), dev only
  server/api/images/pexels/   # status.get.ts, search.get.ts, pick.post.ts (WP12), dev only
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
Done when: `git commit -m "bad message"` is rejected by the hook and `chore: x` passes. `node scripts/release.mjs --dry-run --no-ai --skip-tests` prints the next version and the release file preview and leaves the tree clean. `node scripts/release.mjs --dry-run --skip-tests --yes` shows a draft from `claude -p`. `.github/workflows/release.yml` is valid YAML and fails when the tag differs from `package.json`. `releases/v0.1.0.md` exists. The `gh` step: the same dry run prints the publish plan (`git push --follow-tags origin main`, `gh release view`, then `gh release edit` or `gh release create ... --verify-tag`, the URL, the watch offer) and runs none of it; with a fake `gh` first on `PATH`, `node scripts/release.mjs --publish-only <tag> --no-push` takes the create path, then the edit path, adds `--prerelease` for a `-` version, exits 0 with a hint when `gh` is missing or logged out, and refuses a tag that does not exist locally. `release.yml` zips to an absolute path, has `workflow_dispatch` with a `tag` input and updates an existing release. README has "Commit messages", "Release" and "Deploy" sections. `npm run lint`, `npm run typecheck`, `npm run generate` green.

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

### WP10a. Smart links and quick wins
Owns: `app/utils/brand-icons.ts`, `content/unfurl.ts`, `content/unfurl-cache.ts`, `server/api/unfurl.post.ts`, `scripts/fetch-links.ts` (replaces `scripts/fetch-favicons.ts`; the npm script `fetch:favicons` stays as an alias), `app/components/editor/LinkEnrich.vue`, `app/components/editor/LinkIconField.vue`, `tests/e2e/links.spec.ts`, `tests/e2e/unfurl.spec.ts`. Edits in shared files, kept small: the link fields, `hidden`, `spotlight`, `toPublicBlock()` and the hidden filter of `toPublicProfile()` in `types/profile.ts`; `resolveLinkIcon()` / `linkImageLayout()` in `app/components/blocks/media.ts`; `LinkBlock.vue`; the brand check in `scripts/check-icons.ts`; `iconsIn()` and the `$development` icon list in `nuxt.config.ts` (the `#manifest/icons` alias is gone, `#manifest/thumbs` stays); `withLocalLinkFiles()` in `modules/public-profile.ts`; `toggleHidden`, `duplicateBlock` and the one-spotlight rule in `useEditor.ts`; rows and controls in `BlockList.vue`, `PreviewTile.vue`, `BlockForm.vue`; event wiring in `edit.vue`; two blocks in `content/profile.example.json`. It adds NO site-level metadata: that is WP10b (`site` object, "Site" tab).
Design (decided by Ricardo):
- A. Brand icon from the URL. A hand-made map host -> Iconify name for about 60 sites, `line-md` first, else `simple-icons`, never an icon the pack marks `hidden`. Lower-case host, no `www.`, the full host then each parent domain. `mailto:` -> `line-md:email`, `tel:` -> `line-md:phone`. Tile icon, in order: `block.icon` > brand icon > local favicon file > `line-md:link`. The built site bundles only the brand icons its profile uses; `nuxt dev` bundles the whole map so the editor previews any URL at once.
- B. Link preview ("unfurl"). Per link: `enrich` (icon and text) and `showImage` (the website's image, a SECOND switch, default off). The engine follows a fixed algorithm: normalize (http/https, no credentials, no fragment, 2048 chars, = cache key, fresh 30 days, conditional refresh, `force`); keyless oEmbed shortcuts and the GitHub avatar shortcut; an SSRF-safe fetch for EVERY request (resolve, public unicast only, pinned IP, manual redirects max 5 with a check per hop, ports 80/443, 8 s, honest user agent `tilebox-unfurl/<version> (+https://github.com/ricardov03/tilebox)`, 512 KB or `</head>`, html content-type, charset from header then meta then utf-8); SAX head parse (htmlparser2) with og > twitter > plain priorities, relative URLs against the final URL, title 120 and description 200 chars; favicon order svg < 100 KB > apple-touch-icon > PNG icon > manifest (192 first, no maskable-only) > `/favicon.ico` (largest PNG entry, BMP skipped) > Google s2 last, target the smallest icon of 96 px or more; EVERY icon is drawn again with sharp as a PNG inside 128x128 and only that PNG is stored, `public/icons/<sha1[:16] of the output>.png` (a remote SVG or any remote bytes as they came are never stored); image only with `showImage`, 5 MB, magic bytes (png, jpeg, webp, gif, avif, no SVG), 200x200 minimum, 1200 px wide WebP (no EXIF) in `public/thumbs/<sha1[:16]>.webp`; never throws for a network reason, answers `{ ok: false, reason }`. Fetched text pre-fills `title` / `description` only when empty; "Use fetched title/description" buttons when they differ; the owner can always overwrite. `enrich` off: only the typed text plus the brand icon; `meta`, `favicon`, `image` are cleared.
- B, security round (2026-09-18, NOTES.md `## WP10 security round`, `docs/security.md`): every stored icon is a PNG drawn by sharp (no remote SVG, no remote bytes as they came); `public/_headers` sandboxes `/icons`, `/thumbs`, `/blocks`, `/site`, `/site-uploads`; one budget per unfurl (20 s, 8 requests, 8 redirects, DNS 3 s) and a 10-minute memory of failures; the cache is parsed with a strict schema and holds 500 entries; `fetch:links` prunes unused files; `::/96` is refused; every dev route goes through `assertEditorRequest()` (Host, Origin, `Sec-Fetch-Site`, content type); `force` sends no conditional headers; SVG uploads of the Site tab are stored as PNG.
- The dev route `POST /api/unfurl`: dev only, `Host` must be localhost / 127.0.0.1 / [::1], an `Origin` must be the same origin, one request per target host at a time.
- Build: `npm run fetch:links` (in `pregenerate`) runs the engine for links with `enrich: true` whose files are missing, keeps the YouTube thumbnails of video blocks, never fails the build, prints one summary line. The build never writes the profile: `withLocalLinkFiles()` takes the paths from the cache and drops a path whose file is not on disk.
- Featured look: with `showImage` + `image` the picture fills the top (2x2, 1x2) or the right third (2x1), `object-cover`, lazy (eager + high priority among the first 3 phone tiles). Text and image never overlap. 1x1 never shows it.
- C. Quick wins. `hidden` on every block type: `toPublicProfile()` removes the block and its ids from both layouts; the editor dims it, shows an eye-off badge, and has Hide / Show in the list row, in the tile controls and in the form. Duplicate (list row and form): fresh id, " copy", right after the original in both layouts, selected, never the spotlight. `spotlight: pop | wobble | buzz` on link blocks: at most one (zod `superRefine`; the editor moves it), transform-only keyframes, 1 cycle per 6 s, off with reduced motion, a select with a live sample in the link form.
Done when: a github.com link without `icon` renders the inline `line-md:github` SVG on the static page and no request leaves the origin. `npm run check:icons` fails on a missing or hidden icon of the brand map. The title of a hidden block is in no file of `dist/` (`tests/e2e/privacy.spec.ts`). The spotlight tile has `animation-name: none` under reduced motion and axe stays at 0 violations. `tests/e2e/unfurl.spec.ts` (local `node:http` server, `allowHosts` for tests only) covers head priorities, relative URLs, the redirect limit, the 512 KB cut, non-html, ICO PNG extraction, magic bytes, private addresses refused without `allowHosts` (10.0.0.1, 127.0.0.1, 169.254.169.254, ::1, IPv4-mapped), cache freshness + 304, oEmbed with a mocked connection. The `dev` project covers the preview card with a mocked route, "Use fetched title", the saved switches, the failure reason, hide, duplicate, one spotlight. `.output/server` has no copy of the engine. `grep -r "hello@example.com" dist | wc -l` = 0. `npm run lint`, `npm run typecheck`, `npm run generate`, Playwright `static` and `dev`, `node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks` green. README "Link previews", `content/README.md`, NOTES.md `## WP10a`.

### WP10b. Site metadata
Owns: `types/site.ts`, the `site` key + the third `toPublicProfile()` argument in `types/profile.ts`, `content/site-assets.ts`, `content/site-files.ts`, `scripts/build-site-assets.ts`, `assets/fonts/*`, `app/utils/site-head.ts`, `app/composables/useSiteHead.ts`, the head of `app/pages/index.vue`, the `rel` prop of `app/components/blocks/Tile.vue` + its use in `SocialBlock.vue`, `app/components/editor/SitePanel.vue`, the Site tab in `app/pages/edit.vue`, the `site` member of `EditorTab` in `useEditor.ts`, `server/api/site/*`, the site extras in `modules/public-profile.ts`, `tests/e2e/site.spec.ts`, `tests/e2e/site-editor.spec.ts`, the site test in `tests/e2e/repo.spec.ts`, `package.json` (`build:site-assets`, its place in `predev` and `pregenerate`, dev dependencies `sharp` and `satori`), the `public/site/` and `public/site-uploads/` lines in `.gitignore` and in the release preflight.
Design (decided by Ricardo): a Site tab in the editor for the basic metadata (OG, favicon, metadata). The social image is generated from the profile at build time; an optional upload wins. (A) Optional `site` object, see section 6. (B) Site URL precedence: env > `site.url` > unknown. (C) Favicon set in `public/site/` (ignored), source: upload > avatar (circle) > initials tile in the active color preset; the ICO container is written by hand. (D) `og.png` 1200x630: upload (cover) > a satori card, always Geist (`assets/fonts`, SIL OFL 1.1) and the light colors. (E) One pure `buildHead()` + `useSiteHead()`: lang, title, description, canonical, Open Graph `profile`, X card, robots, favicon links, manifest, JSON-LD `ProfilePage` + `Person`; `rel="me"` on social tiles. (F) Dev-only routes `POST /api/site/assets` (the same builder, with the draft) and `POST /api/site/upload`. (G) Offline, never fails a build, tracked `/favicon.ico` and `/og.png` stay as fallbacks.
Done when: `npm run generate` on the example prints `site: favicon from initials, social image generated (8 files in public/site/)` and `dist/site/` holds the 8 files. `dist/index.html` has the title `Name (@handle)`, `og:type` `profile`, `og:image` `/site/og.png` with width, height and alt, the X card, one JSON-LD script that parses with `Person.name` and `sameAs`, 4 favicon links, the manifest, and no canonical without a site URL. `buildHead()` unit checks: canonical + absolute image with a site URL, env over `site.url`, noindex, xHandle, name split, `<` escaped. Asset builder unit checks in a temp folder: 8 files, valid ICO header with a 32x32 PNG, 1200x630 under 1 MB, uploads win, broken uploads fall back, nothing throws. `public/site/` and `public/site-uploads/` are ignored and never tracked (`repo.spec.ts`). The Site tab saves to the file, a bad URL shows an inline error and is not saved, "Regenerate" refreshes the previews. axe stays at 0 violations, the page makes no foreign request, `grep -r "hello@example.com" dist | wc -l` is 0. README "Site metadata", `content/README.md`, NOTES.md `## WP10b`. `npm run lint`, `npm run typecheck`, `npm run generate`, Playwright `static` and `dev` green.

### WP11. Linktree second wave
Owns: `app/utils/schedule.ts`, `app/utils/utm.ts`, `app/utils/vcard.ts`, `content/site-extras.ts`, `content/link-check.ts`, `scripts/check-links.ts`, `server/api/links/check.post.ts`, `server/api/site/qr.png.get.ts`, `app/components/ShareButton.vue`, `app/components/blocks/ContactBlock.vue`, `app/components/blocks/QrBlock.vue`, `app/components/editor/{BlockAdvanced,BlockExtraFields,BlockRowBadges,LinkCheckButton,SiteExtras,SharePanel,ContactPanel,QrPanel,UtmPanel}.vue`, `app/composables/useSiteDraft.ts`, `app/composables/useLinkCheck.ts`, `tests/e2e/second-wave.spec.ts`, `tests/e2e/second-wave-editor.spec.ts`, the `check:links` script and the `uqr` dev dependency in `package.json`. Edits in shared files, kept small: the schedule, `noUtm`, the `contact` and `qr` block schemas, `ContactSchema`, `blockDropReason()`, `toPublicBlock()` and the fourth argument of `toPublicProfile()` in `types/profile.ts`; `share`, `utm` and the two asset keys in `types/site.ts`; `SITE_EXTRA_FILES` in `content/site-files.ts`; the `method` option of `safeRequest()` in `content/unfurl.ts`; `withoutUtm()` in `sameAsOf()` (`app/utils/site-head.ts`); the `download` prop of `Tile.vue`; `data-ends-at` in `BentoGrid.vue`; the inline script in `app/pages/index.vue`; the `share` prop of `ProfileHeader.vue`; the two new types and the provided draft in `useEditor.ts`; ONE include each in `BlockForm.vue` (two lines), `SitePanel.vue`, `BlockList.vue` (two), `PreviewTile.vue`; the extras step in `scripts/build-site-assets.ts`, `server/api/site/assets.post.ts` and `server/api/save.post.ts`; the warnings in `scripts/validate-profile.ts`; the link check step and `--skip-link-check` in `scripts/publish.mjs`; three blocks and `contact` in `content/profile.example.json`.
Design (decided by Ricardo): six features, all static. (1) Schedule: `startsAt` / `endsAt` on every block; the build removes a block outside its window like a hidden one; a future `endsAt` ships as `data-ends-at` and an inline script under 400 bytes hides the tile when the time has passed (at load and every 60 s); a scheduled START needs a new publish after that time. (2) Save contact: a top-level `contact` object that is public by intent, written as vCard 3.0 to `public/site/contact.vcf` when `enabled`; a `contact` tile downloads it; `profile.email` is never an input. (3) QR code: `public/site/qr.svg`, drawn with `uqr` from the https site URL (env > `site.url`), light preset colors on a solid ground; a `qr` tile; the editor has SVG and 1024 px PNG downloads. (4) Share button on the profile tile: `navigator.share`, else the clipboard and "Link copied" for 2 s in an `aria-live` region; `site.share: false` removes it. (5) UTM tags at build: `site.utm`, added by `toPublicProfile()` to external http(s) URLs of link, social, map and video blocks, never over an existing `utm_*`, never on `mailto:`, `tel:`, the vCard or same-site links; `noUtm` per block. (6) Link check: `npm run check:links`, HEAD then a 1 KB GET on 403 / 405 / 501, through the guarded request of the engine, 60 URLs, 4 at a time, one per host; ok / blocked / broken; always exit 0; a warning step in `npm run publish` (`--skip-link-check`); "Check links" in the editor through a dev-only route, results in memory only.
Done when: `npm run generate` on the example leaves `dist/site/contact.vcf` and no `dist/site/qr.svg` (the example has no site URL); with `NUXT_PUBLIC_SITE_URL` it has `qr.svg`. The title of the example block that starts in 2099 (`b13`) is in no file of `dist/`. `tests/e2e/second-wave.spec.ts`: schedule matrix with a fixed `now`, UTM matrix, vCard escaping + CRLF + no `PHOTO` + no profile email, the QR file only with a site URL, the link checker with a mocked transport, the end-date script with a fake clock, the share button (copy, announce, 44 px, clear of the theme toggle at 1280 and 390), the contact tile `download`. `tests/e2e/second-wave-editor.spec.ts`: schedule inputs round-trip to ISO in the saved file, contact panel, live UTM example, share checkbox, "Check links" with a mocked route, the guards of the two new dev routes. axe stays at 0 violations, the page makes no foreign request, `grep -r "hello@example.com" dist | wc -l` is 0. `npm run check:links` exits 0. README sections "Scheduling", "Save contact", "QR code", "Share button", "UTM tags", "Link check"; `docs/security.md`; NOTES.md `## WP11`. `npm run lint`, `npm run typecheck`, `npm run generate`, Playwright `static` and `dev`, `node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks` green.

### WP12. Pexels photo picker
Owns: `content/pexels.ts`, `server/api/images/pexels/{status.get,search.get,pick.post}.ts`, `server/utils/pexels.ts`, `app/components/editor/PexelsPicker.vue`, `tests/e2e/pexels.spec.ts`, `tests/e2e/pexels-editor.spec.ts`, the `PEXELS_API_KEY` lines of `.env.example`. Edits in shared files, kept small: the tabs and the `stock` event of `app/components/editor/ImagePicker.vue`; two attributes on the image field in `BlockForm.vue`; `imageCredit()` in `app/components/blocks/media.ts` and the credit line of `ImageBlock.vue`; `onlyHosts` and `headers` of `safeRequest()` in `content/unfurl.ts`; two spec names in `playwright.config.ts`; one backup file in `.gitignore`. `types/profile.ts` is NOT changed: `source.provider` had `pexels` since WP0.
Design (decided by Ricardo, 2026-09-17: Pexels over Unsplash):
- A. The key: `PEXELS_API_KEY` in `.env` (ignored). Read with `process.env` on the dev server only. Never in `runtimeConfig.public`, never in an answer, never needed for a build, on CI, to release or to publish. `GET /api/images/pexels/status` answers `{ configured }` only.
- B. Search: `GET /api/images/pexels/search?q=&page=&orientation=`, zod input (q 1..80, page 1..50, orientation `landscape | portrait | square`), 24 per page, 8 s, a SMALL mapped answer `{ photos: [{ id, width, height, alt, avgColor, photographer, photographerUrl, pageUrl, thumb, preview }], page, hasMore, rateLimit: { remaining, reset } }`, identical searches from memory for 10 minutes. 401 -> "The Pexels key is wrong". 429 -> "Pexels rate limit reached, try again at <time>": a 429 has no rate-limit headers, so the engine remembers the reset time of the last good answer (else "in about one hour").
- C. Pick: `POST /api/images/pexels/pick`, JSON `{ id, size? }` (`large2x` default, or `large`). The ID goes to `GET /v1/photos/:id`; the file URL comes from that answer and must be https on `images.pexels.com`; the download goes through `safeRequest()` with the host allow-list (15 MB, 20 s for both requests); magic bytes (jpeg, png, webp); sharp writes a new WebP, quality 82, 1600 px on the long side, no metadata, `limitInputPixels`; `public/blocks/pexels-<id>.webp` (ignored). An existing file is used again. Answer: `{ src, width, height, alt, source: { provider: 'pexels', id, url, author, authorUrl } }`. Never an open proxy (`docs/security.md`).
- D. Editor: `ImagePicker.vue` has two tabs on image blocks, "Upload" (unchanged) and "Pexels" (`PexelsPicker.vue`): search on Enter or after 0.8 s idle, 2 characters at least, the shape preset from the tile size, a grid with `avgColor` placeholders and the photographer under each photo, ONE tab stop with arrow keys / Home / End, Enter picks, "Load more", states for no key (3 steps, the link opens in a new tab, "the key stays on this machine"), empty, rate limit, wrong key, offline, and the line "Photos provided by Pexels". A pick sets `src`, `source` and `alt` (only when the owner has no alt text of their own) in ONE patch. An upload sets `source: null`. The thumbnails load from `images.pexels.com` in the dev editor only. Thumbnail fields (video) get no stock tab: they have no credit field.
- E. Public page: "Photo by {author} on Pexels", two links (`authorUrl`, `source.url`), `rel="noopener noreferrer"`, only for http(s) URLs, mono 12 px on the scrim. ALWAYS shown for `provider: pexels` (Pexels asks for it): no `hideCredit` switch. The URLs stay as they are (no UTM tags, section 13.5).
- F. Housekeeping: `fetch:links` prunes `public/icons` and `public/thumbs` only. `public/blocks` is never touched (test).
Done when: `tests/e2e/pexels.spec.ts` (mocked transport, no key, no internet) covers the mapping, 401, 429 with the reset time, empty, the memory, input checks, a redirect of the API to another host (refused, no key sent), a file URL on another host (nothing downloaded), a redirect of the image host, a fake jpeg, 15 MB, the WebP output without metadata, the `source` object, the idempotent second pick, the credit rules, and the key canary: neither `PEXELS_API_KEY` nor a key value nor `api.pexels.com` is in any file of `dist/`, `.nuxt/dist/client` or `.output/server` (build with `PEXELS_API_KEY=tilebox-canary-pexels-key-0f3a9c npm run generate` to make the value check real). The `dev` project (`pexels-editor.spec.ts`, mocked routes) covers the tabs, the no-key state, search -> grid -> load more -> pick -> preview tile with both credit links -> save -> the file has `src` + `source`, the owner's alt text stays, an upload clears the source, the keyboard pick, rate limit / wrong key / empty / offline, and the guards of the real routes (403, 400, 415). The public page still makes no foreign request, `repo.spec.ts` stays green, `grep -r "hello@example.com" dist | wc -l` = 0. `npm run lint`, `npm run typecheck`, `npm run generate`, Playwright `static` and `dev`, `node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks` green. README "Stock photos (Pexels)", `docs/security.md`, NOTES.md `## WP12`. Open: one live search and pick with Ricardo's real key.

### WP17. Owner feedback round
Branch: `wp/17-owner-feedback` (from `main`). Three owner requests plus the pinging status dot. Ran next to two other agents from the same base (delete controls and the form footer; local icon search), so the files below are the only ones it owns.
Owns: `app/utils/mail-shield.ts`, `app/components/ProtectedEmail.vue`, `app/composables/useHumanSignal.ts`, `tests/e2e/mail-shield.spec.ts`, `tests/e2e/incomplete.spec.ts`. Edits in shared files: the optional fields, `incompleteReason()`, `incompleteMessage()`, the `mail` token, `emailToken`, the public guard and `ContactSchema.shareEmail` in `types/profile.ts`; the `mail` prop of `Tile.vue` and the four tiles that pass it; `ProfileHeader.vue` (the email line); `IconPicker.vue`, `LinkIconField.vue`, `BlockForm.vue`, `BlockExtraFields.vue`, `BlockRowBadges.vue`, `PreviewTile.vue`, `TextField.vue`, `ImagePicker.vue`, `GravatarButton.vue`, `ContactPanel.vue`; `app/utils/field-draft.ts`, `app/composables/useFieldDraft.ts`, `app/pages/edit.vue`, `app/composables/useEditor.ts`; `app/utils/{brand-icons,site-head,vcard}.ts`; `scripts/{validate-profile,fetch-avatar,fetch-links}.ts`; `content/{profile.example.json,unfurl-cache.ts,site-assets.ts}`; `public/robots.txt`; `playwright.config.ts`.
Design (the owner's words, then the decision):
- (1) "The status dot should ping." A halo grows and fades behind a solid dot; the wrapper holds the size so nothing moves; no halo with reduced motion.
- (2) "By default the block should select the icon based on the link value... To avoid confusions, let's hide the field that presents the icon name and just present the icon and the search input." The automatic order was already `block.icon` > brand icon of the URL (`mailto:` = the envelope, `tel:` = the phone) > local favicon > `line-md:link`. So the NAME field is gone: the picker is the icon at 32 px, a caption ("Auto, from the link" / "Custom" / "From the network"), the search box, the results, and "Back to auto" only while an own icon is set. The name stays the accessible name of every result, and a typed `prefix:name` comes back as the first result. A social tile shows its network icon read only.
- (3) "Let's add something that avoids spam on the use of emails." The mail shield of section 6. One exception, opt-in: the vCard.
- (4) "The validator should allow the inputs to be empty." Every text optional, an emptied field removes the key, only a FORMAT keeps a message, the save is never blocked, and a tile that lost its essential value is "Incomplete" (section 6).
Done when: a new link block with `mailto:you@example.com` shows the envelope at once in the form and on the tile, and the icon follows the URL live. `grep -rEi "mailto:" dist | wc -l` = 0 and every address of `content/profile.example.json` is in no file of `dist/`, while the mail tile still renders and becomes a real mail link after one mouse move. Clearing a link URL shows no error, shows the Incomplete badge, saves, leaves no `url` key and drops the tile from the page; an invalid URL shows a message and Save still writes the rest; an emptied name keeps the last one with a soft note. axe stays at 0 violations, the page makes no foreign request. README "Email protection" with the honest limit, `docs/security.md`, two new rules in `docs/invariants.md`, NOTES.md `## WP17`.

### WP18. Two icon sets, local search
Owns: `app/utils/icon-sets.ts`, `content/icon-index.ts`, `server/api/icons/{search.get,svg.get}.ts`, `tests/e2e/icons.spec.ts`, `tests/e2e/icons-dev.spec.ts`. Edits in shared files, kept small: the `iconName` rule in `types/profile.ts`; `migrateIconsText()` + `foreignIcons()` in `content/migrate.ts` and its call in `scripts/ensure-profile.ts`; the advice line in `scripts/validate-profile.ts`; `scripts/check-icons.ts` (rewritten to the shared rule); `checkIcons()` in `server/utils/editor.ts`; `iconsIn()` and one route rule in `nuxt.config.ts`; two spec names in `playwright.config.ts`; one comment in `tests/e2e/security-dev.spec.ts`. `app/components/editor/IconPicker.vue` is NOT changed here (another WP owns it); the note for its owner is in NOTES.md.
Why (Ricardo, 2026-09-18): "We need to limit all the icons possibilities. Let's support simple-icons and line-md by default. Let's make the search only look into these libraries in the search box."
Design: section 5.5, the WP18 bullets. Short form:
- A. ONE list, `ICON_SETS = ['line-md', 'simple-icons']`, with `ICON_NAME_RE`, `isAllowedIconName()`, `iconSetOf()`, `iconSetUrl()` and `ICON_SETS_MESSAGE` built from it. Client-safe: no node import. The schema, the save check, the scripts, `nuxt.config.ts` and the migration all read it.
- B. The schema message is "Use an icon from line-md or simple-icons". An old profile stays loadable: `ensure:profile` removes an icon of another set from its block and says so, once per block.
- C. The search is local: `content/icon-index.ts` over the two installed packs, hidden icons and hidden aliases excluded, ranked, 48 names at most, a default list for an empty query. No network, so the editor works offline.
- D. `GET /api/icons/svg` serves one icon from the same local data for the picker's previews, with the sandbox headers of the asset folders.
- E. `package.json` may list only those two `@iconify-json/*` packs.
Done when: `tests/e2e/icons.spec.ts` (no browser, no internet) covers the list and the pattern, the schema message, the two-pack rule, the index (build under 1.5 s, a query under 50 ms), hidden icons and hidden aliases left out (`simple-icons:linkedin` and `simple-icons:slack` absent, `line-md:linkedin` present), the ranking for `git`, `github`, `mail` and `you tube`, exact-name-first, the empty-query defaults, the 48-name page, the 64-character cut, a foreign prefix dropped, the SVG builder (valid SVG, `currentColor`, nothing that runs), that the routes and the index import no network code, and the migration (removes `lucide:mail` from a temp profile, keeps the layout, idempotent). `tests/e2e/icons-dev.spec.ts` (the `dev` project, Playwright `request`) covers `/api/icons/search?q=github` -> `line-md:github` first and only the two sets, `?q=lucide:mail` -> no `lucide:` name, `/api/icons/svg?name=line-md:github` -> 200 `image/svg+xml`, `?name=lucide:mail` -> not 200, and a save with `icon: "lucide:mail"` refused with the two-sets message. `npm run lint`, `npm run typecheck`, `npm run test:review`, `npm run check:icons`, `npm run generate`, both Playwright projects, `grep -r "hello@example.com" dist | wc -l` = 0 and `node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks` green. README (Features, Editing by hand, Scripts, Tests, Troubleshooting), `docs/invariants.md` rule 16, `docs/security.md` "The icon routes (WP18)", PLAN.md section 5.5, NOTES.md `## WP18`. Done in WP19: the IconPicker draws every preview from `/api/icons/svg?name=...&color=<ink>`, so the editor makes no `api.iconify.design` request at all (NOTES.md `## WP19 integration`, step 2a).

## 9. Code review with Grok

- Reviewer: Grok, through `scripts/review/grok-review.sh` (`npm run review`). It pastes the diff and an impact map into the prompt, gives Grok read-only tools, forces a JSON verdict, and exits 3 when there is no valid verdict. How to use it, and when to use OCR or an adversarial agent instead: `docs/review-tools.md`. The hard rules it checks: `docs/invariants.md`.
- Rule: the model that writes the code is never the model that reviews it.
- When: per block before a merge (`npm run review -- --range main..<branch> --files <block> --ledger`), and the whole branch before the push (`--scope pr`).
- Input: the WP branch diff plus this `PLAN.md` and the WP's `NOTES.md` section.
- Review prompt must ask for: correctness, TypeScript strictness, a11y, SSG safety (nothing runtime-only on the public page), files touched outside the WP's ownership, and unmet "Done when" items.
- Output: findings with severity `critical | warning | suggestion` and a category. `critical` and `warning` block and must be fixed. A `suggestion` is fixed or answered in `NOTES.md`. Every finding goes to `scripts/review/findings-ledger.jsonl`; the top category of `npm run review:ledger -- report` becomes the next scripted check.
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
**DONE for Pexels: WP12 (section 8), 2026-09-18.** What changed against the sketch below: the routes are `server/api/images/pexels/{status,search,pick}`, the file is `public/blocks/pexels-<id>.webp` (WebP, 1600 px on the long side), the pick route takes an ID and never a URL. Unsplash is not built (its demo limit is 50 requests per hour and it needs a download-tracking call). The text below is the original sketch.

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
- ~~Open Graph image built at generate time from the profile.~~ Done in WP10b.
- Blog or notes tile that reads a markdown folder.

### 13.4 Handle = site name, two-way between the editor and `npm run publish` (planned, NOT built)

Decided by Ricardo on 2026-09-18: plan only. Build when he asks.

**Goal.** The `handle` gets a real job: it is the site name, so `ricardov03` becomes `ricardov03.pages.dev` or `ricardov03.netlify.app`. The user picks the provider and checks the name in the editor, before any publish. `npm run publish` uses that choice when it exists. When the choice is made in `npm run publish` first, the editor shows it afterwards. Two directions, one truth.

**Where the truth lives.**
- `profile.handle` stays in `content/profile.json` (personal, ignored). It is display text (`@handle`) and the wanted site name.
- `.tilebox/publish.json` (ignored) stays the publish state. It gets a new optional `status`: `planned` (chosen in the editor, nothing created yet) or `live` (project exists). Today's files have no `status`: treat them as `live`.
- No provider data goes into `profile.json`. The public page never sees it.

**Editor side (new "Publish" panel in the Profile tab).**
1. Provider choice: Cloudflare Pages, Netlify, or "I host it myself" (no checks).
2. Live preview of the address: `https://<handle>.pages.dev`.
3. Rule check while typing, same rules as the script: lowercase letters, digits, dashes, no dash at the ends, max 37. It is a warning, not a schema error (see Risks).
4. "Check availability" button. Calls a dev-only route `GET /api/publish/check?provider=&name=`. States: free, taken, yours (matches `publish.json`), unknown (offline or timeout). Never blocks a save.
5. On save: writes `{ provider, name, status: "planned" }` to `.tilebox/publish.json` only when no `live` state exists.
6. When a `live` state exists: shows "Published at <url>", the date, and a copy button. The handle field shows a note: the address does not change when you edit the handle (see Risks).

**Script side (`scripts/publish.mjs`).**
1. No state file: works exactly as today.
2. `status: planned`: uses provider and name as the defaults, skips those two prompts, still does login, account pick, availability check and create. A taken name asks again, as today.
3. After a successful create: state becomes `live`. If the final name differs from `profile.handle` (Netlify suffix, or the user typed another name), the script asks "Update your handle to <name>? [Y/n]" and writes `profile.handle` into `content/profile.json` atomically, keeping 2-space JSON and the trailing newline. With `--yes`: it updates. Only the personal file is ever written, never the example.
4. `--reset` removes the state, not the handle.

**Shared code (so both sides can never disagree).** Move the name rules and the two availability checks out of `scripts/publish.mjs` into `scripts/lib/site-name.mjs` (node built-ins only). The script imports it. The dev route imports it through a path from `ROOT` in `content/resolve.ts`. Lesson from the WP7 regression: no path logic from the bundled file location.

**Risks and how the design avoids them.**
| Risk | Answer |
|---|---|
| Tightening `handle` in the zod schema breaks existing profiles (today it is any non-empty text) | The schema stays as it is. The site-name rules are an editor warning and a publish-time check only |
| The script writes `profile.json` while the editor has unsaved changes | Atomic write. The editor compares the file time on focus and offers "Reload from disk". The script refuses to write when the dev server reports a dirty draft (`GET /api/editor/state`), and prints the manual step instead |
| The user renames the handle after a publish | Providers cannot rename a project. The editor says so and offers two paths: keep the address, or `npm run publish -- --reset` for a new project. Nothing is renamed silently |
| Name free at check time, taken at create time | Already handled by the script (asks again). The editor check is advice only |
| Offline, or the provider check is slow | State "unknown". Never blocks saving or editing |
| Display handle and site name must differ (for example `Ricardo.V` vs `ricardov`) | The state file may hold a `name` that differs from the handle. The editor then shows both and stops suggesting a sync |
| A hidden email or other private data leaks through the new route | The route returns only `{ provider, name, url, status }`. Dev only, guarded with `import.meta.dev` |
| The static build changes | It does not. Nothing in `dist/` depends on the publish state |

**Tests to write with it.** Shim tests as in WP8 for: planned state is used, live state wins, handle write-back (yes, no, `--yes`, example file never written, dirty draft refused). Playwright `dev` project: rule warning, the four check states with a mocked route, the published badge. Static project must stay untouched.

**Done when.** A new user can type a handle in the editor, see that the address is free, run `npm run publish` with zero prompts except the login, and see the live URL back in the editor. An old user with an existing `publish.json` sees no change in behavior.

**Size.** One work package. Owner files: `scripts/publish.mjs`, `scripts/lib/site-name.mjs`, `server/api/publish/*`, `server/api/editor/state.get.ts`, `app/components/editor/PublishPanel.vue`, a few lines in `edit.vue` and `useEditor.ts`.

### 13.5 Linktree-inspired second wave (DONE: WP11, section 8)

Built as WP11. The list below is the first plan, kept for the record. What changed on the way: the keys are `startsAt` / `endsAt`, and a future `endsAt` DOES get a small client-side check (the text of that block is public until its end anyway; a future START still never ships); the vCard comes from its own public `contact` object, not from `profile.email`; the files are `public/site/contact.vcf` and `public/site/qr.svg`. Every item stays static: the work happens on the owner's machine in the editor or at build time, and the public page makes no runtime network call.

- **Schedule.** Optional `showFrom` / `showUntil` dates on a block. `toPublicProfile()` drops a block outside its window at build time (like `hidden`), and the editor shows a clock badge. A static site changes only on a build, so `npm run publish` on the day (or a scheduled CI build) applies it; no client-side date check that would ship hidden text.
- **vCard.** A build script writes `public/contact.vcf` from the public profile (name, site URL, the email only when `showEmail` is true). A tile or a profile button links to the local file with `download`.
- **QR code.** A build script draws the QR code of `NUXT_PUBLIC_SITE_URL` as a local SVG (`public/qr.svg`) with a small dev dependency, no runtime library. The page shows it in a tile or a `<dialog>`; the editor has "Download QR".
- **Share / copy button.** One small button on the profile tile: `navigator.share()` when the browser has it, else `navigator.clipboard.writeText()`. Browser APIs only, no third-party script, no network call.
- **UTM at build.** An optional UTM setting in the profile (`source`, `medium`, `campaign`; it fits the site-level settings of WP10b). `toPublicProfile()` appends the parameters to http(s) tile URLs at build time. The stored URLs stay clean. Never added to `mailto:` and `tel:`.
- **Dead-link check.** `npm run check:links`: a HEAD (then GET) request per tile URL through the SSRF-safe fetch of `content/unfurl.ts`, same honest user agent, one request per host at a time. It prints a table and exits 0: a warning, never a build failure. The editor can show the last result per block.

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
