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

## WP4

Branch: `wp/4-deploy-docs`. Date: 2026-09-17. Node used: 22.23.1.

### What was built
- `.github/workflows/ci.yml`: on `push` and `pull_request`. `actions/setup-node@v4` with Node 24 and npm cache. Steps: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run generate`, then `test -f dist/index.html && ! test -e dist/edit`. Uploads `dist` as an artifact for 7 days. Concurrency group `ci-${{ github.ref }}`, cancel in progress. YAML validated with `ruby -ryaml`.
- `netlify.toml`: build `npm run generate`, publish `dist`, `NODE_VERSION=24`. Headers: `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` on `/*`. `Cache-Control: public, max-age=31536000, immutable` on `/_nuxt/*` and `/_fonts/*`.
- `.node-version` = `24`. Cloudflare Pages reads it. `.nvmrc` (WP0) already says 24 too.
- `LICENSE`: MIT, 2026, Ricardo Vargas.
- `public/og.png`: 1200x630 PNG. Ground `#EEF4F8`, "tilebox" in Helvetica Neue Bold 120px ink `#0B1F33`, "Bento-style personal page" 36px in `#4A6075`. Verified with `sips`: 1200x630, format png, 33 KB. It lands in `dist/og.png`.
- `README.md`: rewritten, 119 lines. Quick start, hand editing (shape, sizes, block table, presets, icons, images), scripts table, Cloudflare Pages and Netlify deploy, restart note, roadmap, license.

### Deviations and why
1. **OG image made with a Swift script, not Pillow or qlmanage.** Pillow is not installed. `qlmanage -t -s 1200` rendered the SVG to a 1200x1200 square with wrong scaling. `swiftc` is on this Mac, so a 40-line AppKit script drew the PNG directly. The script is not committed (one-off, lives in the session scratchpad). No npm dependency added. `public/og.svg` was not needed and is not committed.
2. README lists `check:icons` and `fetch:favicons` in the scripts table. WP2 owns those scripts and adds them to `package.json`. They are not in `package.json` on this branch yet. If WP2 renames them, the README needs a one-line fix.
3. README says `pregenerate` also runs `check:icons`. That is the plan (NOTES WP0 item 7). True once WP2 merges.

### Requests to other WPs
- **WP1** (`useSeoMeta`): set `ogImage` to `/og.png` (absolute URL if the site URL is known), `ogImageWidth: 1200`, `ogImageHeight: 630`, `twitterCard: 'summary_large_image'`.
- **WP2**: keep the script names `check:icons` and `fetch:favicons` as in PLAN.md so the README stays right.
## WP1

Branch: `wp/1-public-shell`. Date: 2026-09-17. Node used: 22.23.1.

### What was built
- `app/composables/useProfile.ts`: parses `content/profile.json` once at module scope. Returns `{ profile: Profile }` (typed, never undefined).
- `app/composables/useTheme.ts`: `mode` (`system | light | dark`) from `profile.theme.mode`, stored in localStorage `tilebox:theme` (try/catch). `resolved` (`light | dark`) is written to `<html data-theme>` from the client. `system` follows `matchMedia('(prefers-color-scheme: dark)')` and its `change` event. `cycle()` goes system -> light -> dark -> system. Head: `<meta name="color-scheme">` (`light dark` for system) and `theme-color` from the active color preset ground (two tags with `media` for system, one for a fixed mode). A 256-byte inline `<script>` in `<head>` (`useHead` `innerHTML`, key `tilebox-theme`) sets `data-theme` before paint from localStorage or `matchMedia`.
- No flash design: for `mode: system` the prerendered HTML has NO `data-theme` (checked: `dist/index.html` has zero `data-theme`). A fixed mode is prerendered with `useServerHead`. On the client the attribute is written straight to the DOM (`watch` + `onMounted`), never through unhead, so hydration cannot revert what the inline script set. localStorage is read in `onMounted`, so the server-rendered toggle matches the first client render (no hydration mismatch).
- `app/app.vue`: keeps `data-colors` and `data-fonts`, drops the hardcoded `data-theme`, calls `useTheme()`, wraps the page in `<NuxtLayout>`.
- `app/layouts/default.vue`: skip link, `<ThemeToggle>`, `<main id="main">` 1280px max, padding 16px / 64px from `md`, footer "Made with tilebox" (mono, muted).
- `app/components/ThemeToggle.vue`: fixed top-right, 44px round `<button>` with `aria-label` and `title` ("Theme: system. Switch to light."). Icons `line-md:monitor`, `line-md:sunny`, `line-md:moon` (all exist in `@iconify-json/line-md`). The icon is inside `<ClientOnly>` because the stored mode is known only after mount. `scan: true` picked the 3 icons up (client bundle 22 -> 25 icons), so `networks.ts` was NOT changed.
- `app/components/ProfileHeader.vue`: the 2x2 hero tile. Avatar 64/96px or initials fallback (bg-accent, text-accent-soft, font-display). `<h1>` name 42/68px, line-height 1, weight from `--font-display-weight`, tracking from `presets.css`. Bio 16/19px, max 34ch, muted. Status line with a 10px `bg-dot` dot when `status` is set. Tile chrome: `bg-tile border-line rounded-tile`, padding 24/36px.
- `app/components/BentoGrid.vue`: one `<ul>` grid. 2 columns, 4 from `lg`. Gap 12/20px. First `<li>` is `ProfileHeader` (`col-span-2 row-span-2`). One `<li>` per id in `layout.desktop` with `SIZE_CLASSES[size]`; sections get `col-span-full row-auto`. Mobile order: index in `layout.mobile ?? layout.desktop` as `--order-m` + `max-md:[order:var(--order-m)]`. Stagger: `.tile-in` keyframes, 300ms, `--i * 40ms` delay, `animation-fill-mode: backwards` so the hover lift (`hover:-translate-y-0.5`, 150ms) works after it. `animation: none` under `prefers-reduced-motion`.
- `app/pages/index.vue`: `useSeoMeta` with title, description, ogTitle, ogDescription, ogImage `/og.png`, ogType website, twitterCard summary_large_image. Renders `<BentoGrid>`.
- `app/components/blocks/BlockRenderer.vue`: TEMPORARY stub in its own commit ("Add temporary BlockRenderer stub (WP2 replaces)"). Renders a tile with `block.type`. WP2 overwrites it. BentoGrid imports it by path (`~/components/blocks/BlockRenderer.vue`), so the auto-import name does not matter.

### Deviations and why
1. **Row heights are on the tiles, not on the grid.** The brief said `auto-rows-[173px] md:auto-rows-[240px]` and "section: row-auto, min height auto". A fixed `grid-auto-rows` makes every row 240px, so a section row could never be short. The grid uses `auto-rows-auto` with `--row` (173/240px) and `--gap` (12/20px) vars; each `<li>` gets `h-[var(--row)]` or `h-[calc(var(--row)*2+var(--gap))]`. Result is the same for tiles (measured 240 / 500 desktop, 173 / 358 phone) and the section row is auto (78px with the stub). WP2 block roots should use `h-full`.
2. **4 columns from `lg` (1024px), not `md`.** PLAN.md section 4 says 4 columns at >= 1024. At 768-1023 four columns would be 145px wide by 240px tall. Rows, gap, radius and padding still switch at `md` (768). Both boards (1280, 390) match.
3. PLAN.md section 4 also says "1 column at < 400px". The phone board is 390px wide with 2 columns, so the grid stays at 2 columns. Not implemented.
4. `types/profile.ts` exports no `Layout` type. BentoGrid uses `Profile['layout']`. No contract change needed.
5. The ThemeToggle floats over the top-right corner of the profile tile on phones (16px inset, tile has 24px padding and empty space there). Accepted; the brief asked for fixed top-right.
6. CSS `order` on phones means visual order differs from DOM/tab order there. This is the Bento model (PLAN.md section 2). Screen readers follow DOM order (= desktop order).

### Verification
Headless Chromium (playwright-core from the npx cache) against `dist/` served on :4173:
- Dark OS + `mode: system`: `data-theme` is `dark` before hydration, never `light`. No console errors or warnings.
- Toggle: system -> light -> dark -> system; localStorage `tilebox:theme` updates each click. Set light, reload: stays light, label reads "Theme: light. Switch to dark.", icon rendered.
- 1280: main 1280px, padding 64px, 4 columns of 273px, gap 20px, tiles 240/500px tall, h1 68px. Toggle box 44x44 at (1212, 24).
- 390: padding 16px, 2 columns of 173px, gap 12px, tiles 173/358px, h1 42px. Mobile order: image (b4) renders at y=571 before the two socials at y=941. Section row 62px.
- `prefers-reduced-motion: reduce`: `.tile-in` animation-name is `none`.
- `dist/index.html`: `<html lang="en" data-colors="condomera" data-fonts="geist">` (no `data-theme`), one `<h1>`, `<title>Ricardo Vargas</title>`, description, og:title, og:description, og:image `/og.png`, og:type, twitter:card, color-scheme `light dark`, two theme-color tags, inline `<script data-hid="tilebox-theme">`.

### Requests to other WPs
- WP2: replace `app/components/blocks/BlockRenderer.vue` (props `{ block: Block }`). Block roots should fill the `<li>` (`h-full`) and use `rounded-tile`. Section block: full-width, auto height (a heading, not a tile). Add `[data-reduced] svg * { animation: none }` or rely on `main.css` reduced-motion rule (already sets animation-duration 0.01ms).
- WP4: create `public/og.png` (referenced as `/og.png`). `ogImage` is a path, not an absolute URL, because no site URL is decided yet. Once it is, set `site.url` or an absolute `ogImage`.
- WP0 (contract, optional): export `type Layout = z.infer<typeof LayoutSchema>` from `types/profile.ts`.

### Verification output (last lines)
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
## WP3

Branch: `wp/3-editor`. Date: 2026-09-17. Node used: 22.23.1.

### What was built
- `npm i vue-draggable-plus` (0.6.1, brings `sortablejs` 1.15). Only `package.json` / `package-lock.json` changed for it. Loaded with a dynamic `import()` inside `BlockGridEditor.client.vue` only. It lands in its own lazy chunk; `dist/index.html` does not preload it.
- Server (dev only, every route starts with `assertDev()` = `if (!import.meta.dev) throw createError({ statusCode: 404 })`):
  - `server/utils/editor.ts`: `assertDev`, `readProfileFile`, `iconsOf`, `checkIcons` (reads `@iconify-json/<prefix>/icons.json` via `createRequire`, checks `icons` and `aliases`, caches per prefix).
  - `server/api/profile.get.ts`: returns `content/profile.json`, read from disk on each call.
  - `server/api/save.post.ts`: `ProfileSchema.safeParse` -> one error per issue as `path: message` -> icon check -> writes the file pretty (2 spaces, trailing newline). 400 with `data.errors: string[]` on any failure, nothing written. Returns `{ ok, restartNeeded }`; `restartNeeded` is true when `theme.colors`, `theme.fonts` or the set of block icons differs from the previous file.
  - `server/api/upload.post.ts`: `readMultipartFormData`, png/jpg/jpeg/webp/gif, 8 MB max, writes `public/blocks/<slug>-<6 hex>.<ext>`, returns `{ src }`. 415 on other types, 413 over the limit.
  - `server/api/icons/search.get.ts`: proxies `https://api.iconify.design/search?query=&limit=48&prefixes=line-md,simple-icons`, 5 s timeout, returns `{ icons }`.
- `app/composables/useEditor.ts`: draft (deep clone of `/api/profile`), `dirty` (JSON compare), `save`, `setOrder` (current layout only), `addBlock` (id `b<timestamp36>`, appended to desktop and to mobile if present), `updateBlock`, `deleteBlock`, `moveBlock`, `setTheme`, `select`. Also exports `BLOCK_TYPES`, `BLOCK_TYPE_LABELS`, `newBlock`, `blockSummary`.
- `app/pages/edit.vue`: `definePageMeta({ layout: false })`. Two panes: preview left, panel right with tabs Profile | Blocks | Theme. Sticky save bar: Save (disabled when clean), dirty dot, last save time, restart notice, inline error list. Cmd/Ctrl+S saves. `beforeunload` guard when dirty. Outside dev the page shows a one-line "dev only" message.
- `app/components/editor/`:
  - `PreviewTile.vue` (one tile: type, title, size, icon; body button selects, grip `[data-drag-handle]`), `PreviewGrid.vue` (static grid, SSR fallback), `BlockGridEditor.client.vue` (`VueDraggable` with `animation: 150, swapThreshold: 0.65, invertSwap: true, forceFallback: true, fallbackTolerance: 4, handle: '[data-drag-handle]'` and a `direction()` that returns `vertical` when either tile is a section, else `horizontal`). Desktop = 4 columns, mobile = 2 columns in a 390 px container. Sections are full row and draggable.
  - `LayoutSwitch.vue`, `BlockList.vue` (add menu with 7 types, up/down buttons), `BlockForm.vue` (fields per zod schema, size select, inline "Sure? Yes, delete / No"), `ThemePanel.vue` (3 color cards with ground/tile/accent/pop swatches from `COLOR_PRESETS`, 3 font cards in the preset's display family, mode switch), `IconPicker.vue`, `ImagePicker.vue`.
- Preview theming: `data-colors`, `data-fonts`, `data-theme` sit on the preview wrapper only. `presets.css` selectors are plain attribute selectors, so they cascade inside the wrapper while `<html>` keeps the saved theme and the editor chrome stays stable. `mode: system` resolves through `matchMedia`.

### Verified (headless Chrome over CDP, dev server)
- Add, edit, resize, delete blocks: preview updates live. Delete uses the inline confirm.
- Drag with real mouse events: `b2` moved after `b5` on desktop; mobile order untouched. Sortable instance attached to the grid.
- Theme cards: preview wrapper switched to `night` + `lunchbox` + dark (`rgb(19,24,38)` ground, Fraunces display) while `<body>` stayed on the saved preset.
- Invalid URL -> Save shows `blocks.0.url: Invalid URL`, file untouched. Fixed URL + Cmd+S -> file written, `npm run check:profile` OK, Save disabled.
- Unknown icon -> 400 `Icon "line-md:not-an-icon" does not exist in line-md. Browse https://icones.js.org/collection/line-md`.
- Upload: `x.txt` -> 415. `My Photo.png` -> `/blocks/my-photo-07aa6c.png` (removed after the test).
- `content/profile.json` restored to the committed version after the tests.

### Deviations and why
1. **Icon previews in the picker use the Iconify SVG endpoint, not `<Icon>`.** With `icon.provider: 'none'` `<Icon>` renders only bundled icons, so search results would be blank. Results render `<img src="https://api.iconify.design/<prefix>/<name>.svg?color=<ink>">` (dev only, allowed by PLAN.md 5.5) and fall back to the name as text on error. The current value still uses `<Icon>` plus the name.
2. **Every save remounts the page.** `app/app.vue` -> `useProfile` -> `import '~~/content/profile.json'`, so Vite HMR updates `/app.vue` after the file is written and the page loses its in-memory state. The draft is re-read from disk (no data loss), but the restart notice and last-save time vanished. Fix: `useEditor` keeps `tab`, `layoutKey`, `selectedId`, `lastSavedAt`, `restartNeeded` in `sessionStorage` (`tilebox-editor`). Verified: the notice and the time survive the remount.
3. **`server/utils/editor.ts` and `app/composables/useEditor.ts`** are outside the literal `server/api/*` and `app/components/editor/*` globs. Nitro would turn a helper inside `server/api/` into a route, and the brief rule says composables live in `app/composables`. Both files are WP3-only and nobody else owns them.
4. **Keyboard reorder** (up/down buttons in `BlockList.vue`) was added beyond the brief so reordering works without a mouse.
5. **`fallbackTolerance: 4`** added to the Sortable options so a click on a tile is not taken as a drag start.
6. The `direction()` mitigation from PLAN.md 4 is implemented as "vertical when a full-row section is involved, else horizontal". The README example keys on class names; ours keys on `data-full`.

### Requests to other WPs
- **WP1 (`useProfile.ts` / `app.vue`)**: the static `import` of `content/profile.json` in `useProfile` makes the editor page remount after each save (see deviation 2). It is handled on the editor side, but if WP1 or WP5 wants a smoother editor, an alternative is to keep that import but wrap the editor's `NuxtPage` with a stable key, or to load the JSON in `app.vue` only when `import.meta.prerender`.
- **WP2 (`BlockRenderer`) / WP5 (integration)**: `PreviewTile.vue` is a light stand-in. To use the real tiles, replace its inner `<button>` content with `<BlockRenderer :block>` and keep the `<li data-id data-full>` wrapper plus the `[data-drag-handle]` grip. `BlockGridEditor.client.vue` only needs the `<li>` children to carry `data-id`.
- **WP0/WP5 (`content/profile.json`)**: the sample block `b4` points to `/blocks/photo.jpg`, which does not exist in `public/`. The dev log shows a router "No match found for /blocks/photo.jpg" warning for it. Upload a photo through the editor or drop one in `public/blocks/`.
- **WP4 (README)**: document `npm run dev` then `http://localhost:3000/edit`, Cmd/Ctrl+S, and "restart dev after changing a preset or icons".

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
> nuxt typecheck
ℹ Nuxt Icon server bundle mode is set to local
ℹ Nuxt Icon client bundle consist of 25 icons with 21.68KB(uncompressed) in size
> tilebox@0.1.0 typecheck
> nuxt typecheck

ℹ Nuxt Icon server bundle mode is set to local
ℹ Nuxt Icon client bundle consist of 22 icons with 18.96KB(uncompressed) in size
(exit 0)
```

`npm run generate`
```
[@nuxt/fonts] ✔ Fonts downloaded and cached.
[nitro]   ├─ /_payload.json (1ms)
[nitro] ℹ Prerendered 4 routes in 0.692 seconds
[nitro] ✔ Generated public .output/public
[nitro] ✔ You can preview this build using npx serve .output/public
│
└  ✨ You can now deploy .output/public to any static hosting!
(exit 0)
```

`dist/` check: `test -f dist/index.html && ! test -e dist/edit` passes. `dist/og.png` present, 32893 bytes.

### WP4 review (OCR / DeepSeek, branch range, 2026-09-17)
Applied: `permissions: contents: read`, `timeout-minutes: 10`, push trigger limited to `main`, dist check also guards `dist/edit.html`. `.node-version` kept next to `.nvmrc` on purpose: Cloudflare Pages reads `.node-version`, nvm reads `.nvmrc`. Ownership recorded here.
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
`dist/` checks: `dist/` = `200.html 404.html _fonts _nuxt _payload.json favicon.ico index.html robots.txt`. No `dist/edit`, no `dist/api`. `grep -rl "readMultipartFormData\|iconify.design/search\|node:fs" dist` = 0 files. The edit page and the Sortable library are separate lazy chunks that `index.html` does not preload. `npm run check:profile` = `OK content/profile.json (9 blocks, theme condomera/geist)`.

## WP5

Branch: `wp/5-integration`. Date: 2026-09-17. Node used: 22.23.1. Works directly on `main` (all WPs merged). No merge done.

### Review findings, one by one

WP1
1. Applied. `useTheme.ts` reads localStorage and `matchMedia` during client setup, applies `data-theme` with `watch(..., { immediate: true })`, gives the `color-scheme` and the two `theme-color` metas keys (`theme-color-light`, `theme-color-dark`, or `theme-color`), removes the media listener with `onScopeDispose`, and `isMode` uses three literal checks. Exports `THEME_MODES` and a `nextMode` computed.
2. Applied. The three icons were already in `dist/_nuxt/*.js` (`scan: true` found them). They are now also in `UI_ICONS` (`themeSystem`, `themeLight`, `themeDark`) so `check:icons` covers them. `title` dropped. Label is derived from `nextMode`. Token focus ring. Extra: the whole button is inside `<ClientOnly>` (fallback = same box, `aria-label="Theme"`, disabled) because the label now depends on the stored mode and Vue does not patch a mismatched attribute on hydration. `:aria-hidden="true"` (boolean) on `<Icon>` stops a dev warning.
3. Applied. `focus:outline-none` removed from `<main>`. Footer is `text-sm`.
4. Applied. `max-lg:[order:var(--order-m)]`. Hover lift removed from the `<li>` (Tile.vue lifts links only and zeroes it under `motion-reduce`). `mobileOrder` computed once. Extra: below `lg` the stagger delay uses the phone order (`--order-m`) so tiles enter in the order they are seen.
5. Applied. `runtimeConfig.public.siteUrl` (`NUXT_PUBLIC_SITE_URL`, default `''`). With it: absolute `ogImage` and `ogUrl`. Without: `/og.png`. Added `ogImageWidth`/`ogImageHeight`. Documented in README (Cloudflare and Netlify) and `.env.example`.

WP2
6. Applied. `Tile.vue` links only for http(s) and `mailto:` (`isSafeHref` in `media.ts`), `rel="noopener noreferrer"`, `role="group"` on a labelled non-link tile.
7. Applied. Credit link only when `isHttpUrl(authorUrl)`, `rel="noopener noreferrer"`.
8. Applied. `(?:[/?#]|$)` after the 11-char id.
9. Applied. Explicit `v-else-if` for video; unknown type renders nothing. Extra: `priority` prop (see Lighthouse).
10. Applied. `Object.hasOwn`, `isIconPack` shape check, hint uses the icon's own prefix, `COMPONENT_ICONS` removed. Output: `OK  26 icons found in installed Iconify packs`.
11. Applied. `Promise.all` over both job maps, 5 MB cap (content-length and body), `FAVICON_URL(host)` and `THUMB_URL(id)`.

WP3
12. Applied. Failed pack loads are not cached. `IconifyJsonSchema` (zod). `readProfileFile` wraps `JSON.parse` in a 500 `createError` with the path.
13. Applied. Zod-parsed response, `line-md:` first then slice 48 (asks Iconify for 96), `q` capped at 64.
14. Applied. Extension decides; MIME must be an image type, `image/jpg`, or generic/empty; `content-length` > 8 MB is refused before the body is read; only the part named `file` is used.
15. Applied. `writeAtomic` (temp file in `content/` + `rename`, temp removed on failure). `profile.get` safeParses and answers 400 with `data.errors`.
16. Applied. Local `list` ref synced from the prop; `onReorder` emits ids. `loadFailed` removed.
17. Applied. Grip is `<button type="button" data-drag-handle aria-label="Drag to reorder">`, token focus ring, one position class. Selected tile: `outline-2 outline-offset-2 outline-accent` on the wrapper. Both controls show on hover, focus-within or selection (the tiles are the real ones now, so the controls hide otherwise).
18. Applied. `BlockSchema.safeParse` before emit, inline `role="alert"` list, no emit when invalid. `formControl()` and `instanceof` narrowing. Empty image `src`/`alt` ignored. A new local file sets `source: null`.
19. Applied. Add menu: `aria-haspopup="true"`, Escape closes and refocuses the button, outside click closes. `LayoutSwitch`: `radiogroup`/`radio`/`aria-checked`, roving tabindex, arrow keys.
20. Applied. Request id drops stale responses, empty query clears at once, `instanceof`, `alt=""`, `encodeURIComponent`, names without `:` skipped, sr-only "(opens in a new tab)". ImagePicker: `instanceof`, `aria-busy`, `isFetchErrorLike` type guard.
21. Applied, one part differently. Dev-only message is the whole page. Loading state until the first fetch resolves. Tablist: ArrowLeft/ArrowRight/Home/End. `FOCUS_RING` on inputs, selects, textareas, tabs, buttons, links. `formControl()` narrowing. Mode select removed from Profile; ThemePanel owns it as a radio group. Restart note names color preset, fonts and icons. Avatar `alt`: the editor no longer has its own avatar markup (the preview renders the real `ProfileHeader`), and there the avatar keeps `alt=""` because the `<h1>` with the name sits next to it; `alt="<name>"` would make screen readers read the name twice. axe passes.

### Integration
22. Done. `PreviewTile` renders `<BlockRenderer :block>` inside `<li data-id data-full>`. The real `<ProfileHeader :profile>` is the first `<li>` of both preview grids (`data-profile`, no `data-id`; Sortable's `draggable: 'li[data-id]'` ignores it). Both grids use the BentoGrid row model (`--row`, `--gap`, `auto-rows-auto`, tiles carry their height) so a section row is short. `edit.vue` has a capture-phase click handler: it selects the block of the clicked tile, opens the Profile tab on a profile click, and `preventDefault` + `stopPropagation` for any link or button that is not an editor control (`[data-editor-control]`), so links never navigate and the video never starts. Verified headless: link click stays on `/edit` and selects; drag with the grip reorders (`b2` after `b6`).
23. Done. `public/blocks/sample.jpg`, 1200x1200 JPEG (35 KB), `#C7DEEC` with "sample" in `#0C4A6E`, drawn with a one-off AppKit script (not committed). `b4` and the new-image default point at it.
24. Done in PLAN.md, CLAUDE.md. NOTES.md and README.md had no such wording. Note: commits already on `main` from WP0-WP4 carry a `Co-Authored-By` trailer; the WP5 commits do not. Rewriting `main` history is out of scope for this branch.
25. Done. `public/thumbs/` and `package.json` script edits under WP2; `server/utils/*`, `useEditor.ts` and dependency edits under WP3. Status line updated.

### Tests (26)
- `@playwright/test` 1.63.0, `@axe-core/playwright`. Chromium via `npx playwright install chromium`.
- `scripts/serve-dist.mjs`: 50-line `node:http` static server for `dist/` on :4173.
- `playwright.config.ts`: projects `static` (public.spec, a11y.spec) and `dev` (editor.spec, `npm run dev -- --port 3111`, `reuseExistingServer: false`, 120 s). Only the servers of the selected projects start (argv `--project`). Tests and config are type-checked by the node tsconfig.
- CI: job `e2e` (needs `build`) downloads the `dist` artifact, `npx playwright install --with-deps chromium`, `npm run test:e2e -- --project=static`.
- Results (local, headless Chromium):
  - `static`: 11 passed (7 public + 4 axe).
  - `dev`: 4 passed (add/edit/mobile/keyboard-move/Cmd+S and file check, invalid URL, empty name -> 400, png upload into `public/blocks` and cleanup). `content/profile.json` restored, tree clean.
- axe (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `best-practice`) at 1280 and 390, light and dark: **0 violations of any impact**. The test waits for the tile stagger to finish first; while tiles fade in axe reads blended colors and reports false contrast failures.

### Lighthouse (27), mobile preset, Lighthouse 13.4.1, `--chrome-flags="--headless=new"`, static server on :4173
| Run | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Before fixes | 93 | 100 | 100 | 100 |
| After fixes (final) | **94** | **100** | **100** | **100** |

Final metrics: FCP 2.2 s, LCP 2.8 s, TBT 10 ms, CLS 0, Speed Index 2.2 s.
Fixes made: LCP element was the lazy-loaded image tile -> tiles at phone positions 1 to 3 pass `priority` and the image uses `loading="eager"` + `fetchpriority="high"`; `features.inlineStyles: true` removes the render-blocking CSS request (one page, one file); social and map tiles lost aria-labels that did not contain the visible text (label mismatch audit); stagger runs in visual order on phones.
Why 94, not 95: the LCP breakdown shows `elementRenderDelay` 438 ms. That is the page-load stagger (PLAN.md 5.6: opacity + 8 px, 300 ms, 40 ms apart). With the stagger disabled the same build scores **95** (LCP 2.6 s, render delay 59 ms). Kept the design rule. Options for the architect: (a) accept 94, (b) animate only `translate` (no opacity) on the first-screen tiles, which would give 95. Remaining audits are not cheap: 29 KiB unused JS in the Vue runtime chunk, bf-cache "internal error" (not actionable), cache headers (the test server sets none; Cloudflare and `netlify.toml` do).

### Real content check (28)
`content/profile.json` keeps placeholder links (`example.com`, `linkedin.com/in/example`, `mailto:hello@example.com`). `npm run check:profile`: `OK content/profile.json (9 blocks, theme condomera/geist)`. All 9 blocks (7 types) render in `dist/index.html` and in the editor preview (screenshots checked at 1400 px, desktop and mobile layout). Still needed from Ricardo: real links, city, avatar, a photo.

### Verification output (last lines)

`npm run lint`
```
> tilebox@0.1.0 lint
> eslint .
(no output, exit 0)
```

`npm run typecheck`
```
> nuxt typecheck
ℹ Nuxt Icon server bundle mode is set to local
ℹ Nuxt Icon client bundle consist of 26 icons with 22.33KB(uncompressed) in size
(exit 0)
```

`npm run generate`
```
[nitro]   ├─ /_payload.json (2ms)
[nitro] ℹ Prerendered 4 routes in 1.046 seconds
[nitro] ✔ Generated public .output/public
[nitro] ✔ You can preview this build using npx serve .output/public
│
└  ✨ You can now deploy .output/public to any static hosting!
(exit 0)
```

`dist/`: `200.html 404.html _fonts _nuxt _payload.json blocks favicon.ico icons index.html og.png robots.txt thumbs`. No `dist/edit`, no `dist/api`.

### Final review (Grok, range)

Applied, one commit each:
1. `app/pages/edit.vue`: `editor.load()`, the Cmd/Ctrl+S handler and the `beforeunload` guard run only when `import.meta.dev`. Outside dev the page renders the "development only" message and nothing fetches.
2. `server/api/upload.post.ts`: the pre-read `content-length` check allows 64 KB of multipart overhead. The exact 8 MB check stays on `file.data.byteLength`.
3. `tests/e2e/a11y.spec.ts`: fails on any axe violation, not only serious or critical. No moderate or minor violation appeared, so no markup changed.
4. `tests/e2e/public.spec.ts`: the network test fails on any request whose host is not the static server, and on any `/api/` path. New test: `/edit` and `/api/profile` return 404 on the static server.
5. `scripts/serve-dist.mjs`: malformed percent-encoding in the path serves `404.html` with 404 instead of crashing.
6. `app/components/blocks/VideoBlock.vue`: `aria-hidden="true"` on the play icon inside the labelled button.
7. `tests/e2e/helpers.ts`: `readProfile()` uses `parseProfile()` from `types/profile.ts` instead of an `as Profile` cast.
8. `PLAN.md` section 8, WP5 "Done when": Lighthouse target is 94+ performance and 100 on the other three (the stagger costs ~1 point by design). Browser check is headless Chromium via Playwright; Safari and Firefox are a manual check by Ricardo.

Deferred:
- DOM order vs visual order on phones. The Bento model puts `layout.mobile` in the DOM order, documented in PLAN.md.
- `BlockForm` empty-field handling.
- `useEditor` casts.
- `IconPicker` preview via `api.iconify.design` (editor only, never in `dist/`).
- Firefox and WebKit Playwright projects.
- Real content from Ricardo.

## WP6

Branch: `wp/6-release`. Date: 2026-09-17. Node used: 22.23.1.

### What was built
- Dev deps: `commit-and-tag-version` 12.7.3, `@commitlint/cli` + `@commitlint/config-conventional` 21.2.2, `simple-git-hooks` 2.14.0, `wrangler` 4.134.0.
- `commitlint.config.mjs`: config-conventional, header max 72. `package.json`: `"simple-git-hooks": { "commit-msg": "npx --no -- commitlint --edit $1" }`, `prepare: simple-git-hooks`. Hook installed with `npx simple-git-hooks`.
- `.versionrc.json`: header, `tagPrefix: v`, feat/fix/perf/refactor shown, docs/chore/ci/test/build/style hidden, bumps `package.json` + `package-lock.json`, `skip.commit` + `skip.tag` (the script commits and tags).
- `scripts/release.mjs` (`npm run release`): preflight (main, clean tree, `git fetch origin`, main == origin/main), checks (lint, typecheck, generate, Playwright static), next version from `commit-and-tag-version --dry-run`, commit list since the last tag, AI draft with `claude -p ... --output-format text` (90 s timeout; fallback `grok`), terminal prompt `[a]ccept, [e]dit, [w]rite my own, [s]kip`, then bump + `CHANGELOG.md` + `releases/vX.Y.Z.md` + `chore(release): vX.Y.Z` commit + annotated tag. Never pushes. Flags: `--release-as`, `--first-release`, `--skip-tests`, `--skip-checks`, `--summary`, `--no-ai`, `--dry-run`, `--yes`.
- `releases/v0.1.0.md`: hand-written body of the first GitHub Release.
- `.github/workflows/release.yml`: on `v*` tag push. Tag must equal `package.json` version. Lint, typecheck, generate, Playwright static, zip `dist/` + sha256, `softprops/action-gh-release@v3` with `releases/<tag>.md` as body (fallback "See CHANGELOG.md"), zip + sha256 attached, prerelease when the tag has `-`. `GITHUB_TOKEN` only. No deploy.
- `package.json`: `deploy` and `deploy:preview` (wrangler pages deploy, project `tilebox`). `.wrangler/` ignored. No `wrangler.toml` (direct upload needs none).
- Docs: README sections "Commit messages", "Release", "Deploy" (wrangler login, project create, turn off automatic production deployments if Git-connected). CLAUDE.md: commit rule and the two commands. PLAN.md: WP6 section, status line, Pexels owner renamed to WP7.

### Deviations and why
- `--skip-checks` skips the branch check as well as the origin sync check (the brief named only the sync check). Needed to run the end-to-end tests on `wp/6-release`. The clean-tree check is never skipped.
- No terminal on stdin: the prompt prints `(no terminal)` and the summary is skipped (`_No summary._`). Without this the script hung when stdin was closed.
- Added a guard: 0 commits since the last tag exits 1 unless `--release-as` or `--first-release`.
- `make_latest` is set to `false` for a pre-release tag, `true` otherwise.

### Verified
- Hook: `git commit --allow-empty -m "bad message"` exit 1 (`subject may not be empty`, `type may not be empty`). `chore: test hook` exit 0, then removed with `git reset --hard HEAD~1`.
- `node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks < /dev/null`: exit 0. `Next version: v0.1.1 (from v0.1.0)`, 87 commits listed, release file preview printed with the Features and Bug fixes sections, `working tree: still clean`.
- `node scripts/release.mjs --dry-run --skip-tests --skip-checks --yes`: `drafting with claude (up to 90 s) ... ok`. Draft (4 sentences): "tilebox v0.1.1 shows your links, social profiles, images, videos, and a map as tiles on one page. The page fits phones and desktops, has a light and dark mode, and offers three color presets and three font presets. You edit the page on your own computer with a built-in editor, where you drag tiles to reorder them, pick icons, and add images. Keyboard and screen reader users can reach every tile."
- Fake `claude` that sleeps 300 s first on PATH: `drafting with claude (up to 90 s) ... timed out`, then the fallback prompt, summary skipped, exit 0, tree clean.
- `--dry-run --first-release`: `Next version: v0.1.0 (from v0.1.0)`, `releases/v0.1.0.md exists. Keeping it. No draft.`, prints the existing file.
- Real apply on the branch, then undone: `--first-release --no-ai` made `CHANGELOG.md` (15 lines, `## 0.1.0`), commit `chore(release): v0.1.0`, tag `v0.1.0`. Then `--release-as 0.2.0 --summary "..."` bumped both package files to 0.2.0, wrote `releases/v0.2.0.md` from the `## [0.2.0](compare) (date)` section, commit + tag. Undo: `git tag -d v0.1.0 v0.2.0 && git reset --hard <base>`. No tag was pushed.
- Workflow: `ruby -ryaml` parses it (12 steps). The tag check step run locally: `GITHUB_REF_NAME=v9.9.9` exit 1 with `::error::Tag v9.9.9 does not match package.json version (v0.1.0).`; `v0.1.0` exit 0. Body step: missing file writes the fallback and a `::warning::`.
- `npx commitlint --from=main --to=HEAD`: every branch commit passes.
- Not verified: `npx wrangler login` and a real `npm run deploy` (needs Ricardo's Cloudflare account). A real workflow run on GitHub (needs a pushed tag).

### Verification output (last lines)

`npm run lint`
```
> eslint .
(exit 0)
```

`npm run typecheck`
```
> nuxt typecheck
ℹ Nuxt Icon server bundle mode is set to local
ℹ Nuxt Icon client bundle consist of 26 icons with 22.33KB(uncompressed) in size
(exit 0)
```

`npm run generate`
```
[nitro] ℹ Prerendered 4 routes in 1.168 seconds
[nitro] ✔ Generated public .output/public
└  ✨ You can now deploy .output/public to any static hosting!
(exit 0)
```

### Review (OCR, range)
Fixes applied on `wp/6-release` after the review of `scripts/release.mjs` and `.github/workflows/release.yml`. One commit per fix.
1. `ci`: actions pinned to full commit SHAs in `release.yml` and `ci.yml`: `softprops/action-gh-release@efb35369e0ad2afab669f228072c1b0d510eae64` (v3.0.3), `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1), `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` (v7.0.0). Checkout and setup-node moved from `v4` to `v7` in the same change.
2. `run()` returns `out` (stdout only) and `err` (stderr only). `git status --porcelain`, `git rev-parse`, and the commit-and-tag-version version line are parsed from stdout. Error messages print stderr, then stdout (`errorText()`).
3. Apply step starts with `git tag -l v<next>`; a non-empty result exits 1 before anything changes. Commit first, then tag. When `git tag` fails the script prints the recovery command `git reset --soft HEAD~1` (and the manual tag command) and exits 1.
4. `versionHeadingRe()` escapes every regex metacharacter in the version (`escapeRegExp()`), not only the dot.
5. `npx playwright install chromium` runs before `npx playwright test --project=static` (no-op when the browser is installed).
6. Repository URL comes from `git config --get remote.origin.url` (`git@github.com:owner/repo.git`, `ssh://git@...`, and `https://github.com/owner/repo.git` all become `https://github.com/owner/repo`). Fallback: the old hardcoded URL when there is no remote.
7. Windows: `npm` and `npx` spawn with `shell: true` on `win32` (Node refuses to spawn `.cmd` files without a shell). `\r\n` in captured output is normalized to `\n`.

Note: `.wrangler/` in `.gitignore` is a WP0-owned file edit, accepted by the architect.

## WP7

Branch: `wp/7-personal-data`. Date: 2026-09-18. Node used: 22.23.1.

Goal (decided by Ricardo): `content/profile.json` is the user's personal document. Never committed, pushed, or replaced by a git update or a release. Same for personal images. The repo ships a sample.

### What was built
- `content/profile.json` renamed (`git mv`) to `content/profile.example.json`, the tracked sample. `content/profile.json` is now in `.gitignore`.
- `content/resolve.ts`: the one resolver. Exports `ROOT` (`process.cwd()`, every entry point runs from the repo root), `PERSONAL_PROFILE_PATH`, `EXAMPLE_PROFILE_PATH`, `hasPersonalProfile()`, `resolveProfilePath()` (personal when it exists, else the example, checked on each call), `PROFILE_PATH` (resolved once at module load, for build-time code), `PROFILE_IS_PERSONAL`, `ensureProfile()` (copies the example to `profile.json` when missing, returns the personal path), `describeProfile()` (`content/profile.json (personal)` / `content/profile.example.json (example)`).
- Used by: `nuxt.config.ts` (reads `PROFILE_PATH` with `readFileSync` + `parseProfile`, no more static JSON import at config time), `scripts/validate-profile.ts`, `scripts/check-icons.ts`, `scripts/fetch-favicons.ts`, `tests/e2e/helpers.ts` (re-exports `PROFILE_PATH`, `PERSONAL_PROFILE_PATH`, `ROOT`), `server/utils/editor.ts` (`profileReadPath()` = resolved on each call, `PROFILE_WRITE_PATH` = always `content/profile.json`), `server/api/save.post.ts` (writes `PROFILE_WRITE_PATH`; the atomic write creates the file when it does not exist), `server/api/profile.get.ts`.
- Nuxt aliases in `nuxt.config.ts` (`alias` + `typescript.tsConfig.compilerOptions.paths`): `#profile` -> the resolved profile file (so `useProfile.ts` keeps a static `import profileJson from '#profile'`, and Vite HMR on save keeps working). `#manifest/icons` and `#manifest/thumbs` -> `public/<dir>/manifest.json` when it exists, else `app/components/blocks/empty-manifest.ts` (an empty `Record<string, string>`). `LinkBlock.vue` and `VideoBlock.vue` import through these aliases. Reason: the manifests are generated by `fetch:favicons` (pregenerate) from the user's profile, so they are not tracked any more, and CI runs `typecheck` before `generate`. Nuxt's own `alias` -> `paths` derivation drops the file extension, which breaks a `.json` target, so the explicit `paths` entries carry the extension.
- Untracked (`git rm --cached`): `public/icons/manifest.json`, `public/thumbs/manifest.json`, `public/thumbs/dQw4w9WgXcQ.jpg`. Added `public/icons/.gitkeep`, `public/thumbs/.gitkeep`. `.gitignore` block "Personal data": `content/profile.json`, `public/avatar.*`, `public/blocks/*` (except `sample.jpg`), `public/icons/*`, `public/thumbs/*` (except `.gitkeep`), `.tilebox/`, `.netlify/`.
- `scripts/ensure-profile.ts` (`npm run ensure:profile`): calls `ensureProfile()`, prints `Created content/profile.json from the example. It is yours and it is not tracked by git.` only when it created the file. `predev` = `ensure:profile && presets && check:profile`. `pregenerate` unchanged (never creates the file: CI and the release zip build the sample).
- `scripts/validate-profile.ts`: prints `profile: <file> (personal|example)`, a warning line when it validates the example, then the `OK` line.
- `scripts/release.mjs` preflight, after the clean-tree check: exit 1 when `git ls-files --error-unmatch content/profile.json` succeeds, or when `git ls-files public/blocks public/avatar.*` lists anything other than `public/blocks/sample.jpg`. Prints `personal data: not tracked` otherwise.
- `tests/e2e/repo.spec.ts` (static project, no browser): `git ls-files` has `content/profile.example.json`, not `content/profile.json`, no `public/avatar.*`, only `sample.jpg` under `public/blocks/`, nothing but `.gitkeep` under `public/icons/` and `public/thumbs/`. `playwright.config.ts` static `testMatch` includes it.
- `tests/e2e/editor.spec.ts` backs up and restores `PERSONAL_PROFILE_PATH` (the file the save route writes) instead of the resolved path.
- Docs: `content/README.md` (which file is yours, what is ignored, back up, reset, which file a build uses). README: Quick start step 3 is now `npm run deploy`, new section "Your personal data", scripts table (`ensure:profile`, `check:profile`), `predev`/`pregenerate` line, tests table. PLAN.md: status line, section 6 note, section 7 layout, `### WP7` in section 8.
- `package-lock.json` resynced with `npm install` (the lock file on `main` did not satisfy `conventional-commits-filter@6.0.1`, so `npm ci` failed). One `chore(deps)` commit.

### Deviations and why
- `ensureProfile()` returns the path (as specified). The "created" message comes from `scripts/ensure-profile.ts`, which checks `hasPersonalProfile()` before the call.
- The "which file is used" line is printed by `check:profile` (runs in both `predev` and `pregenerate`), not by `nuxt.config.ts`, so `nuxt typecheck` and every nuxt command do not repeat it.
- The manifest aliases (`#manifest/*`) were not in the brief. They replace the static `~~/public/<dir>/manifest.json` imports, which would fail `nuxt dev`, `nuxt typecheck` and CI on a fresh clone once the manifests stopped being tracked.
- `server/utils/editor.ts` no longer exports `PROFILE_PATH`. It exports `PROFILE_WRITE_PATH` and `profileReadPath()` to make the read/write split explicit.
- The release preflight also refuses a tracked `public/avatar.*` (the brief named `content/profile.json` and `public/blocks`).

### Verified
- Fresh clone (git clone of the branch into the scratchpad, `node_modules` symlinked), no `content/profile.json`: `npm run generate` exit 0, printed `profile: content/profile.example.json (example)` + the warning, `OK favicons 0/1, thumbnails 1/1`, `Prerendered 4 routes`, `dist/` complete, manifests regenerated, still no `content/profile.json` after the build. Then with the manifests deleted: `npx nuxt typecheck` exit 0 and `.nuxt/tsconfig.app.json` shows `#manifest/icons -> ../app/components/blocks/empty-manifest`, `#profile -> ../content/profile.example.json`.
- Worktree, no `content/profile.json`: `npm run dev -- --port 3122` printed `Created content/profile.json from the example. It is yours and it is not tracked by git.`, then `profile: content/profile.json (personal)`, server up, `GET /` = 200. `git status --short` empty. `git check-ignore -v content/profile.json` -> `.gitignore:18`.
- Negative test: `git add -f content/profile.json` + temp commit, then `node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks` exit 1 with `Error: content/profile.json is tracked by git. It is your personal file and must stay out of the repo.` and the `git rm --cached` hint. Temp commit undone with `git reset --soft HEAD~1 && git rm --cached content/profile.json`; the file stayed on disk.
- `node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks < /dev/null`: exit 0, `Next version: v0.1.1`, release file preview printed, `working tree: still clean`.
- `npx playwright test --project=static`: 16 passed (12 existing + 4 in `repo.spec.ts`).
- `npx commitlint --from=main --to=HEAD`: every branch commit passes.
- Not run: the `dev` Playwright project (unchanged behaviour apart from the backup path; it writes the personal file).

### Review (OCR, range)
Fixes applied on `wp/7-personal-data` after the review of `content/resolve.ts`, `server/api/save.post.ts` and the manifest aliases. One commit per fix. The resolver API below supersedes the `ROOT` / `PROFILE_PATH` / `PROFILE_IS_PERSONAL` description under "What was built".
1. `ROOT` anchors on the resolver file, not `process.cwd()`: `resolve(fileURLToPath(new URL('.', import.meta.url)), '..')`. Every importer (`nuxt.config.ts`, `scripts/*.ts`, `server/utils/editor.ts`, `tests/e2e/helpers.ts`) keeps working from any working directory. `tests/e2e/helpers.ts` re-exports `ROOT` from the resolver. Checked: `cd scripts && npx tsx -e "import('../content/resolve.ts').then(m=>console.log(m.ROOT))"` prints the repo root.
2. `PROFILE_PATH` and `PROFILE_IS_PERSONAL` (constants resolved at import) are gone. `profilePath()` and `profileIsPersonal()` are functions, checked on every call, so a call after `ensureProfile()` sees the personal file. `resolveProfilePath()` stays. Importers updated: `nuxt.config.ts` (one `const PROFILE_PATH = profilePath()` at config time), `scripts/check-icons.ts`, `scripts/fetch-favicons.ts`, `scripts/validate-profile.ts`, `tests/e2e/helpers.ts` (`readProfile()` resolves on each call, re-exports `profilePath`).
3. `ensureProfile()`: returns early when the personal file exists; throws `Cannot create <personal>: the example <example> does not exist.` when the sample is missing; wraps `copyFileSync` in try/catch and throws `Cannot copy <example> to <personal>: <reason>`. One line, both paths, no stack from `fs`.
4. `server/api/save.post.ts`: `firstPersonalSave = profileReadPath() !== PROFILE_WRITE_PATH`, read before the write. When true the response has `restartNeeded: true`, because the running dev server's `#profile` alias is still bound to the example. The editor shows its existing restart banner.
5. `app/components/blocks/empty-manifest.ts` verified against the generated manifests: both are a default export of `Record<string, string>` (`{ host: file }` / `{ id: file }`), and `LinkBlock.vue` / `VideoBlock.vue` assign the default import to `Readonly<Record<string, string>>`. No mismatch, no change. Proof: with `public/icons/manifest.json` and `public/thumbs/manifest.json` deleted, `npm run typecheck` exit 0 (`.nuxt/tsconfig.app.json` points `#manifest/*` at `empty-manifest`), `nuxt dev --port 3133` up for 15 s, `GET /` = 200, no error in the log (two pre-existing warnings only: the devtools Vite hook notice and a Vue `ariaHidden` prop warning). Then `npm run fetch:favicons` regenerated both manifests with the same content.

Note: the cross-package edits of this WP (`LinkBlock.vue`, `VideoBlock.vue`, `scripts/check-icons.ts`, `scripts/fetch-favicons.ts`, `app/composables/useProfile.ts`, `server/api/profile.get.ts`, `server/api/save.post.ts`) are accepted by the architect as required by the single-resolver design.

### Requests to other WPs
- None. `CLAUDE.md` could mention `content/profile.example.json` under "Still needed from Ricardo" (real content goes into `content/profile.json`, which is not tracked, so "real content in the repo" is no longer a goal).

### Verification output (last lines)

Run in the worktree with `content/profile.json` present (created by the dev smoke).

`npm run lint`
```
> eslint .
(exit 0)
```

`npm run typecheck`
```
> nuxt typecheck
ℹ Nuxt Icon server bundle mode is set to local
ℹ Nuxt Icon client bundle consist of 26 icons with 22.33KB(uncompressed) in size
(exit 0)
```

`npm run generate`
```
profile: content/profile.json (personal)
OK  content/profile.json (personal)  (9 blocks, theme condomera/geist)
[nitro] ℹ Prerendered 4 routes in 2.899 seconds
[nitro] ✔ Generated public .output/public
└  ✨ You can now deploy .output/public to any static hosting!
(exit 0)
```

`npx playwright test --project=static`
```
  ✓  16 [static] › tests/e2e/repo.spec.ts:30:3 › personal data stays out of git › fetched favicons and thumbnails are not tracked (0ms)
  16 passed (11.3s)
(exit 0)
```

## WP8

Branch: `wp/8-publish`. Date: 2026-09-18. Node used: 22.23.1. wrangler 4.134.0, netlify-cli 27.8.0.

### What was built
- `scripts/publish.mjs` (`npm run publish`, alias `npm run site:publish`): node built-ins only, same helpers as `release.mjs` (`run()`, `askLine()`, `log`/`step`, stdout-only parsing, `.cmd` through the shell on Windows). First run: provider prompt (2 options) or `--provider`, name prompt or `--name` (rules: `[a-z0-9-]`, no dash at the ends, max 37, loop on invalid), auth check (`wrangler whoami --json` / `netlify status --json`), browser login with inherited stdio when logged out and a re-check, account pick (`whoami` accounts / `netlify api listAccountsForUser`; prompt when more than one, or `--account`), availability pre-check (Cloudflare: `dns.resolve4('<name>.pages.dev')`, ENOTFOUND/ENODATA = free; Netlify: HTTPS HEAD, 404 = free), create (`wrangler pages project create` with `CLOUDFLARE_ACCOUNT_ID` / `netlify sites:create --json --disable-linking`), state file written only after a successful create. Then build (`npm run generate` with `NUXT_PUBLIC_SITE_URL` = `--site-url`, else the shell env, else the saved URL), `dist/index.html` check, file count (max 20,000) and size (max 25 MiB) check, upload (`wrangler pages deploy` with `WRANGLER_OUTPUT_FILE_PATH=.tilebox/wrangler-out.ndjson`, alias read from the `pages-deploy-detailed` line for previews; `netlify deploy --json`, `url` for production, `deploy_url` for previews), `Live:` / `Preview:` line, custom domain hint. Later runs: state + auth check + build + upload.
- State `.tilebox/publish.json`: `{ provider, name, accountId | accountSlug, siteId (Netlify), url, createdAt, lastPublishedAt }`. No token, ever. A conflicting `--provider` or `--name` against the saved state exits 2 with a hint to drop the flag or `--reset`.
- Flags: `--provider`, `--name`, `--account`, `--preview`, `--site-url`, `--no-build`, `--yes`, `--reset`, `--help`. Exit codes 0/1/2. Every external command is printed as `$ wrangler ...` before it runs; env values (`CLOUDFLARE_ACCOUNT_ID`) are printed in the prefix. Timeouts: 30 s checks and create, 10 min login, build and upload.
- `package.json`: `publish`, `site:publish`, `deploy` = `publish --provider cloudflare`, `deploy:preview` = `... --preview`. `netlify-cli` 27.8.0 added next to `wrangler`. `.gitignore`: `.tilebox/`, `.netlify/`.
- Docs: README "Publish" (first run, later runs, flags, state, what is never stored, custom domain, limits; the Git-connected Cloudflare and Netlify sections stay as optional). CLAUDE.md publish line. PLAN.md WP8 + status line.

### Deviations and why
- The CLI binaries are resolved from `PATH` first, then `node_modules/.bin` (not `npx`). `npx` always prefers the local install, which makes the fake-CLI tests impossible. The resolved path is printed once (`using ...`). A global older `wrangler` on `PATH` would win; the README says the pinned versions are the dev dependencies.
- `--account <id-or-slug>` added (not in the brief): needed for `--yes` runs with more than one account or team.
- The Netlify HEAD pre-check cannot tell a created-but-empty site from a free name: both answer 404 with the same headers (`netlify.netlify.app` answers 404 on 2026-09-18, so the brief's example was not usable). The create step covers it: non-interactive `netlify sites:create` auto-suffixes (`<name>-123`); the script warns and stores the real name. Taken names with a deploy answer 200 (`hono.netlify.app`) or 301 (`docs.netlify.app`) and are refused before create.
- `demo-site.pages.dev` is a real, taken project, so the shim tests use a random `tb-test-<time>-<pid>` name and the pre-checks run for real inside the shim tests.
- The state file is also consulted on later runs for a quick auth check (`whoami`/`status`, 30 s), so a fresh machine or an expired login runs the browser login before the upload fails.
- `npm ci` on `main` failed: `package-lock.json` was out of sync (`conventional-commits-filter`). `npm install -D netlify-cli` rewrote the lock (dedupe, 20k lines); the lock now matches `package.json` and `npm ci` works.
- Reattaching an existing project after `--reset` is manual (write `.tilebox/publish.json` by hand, documented in README). The taken-name check would otherwise refuse your own project name.

### Verified (fake CLIs on PATH, no login)
Shims `wrangler` and `netlify` (shell scripts in the session scratchpad, not committed) emulate `whoami --json`, `login`, `pages project create` (incl. the `8000000` taken error), `pages deploy` (writes the ND-JSON output file), `status --json` (logged in but not linked exits 1 with JSON, like the real CLI), `api listAccountsForUser`, `sites:create --json` (incl. auto-suffix), `deploy --json` (prod and draft). 47 checks, all pass:
- Cloudflare first run: `Live: https://<name>.pages.dev`; state has provider, name, `accountId`, url, dates; create and deploy got `CLOUDFLARE_ACCOUNT_ID` and `WRANGLER_OUTPUT_FILE_PATH`. Later run: no create, no DNS check, deploys again. `--preview`: `Preview: https://preview.<name>.pages.dev` from the alias; production url kept in the state.
- Netlify first run with auto-suffix: warns `It created <name>-123 instead`, state has `name: <name>-123`, `siteId`, `accountSlug`, `ssl_url`; `Live:` from the deploy JSON `url`; `--preview` prints `deploy_url`.
- Logged out + `--yes`: exit 1 `not logged in. Run: npx netlify login`, no state. Logged out without `--yes`: login runs, `whoami` runs twice, publish continues.
- Two accounts + `--yes`: exit 2 listing them; `--account acc-222` saved. Taken via CLI error: exit 1, no state.
- Real DNS: `hono.pages.dev` refused as taken, no create call; a random name is free. Real HTTPS: `hono.netlify.app` (200) and `docs.netlify.app` (301) refused; a random name is free (404).
- `--help` exit 0, unknown flag exit 2 with usage, invalid names (`-bad`, `bad-`, `Bad`, `a_b`, 40 chars) exit 2, invalid `--provider` exit 2, `--reset` with and without a state, provider and name conflicts exit 2, `--site-url ftp://x` exit 2, no TTY and no flags exit 2 with `Pass --provider`, `--no-build` without `dist/` exit 1.
- Not verified (needs Ricardo's account): a real `wrangler login` / `netlify login`, a real create and a real upload on both providers, the multi-account prompt with a real account list.

### Verification output (last lines)

`npm run lint`
```
> eslint .
(exit 0)
```

`npm run typecheck`
```
> nuxt typecheck
ℹ Nuxt Icon server bundle mode is set to local
ℹ Nuxt Icon client bundle consist of 26 icons with 22.33KB(uncompressed) in size
(exit 0)
```

`npm run generate`
```
[nitro] ✔ Generated public .output/public
[nitro] ✔ You can preview this build using npx serve .output/public
└  ✨ You can now deploy .output/public to any static hosting!
(exit 0)
```

### Review (OCR, single file)

Input: `scripts/publish.mjs`. Date: 2026-09-18. One commit per fix.

0. `main` merged into `wp/8-publish` (`chore: merge main into wp/8-publish`), so the branch has WP7 (personal data out of git). Conflicts: `.gitignore` (union: the "Personal data" block, then `.tilebox/` and `.netlify/` once), `PLAN.md` (status line names WP7 and WP8; WP7 section, then WP8 section), `NOTES.md` (git mixed the two sections; rebuilt as `main` + the `## WP8` section, both checked byte for byte). `package.json` and `README.md` merged without conflict: all scripts from both sides, "Your personal data" and "Publish" both kept. `package-lock.json`: taken from `main`, then `npm install` to re-sync; `npm ci` passes. README and `content/README.md` now say the real site leaves the Mac with `npm run publish` (`deploy` is an alias); Quick start step 3 points at "Publish", not the removed "Deploy" section.
1. `--yes` contract: `askProvider()` and `askName()` never prompt under `--yes`. Exit 2 with `Pass --provider cloudflare|netlify.` / `Pass --name <site-name>.`
2. No `process.exit()` left in the file. The script sets `process.exitCode` and lets Node end, so `Live: <url>` is never lost on a piped stdout. A bad flag sets exit code 2 and skips `main()`. The Netlify HEAD check uses `agent: false`, so no keep-alive socket holds the process open.
3. `--site-url` accepts only `https://` (`HTTPS_URL`). The flag is checked at the start, also with `--no-build`. The build step checks the resolved value again and names the source (`--site-url`, `NUXT_PUBLIC_SITE_URL` or the state file).
4. `loadState()`: a Cloudflare state needs a non-empty string `accountId`, like `siteId` for Netlify. Also checked: JSON object, known `provider`, non-empty `name` and `url`. Message: `.tilebox/publish.json is broken: <why>. Fix the file, or start over with: npm run publish -- --reset`, exit 1.
5. WP7 consistency: new step `Profile` before the build. Same rule as `content/resolve.ts` (path anchored on the script file, not on the working directory): `content/profile.json` exists = `personal`, else `example`. A production publish of the example asks `You are about to publish the sample profile. Continue? [y/N]`. `--yes`: warning, then continue. No terminal and no `--yes`: exit 2. `--preview`: no question. Answer no: exit 1 `stopped. Nothing was uploaded.`

Shim checks, run again after the fixes in `.tilebox-test/` (ignored, deleted after the run; `wrangler` and `netlify` shell shims first on `PATH`). `demo-site.pages.dev` is a real project, so the Cloudflare runs load a test-only `--import` file that makes `dns.promises.resolve4` answer ENOTFOUND. No product code changed for that.

- Cloudflare first run `--provider cloudflare --name demo-site --yes --no-build`: exit 0, state written with `accountId`, `Live: https://demo-site.pages.dev`.
- Second run `--yes --no-build`: calls are `whoami --json` and `pages deploy` only. No create.
- `--yes` without `--provider`: exit 2. `--yes --provider cloudflare` without `--name`: exit 2. `--site-url http://x`: exit 2.
- State with `"accountId": ""` and state `{nope`: exit 1, both with the `--reset` hint.
- `node scripts/publish.mjs --provider cloudflare --name demo-site --yes --no-build | cat` shows the `Live:` line. Same for Netlify with a random name (real HTTPS pre-check, 0.8 s, the process ends by itself).
- `npm run lint`, `npm run typecheck`, `npm run generate` (`profile: content/profile.example.json (example)`), `npx playwright test --project=static` (16 passed): exit 0.
