# NOTES

Per-WP notes. Rules in `PLAN.md` section 0. Requests for another WP's files go under your WP heading.

## WP0

Branch: `wp/0-scaffold`. Date: 2026-09-17. Node used: 22.23.1 (`.nvmrc` says 24 for Cloudflare).

### What was built
- Nuxt 4 scaffold (minimal template) with `app/` dir. Package `tilebox` 0.1.0, MIT, `engines.node >=22.19`.
- Tailwind 4 via `@tailwindcss/vite`. `app/assets/css/main.css` has the `@theme inline` map for all 13 color roles, 3 font roles and `--radius-tile: 28px`. Dark variant is `[data-theme=dark]`. Base layer: body colors, focus ring, reduced motion.
- `app/utils/presets.ts`: 3 color presets (13 roles, light + dark) and 3 font presets (display, body, mono). `COLOR_PRESET_IDS`, `FONT_PRESET_IDS`, `ColorPresetId`, `FontPresetId`.
- `scripts/build-presets.ts` writes `app/assets/css/presets.css` (committed, deterministic, regenerated in `predev` and `pregenerate`).
- `scripts/check-contrast.ts`: WCAG table for 42 pairs. `npm run check:contrast`.
- `scripts/validate-profile.ts`: `npm run check:profile`. Runs in `predev` and `pregenerate`.
- `app/utils/networks.ts` (17 networks + `UI_ICONS`), `app/utils/sizes.ts` (`SIZES`, `SIZE_CLASSES`, `sizeToSpan`).
- `types/profile.ts`: zod v4 schema, discriminated union on `type`, `superRefine` for unique ids and layout consistency. Exports `ProfileSchema`, `Profile`, `Block`, `BlockType`, per-block types, `parseProfile()`.
- `content/profile.json`: sample data. Passes `parseProfile`.
- `nuxt.config.ts`: reads `profile.json` at config time. `fonts.families` = only the chosen font preset (Geist 400/500/600, Geist Mono 400/500, `global: true`). `icon.clientBundle.icons` = block icons + social map + UI icons (22 icons, 18.96 KB). `provider: 'none'`, `mode: 'svg'`. `/edit` and `/api/**` excluded from prerender. `autoSubfolderIndex: false`.
- `app/app.vue` sets `data-colors`, `data-fonts`, `data-theme` on `<html>` via `useHead`. `app/composables/useProfile.ts` (first version, WP1 owns it). `app/pages/index.vue` placeholder (WP1 replaces it).
- `eslint.config.mjs` via `withNuxt()` with stylistic rules. `tsconfig.json` = Nuxt 4 default. `typescript.strict: true`.

### Versions installed
- `@nuxt/eslint` ^1.17.0
- `@nuxt/fonts` ^0.14.0
- `@nuxt/icon` ^2.5.1
- `@tailwindcss/vite` ^4.3.3
- `nuxt` ^4.5.2
- `tailwindcss` ^4.3.3
- `vue` ^3.5.42
- `vue-router` ^5.3.1
- `zod` ^4.6.5
- `@iconify-json/line-md` ^1.2.16
- `@iconify-json/simple-icons` ^1.2.96
- `eslint` ^10.10.0
- `tsx` ^4.23.13
- `typescript` ^6.0.3
- `vue-tsc` ^3.3.11

### Deviations from PLAN.md and why
1. **Contrast fixes in `presets.ts`** (PLAN 5.2 values failed 4.5:1):
   - `condomera` light `pop`: `#0284C7` (sky-600) -> `#0369A1` (sky-700). White on sky-600 was 4.10:1. Now 5.93:1. Same hue family, one step darker.
   - `lunchbox` dark `accent-soft`: `#2E4A2C` -> `#1F331D`. On accent `#5C8F58` it was 2.59:1 (min 3:1). Now 3.57:1.
2. **`fonts.processCSSVariables: false`**. `presets.css` lists every preset's family in `--font-*` variables. With the default scan, `@nuxt/fonts` downloaded all 7 families. Now only the active preset (`global: true`) downloads. `dist/_fonts` = 10 Geist files, 156 KB.
3. **`typescript.nodeTsConfig.include`** adds `scripts/**` and `types/**` so `nuxt typecheck` covers them. Nuxt's default tsconfigs skip those folders.
4. **`presets.css` extras**: each `[data-fonts]` block also sets `--font-display-weight`, and a `[data-fonts="x"] .font-display { ... }` rule carries the preset's tracking and `font-variation-settings`. WP1 can use `.font-display` and get the right weight/tracking.
5. **`api.iconify.design` string in `dist/_nuxt/*.js`**. It is the default endpoint constant inside `@iconify/vue` and in the icon app-config defaults. With `provider: 'none'` the plugin does `_api.setFetch(() => Promise.resolve(new Response()))`, so no network call can happen. The string cannot be removed without patching the library. Verified: `dist/index.html` has the inline `<svg>` with `<animate>`, no runtime fetch.
6. `npx nuxi init` refuses a non-empty folder. Scaffolded in a temp dir and moved files in.
7. `check:icons` is not in `pregenerate` yet. WP2 owns `scripts/check-icons.ts` and must add it to `package.json` scripts (WP0 file, allowed with a note here).

### Notes for WP1-WP4
- Import the contract with `~~/types/profile` (root alias). `useProfile()` returns `{ profile }` already parsed.
- Server routes (WP3) should import `~~/types/profile` too. `types/profile.ts` imports `app/utils/*` with relative paths, so it works from scripts and server code.
- Preset switch or icon change in `profile.json` needs a dev restart (`nuxt.config.ts` reads it once).
- `SIZE_CLASSES['1x1']` is an empty string. `section` blocks have no `size`.
- `z.url()` is used for every `url`. `mailto:` passes. Relative paths do not.
- `.font-display` gets its tracking from `presets.css`. Use `font-display` utility, not a raw `font-family`.

### Contrast table (after fixes)
| preset | mode | pair | ratio | min | ok |
|---|---|---|---|---|---|
| condomera | light | ink on ground | 15.05:1 | 4.5:1 | yes |
| condomera | light | ink on tile | 16.69:1 | 4.5:1 | yes |
| condomera | light | muted on tile | 6.52:1 | 4.5:1 | yes |
| condomera | light | muted on ground | 5.88:1 | 4.5:1 | yes |
| condomera | light | accent-ink on accent | 9.46:1 | 4.5:1 | yes |
| condomera | light | accent-soft on accent | 7.13:1 | 3:1 | yes |
| condomera | light | pop-ink on pop | 5.93:1 | 4.5:1 | yes |
| condomera | dark | ink on ground | 16.11:1 | 4.5:1 | yes |
| condomera | dark | ink on tile | 14.06:1 | 4.5:1 | yes |
| condomera | dark | muted on tile | 7.53:1 | 4.5:1 | yes |
| condomera | dark | muted on ground | 8.63:1 | 4.5:1 | yes |
| condomera | dark | accent-ink on accent | 8.44:1 | 4.5:1 | yes |
| condomera | dark | accent-soft on accent | 4.42:1 | 3:1 | yes |
| condomera | dark | pop-ink on pop | 8.44:1 | 4.5:1 | yes |
| lunchbox | light | ink on ground | 13.61:1 | 4.5:1 | yes |
| lunchbox | light | ink on tile | 16.39:1 | 4.5:1 | yes |
| lunchbox | light | muted on tile | 6.23:1 | 4.5:1 | yes |
| lunchbox | light | muted on ground | 5.17:1 | 4.5:1 | yes |
| lunchbox | light | accent-ink on accent | 6.23:1 | 4.5:1 | yes |
| lunchbox | light | accent-soft on accent | 4.81:1 | 3:1 | yes |
| lunchbox | light | pop-ink on pop | 9.78:1 | 4.5:1 | yes |
| lunchbox | dark | ink on ground | 15.43:1 | 4.5:1 | yes |
| lunchbox | dark | ink on tile | 13.70:1 | 4.5:1 | yes |
| lunchbox | dark | muted on tile | 6.79:1 | 4.5:1 | yes |
| lunchbox | dark | muted on ground | 7.64:1 | 4.5:1 | yes |
| lunchbox | dark | accent-ink on accent | 4.90:1 | 4.5:1 | yes |
| lunchbox | dark | accent-soft on accent | 3.57:1 | 3:1 | yes |
| lunchbox | dark | pop-ink on pop | 9.78:1 | 4.5:1 | yes |
| night | light | ink on ground | 15.95:1 | 4.5:1 | yes |
| night | light | ink on tile | 17.70:1 | 4.5:1 | yes |
| night | light | muted on tile | 5.93:1 | 4.5:1 | yes |
| night | light | muted on ground | 5.35:1 | 4.5:1 | yes |
| night | light | accent-ink on accent | 9.55:1 | 4.5:1 | yes |
| night | light | accent-soft on accent | 5.10:1 | 3:1 | yes |
| night | light | pop-ink on pop | 9.55:1 | 4.5:1 | yes |
| night | dark | ink on ground | 15.65:1 | 4.5:1 | yes |
| night | dark | ink on tile | 14.03:1 | 4.5:1 | yes |
| night | dark | muted on tile | 6.28:1 | 4.5:1 | yes |
| night | dark | muted on ground | 7.00:1 | 4.5:1 | yes |
| night | dark | accent-ink on accent | 9.55:1 | 4.5:1 | yes |
| night | dark | accent-soft on accent | 5.10:1 | 3:1 | yes |
| night | dark | pop-ink on pop | 9.55:1 | 4.5:1 | yes |

All 42 pairs pass.

### Verification output (last lines)

`npm run lint`
```
> tilebox@0.1.0 lint
> eslint .
(no output, exit 0)
```

`npm run typecheck`
```

ℹ Nuxt Icon server bundle mode is set to local
ℹ Nuxt Icon client bundle consist of 22 icons with 18.96KB(uncompressed) in size
(exit 0)
```

`npm run generate`
```
[nitro]   ├─ /_payload.json (1ms)
[nitro] ℹ Prerendered 4 routes in 0.688 seconds
[nitro] ✔ Generated public .output/public
[nitro] ✔ You can preview this build using npx serve .output/public
│
└  ✨ You can now deploy .output/public to any static hosting!
(exit 0)
```

`dist/` checks: `index.html` has "Ricardo Vargas", one inline animated `<svg>`, `<html lang="en" data-colors="condomera" data-fonts="geist" data-theme="light">`. No `dist/edit`, no `dist/api`. `dist/_fonts` = Geist + Geist Mono only.

### WP0 review (OCR / DeepSeek, per commit, 2026-09-17)
Applied: engines `^22.19 || ^24.11`; `@nuxt/eslint` to devDependencies; `check:contrast` added to `pregenerate`; accent-soft and hover pairs now need 4.5:1 (condomera dark accent-soft `#0A3D5C`, lunchbox dark accent-soft `#0F1A0D`, night light hover `#855400`); `--radius-tile` responsive (24px phone, 28px from 768px); zod schemas `.strict()`; image `alt` non-empty. PLAN.md 5.2 updated with the final values.
Not applied (wrong or deferred): `~~` alias claim (in Nuxt 4 `~~` is rootDir, build proves it); vue-router pin (single instance, Nuxt 4.5 uses v5); "scripts missing" (they are in the next commit); theme flash for `mode: system` (WP1 owns `useTheme`, must add a pre-paint inline script); `check-icons` (WP2); rgba alpha in contrast check (no text pair uses alpha).

## WP2

Branch: `wp/2-blocks`. Date: 2026-09-17. Worktree agent. Node 22.23.1.

### What was built
- `app/components/blocks/Tile.vue`: base chrome. `<a>` when `href` is set (`target="_blank"` + `rel="noopener"` only for http(s), not `mailto:`), else `<div>`. Props: `variant` (`tile | accent | pop`), `ariaLabel`, `padded` (default true, `p-5 md:p-7`), `clip` (`overflow-hidden`). Classes: `relative flex h-full w-full flex-col justify-between rounded-tile`, lift `md:hover:-translate-y-0.5` (150ms, off under `motion-reduce`). `tile` variant has `border border-line bg-tile text-ink` and `md:hover:text-hover` on links. `accent`/`pop` have no border. Focus ring comes from `main.css`.
- `app/components/blocks/media.ts`: pure helpers shared by components and scripts (no Vue): `hostOf`, `domainLabel`, `isHttpUrl`, `youtubeId` (watch, youtu.be, shorts, embed, live), `youtubeEmbedUrl` (youtube-nocookie, autoplay=1), `faviconPath`, `thumbPath`, `TileVariant` type.
- `LinkBlock.vue`: variant from `accent`/`pop`. Top row: `<Icon :name="block.icon">` 44px (36 phone) if set, else the build-time favicon `<img>` from `public/icons/manifest.json` (static import), else `line-md:link`. Domain text (mono 14/13) shows only when there is no `icon`; `mailto:` shows the address. Arrow icon `line-md:external-link` 24/22px. Title: 34px/1.05 (26 phone) on 2-column sizes (`2x1`, `2x2`), 18px (16 phone) on `1x1` and `1x2`. Description 16/14px.
- `SocialBlock.vue`: NETWORKS icon 44/36, label 18/16 600, `block.label` mono 14/13 muted. `aria-label="<label> profile"`.
- `ImageBlock.vue`: `bg-photo` layer, `<img loading="lazy" decoding="async">` covering the tile, caption bottom-left on `bg-ink/60` scrim with `text-ground` (font-display 26/22). Credit line "Photo by {author}" (mono 12px) when `source.author` is set, linked to `authorUrl`. A missing file hides the `<img>` (`@error` plus an `onMounted` check for errors that fire before hydration) so the placeholder shows.
- `TextBlock.vue`: title `<h2>` font-display 26/22, body split on blank lines into `<p>` (no markdown, no `v-html`), 16/14px muted, footnote mono 13/12 at the bottom. Body area is `overflow-hidden` so long text clips inside the fixed row height.
- `SectionBlock.vue`: `<h2>` font-display 26/22 + 1px `bg-line` rule. `h-full min-h-0 py-2`. Not a tile.
- `MapBlock.vue`: link tile, `line-md:map-marker` 40/34 `text-accent`, label 18/16, sublabel mono 14/13 muted. `aria-label="<label> on the map"`.
- `VideoBlock.vue`: YouTube -> thumbnail region (`flex-1 bg-photo`, `<img>` from `public/thumbs/manifest.json` or `block.thumbnail`) with a real `<button aria-label="Play <title>">` over it: 56px `bg-accent` circle + `line-md:play`. Click swaps in `<iframe src="https://www.youtube-nocookie.com/embed/<id>?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen :title>`. The iframe never exists in the static HTML (state starts `false`). Footer: title 20/18 600 + host 15/14 muted. Non-YouTube urls: link tile with the play icon.
- `BlockRenderer.vue`: `props { block: Block }`, `v-if` chain on `block.type` (vue-tsc narrows the union per branch).
- `index.ts`: `BLOCK_COMPONENTS` (type -> component), named exports for every component and `Tile`, re-exports `media.ts`. Default export = `BlockRenderer` (see deviation 2).
- `scripts/check-icons.ts` (`npm run check:icons`): collects `icon` fields in `profile.json`, `NETWORKS`, `UI_ICONS` and the static `COMPONENT_ICONS` list, resolves `@iconify-json/<prefix>/icons.json` via `createRequire`, checks `icons` and `aliases`. Exit 1 with the list of missing names. Output now: `OK  22 icons found in installed Iconify packs`.
- `scripts/fetch-favicons.ts` (`npm run fetch:favicons`): link blocks without `icon` -> `https://www.google.com/s2/favicons?domain=<host>&sz=64` into `public/icons/<sha1(host).slice(0,12)>.png`; YouTube video blocks -> `https://img.youtube.com/vi/<id>/hqdefault.jpg` into `public/thumbs/<id>.jpg`. 5s timeout, follows redirects, skips existing files, accepts only `2xx` + `image/*`. Writes `public/icons/manifest.json` (`host -> file`) and `public/thumbs/manifest.json` (`id -> file`). Any error logs one line and exits 0.
- `package.json`: added `check:icons`, `fetch:favicons`; `pregenerate` now ends with `&& npm run check:icons && npm run fetch:favicons`.
- Committed: `public/icons/manifest.json` (`{}`), `public/thumbs/manifest.json`, `public/thumbs/dQw4w9WgXcQ.jpg`.

### Icon names used by the components
All through `UI_ICONS` in `app/utils/networks.ts`: `line-md:link` (LinkBlock fallback), `line-md:external-link` (LinkBlock arrow), `line-md:map-marker` (MapBlock), `line-md:play` (VideoBlock). Plus every `NETWORKS[*].icon` (SocialBlock) and every `block.icon` in `profile.json` (LinkBlock). All are already in `icon.clientBundle.icons`. `line-md:arrow-up-right` does not exist in the pack, so the arrow is `line-md:external-link`.

### Deviations and why
1. **Favicon manifest key is the host, not the full url.** The file name is `sha1(host)`, several links can share one host, and `mailto:` has no host. `LinkBlock` looks up `hostOf(block.url)`.
2. **Nuxt scans `.ts` files in `app/components/`** (pattern `**/*.{js,ts,vue,...}`). `index.ts` and `media.ts` get registered as components `Blocks` and `BlocksMedia`. Typecheck and build pass. `index.ts` has `export default BlockRenderer` so the `Blocks` name is at least a real component. A `components.dirs` ignore for `*.ts` would remove the wart (nuxt.config.ts, WP0 file).
3. **Auto-registered names carry the folder prefix**: `BlocksBlockRenderer`, `BlocksLinkBlock`, etc. The contract says `<BlockRenderer>`. WP1 should import it: `import { BlockRenderer } from '~/components/blocks'`. Inside the blocks folder every component imports `Tile` explicitly.
4. **Google favicon 404 for hosts with no favicon** (`example.com` in the sample data). The script skips the file, the manifest stays empty, and the tile shows `line-md:link`. Tested with `github.com`: `c2208abde966.png` (32x32 PNG) is written and listed. So `dist/icons/` only has `manifest.json` until `profile.json` has real hosts.
5. **`pop` variant meta text is `text-pop-ink/85`, not `text-muted`.** `muted` on `pop` fails contrast in `condomera`. Description on `accent` is `text-accent-soft`.
6. **Video tile is not a strict 16:9 box.** Tile height is fixed by the grid, so the thumbnail fills the space above the title footer (`flex-1`) with `object-cover`. A `aspect-video` box would overflow a 240px row.
7. **`1x2` link titles use the 18px label size**, same as `1x1`. A 34px title does not fit one column well. Only 2-column sizes get 34px.
8. **`ImageBlock` `bg-photo` is an inner absolute layer**, because a `bg-photo` class passed to `Tile` lost to its own `bg-tile` in the Tailwind cascade.

### Requests to other WPs
- **WP1 (BentoGrid)**: import `BlockRenderer` from `~/components/blocks` (see deviation 3). Section rows: the `<li>` for a `section` block needs `col-span-full` and auto height. With `grid-auto-rows: 240px` the heading floats in a 240px row. Consider `grid-auto-rows: minmax(0, 240px)` is not enough; use an explicit `[grid-row:auto] h-auto` plus `grid-auto-rows` on the `<ul>` only for tiles, or render sections outside the `<ul>` as `<h2>` between two grids.
- **WP1 or WP5**: `public/blocks/photo.jpg` does not exist. `ImageBlock` hides the broken image and shows `bg-photo`. Add a real photo.
- **WP0 / architect** (optional): `components.dirs` ignore for `**/*.ts` under `app/components/blocks` (deviation 2).
- **WP3 (editor)**: `BLOCK_COMPONENTS` is `Readonly<Record<BlockType, Component>>`. `media.ts` exports `youtubeId()` if the editor wants to preview a thumbnail.

### Verification
Test page `app/pages/_blocks.vue` (not committed) rendered all 9 sample blocks (7 types) at 1280 and 500 px in headless Chrome. `dist/index.html` has no `<iframe>`. `dist/_nuxt/*.js` contains the `api.iconify.design` string only as the library constant (WP0 deviation 5); `provider: 'none'` stubs fetch.

`npm run lint`
```
> tilebox@0.1.0 lint
> eslint .
```
(exit 0, no output)

`npm run typecheck`
```
> nuxt typecheck
ℹ Nuxt Icon server bundle mode is set to local
ℹ Nuxt Icon client bundle consist of 22 icons with 18.96KB(uncompressed) in size
```
(exit 0)

`npm run generate` (pregenerate output, then build)
```
OK  22 icons found in installed Iconify packs
skip example.com: HTTP 404 image/png
OK  favicons 0/1, thumbnails 1/1
[nitro] ℹ Prerendered 4 routes in 0.964 seconds
[nitro] ✔ Generated public .output/public
└  ✨ You can now deploy .output/public to any static hosting!
```
`dist/`: `icons/manifest.json`, `thumbs/dQw4w9WgXcQ.jpg`, `thumbs/manifest.json`.
