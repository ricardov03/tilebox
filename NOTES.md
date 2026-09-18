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

### WP7 regression fix (2026-09-18)
Symptom: `/edit` loaded but `GET /api/profile` answered 500 with `ENOENT ./.nuxt/content/profile.example.json`.
Cause: the review fix that anchored `ROOT` in `content/resolve.ts` on `import.meta.url`. The Nitro dev server bundles that module into `.nuxt/`, so `..` was not the repo.
Fix: `ROOT` is now found by walking upward (from the module, then from `process.cwd()`) to the first folder that holds `content/profile.example.json`.
Lesson: a change to the resolver or to `server/` must run the Playwright `dev` project, not only `static`. The `dev` project catches this (4 tests, green again).

### Release pipeline fix (2026-09-18)
Symptom: the first real run of `.github/workflows/release.yml` (tag `v0.1.0`) failed in "Zip dist and write checksum": `sha256sum: tilebox-v0.1.0.zip: No such file or directory`. The tag was on GitHub, but there was no GitHub Release.
Cause: `dist` is a symlink to `.output/public`. The step ran `cd dist && zip -r ../tilebox-TAG.zip . && cd ..`. `zip` opens `../` from the real folder, so the zip went to `.output/`. The shell `cd ..` is logical, so it went back to the workspace, where `sha256sum` found nothing. Reproduced locally with `GITHUB_REF_NAME=v9.9.9`: the zip was in `.output/tilebox-v9.9.9.zip`, the `.sha256` file was empty, exit 1.
Fix in `release.yml`:
- `ZIP="$GITHUB_WORKSPACE/tilebox-${TAG}.zip"; (cd dist && zip -qr "$ZIP" .)`, then `cd "$GITHUB_WORKSPACE"` and `sha256sum`. The step then proves its output: `test -s` on both files and `index.html` must be in the zip.
- The zip check is `unzip -Z1 "$ZIP" > list` + `grep -qx index.html list`, not `unzip -l | grep -q`. Actions runs `bash -e -o pipefail`. `grep -q` exits on the first match, `unzip` gets SIGPIPE, and the step fails with exit 141. Seen locally.
- One env var `TAG` = `inputs.tag || github.ref_name`. No `GITHUB_REF_NAME` left in the steps. A first step checks that `TAG` looks like `v1.2.3` or `v1.2.3-beta.1`. Checkout uses `ref: refs/tags/${{ env.TAG }}`.
- `workflow_dispatch` with the input `tag`: `gh workflow run release.yml -f tag=v0.1.0` runs the pipeline again for an existing tag. A manual run takes `release.yml` from `main` and the code from the tag, so this fix also repairs `v0.1.0`.
- The publish step is safe to run again: `softprops/action-gh-release` v3.0.3 updates an existing release (title, body from `body_path`) and `overwrite_files: true` replaces the two assets (the input exists in `action.yml` at the pinned SHA). `files` names the two files of this tag, not a glob.

New flow in `scripts/release.mjs` (step 6, optional):
- After the commit and the tag, the script asks `Push main and the tag, and create the GitHub Release now? [y/N]`. `--push`: no question. `--no-push`: print the manual commands. No terminal, or `--yes` without `--push`: no push.
- Steps, each logged before it runs: `git push --follow-tags origin main`; `gh` on `PATH` + `gh auth status` (if not: hint with `brew install gh`, `gh auth login` and the manual `gh release create`, exit 0, because the tag push started the pipeline and the pipeline makes the release too); `gh release view` then `gh release edit` or `gh release create ... --verify-tag` (`--prerelease` for a version with `-`); the URL; the watch offer (`--watch`: `gh run list --workflow=release.yml --branch <tag>`, retry up to 30 s, then `gh run watch <id> --exit-status`; on failure it prints `gh run view <id> --log-failed` and exits 1).
- `npm run release:publish -- vX.Y.Z` = `node scripts/release.mjs --publish-only vX.Y.Z`: the same steps for a tag that exists locally, no bump. With `--no-push`: the `gh` steps only. It refuses a tag that does not exist locally. `git push --follow-tags origin main` also pushes a missing tag when `main` is up to date (checked in a scratch repo), so one push command serves both modes.
- The script never uploads a zip. A local `dist/` is built from `content/profile.json` and the personal images. The zip and the checksum come from the pipeline only.
- `--dry-run` prints the publish plan and runs no publish command.
- Commands are found through `PATH` only. No test hook in the product code.

Verified in `.tilebox-test/` (ignored, deleted after the run): a throwaway clone with a local bare repo as `origin`, and a fake `gh` shell script first on `PATH` that logs its argv. GitHub was never reached.
- Dry run: plan printed, `gh` log empty, nothing pushed.
- Create path (with a real push to the bare origin), edit path when the release exists, `--prerelease` for `v9.9.9-beta.1`, `--watch` ok, `--watch` with a failed pipeline (exit 1 + `--log-failed` hint), `--watch` with no run (gives up after 30 s, exit 0), `gh` logged out (exit 0 + hint, no release call), `gh` missing (exit 0 + hint), unknown tag (exit 1, refused), `--push` with `--no-push` (exit 1), `--publish-only` without a value (exit 1, one clear line). 41 checks, 0 failed.
- The `[y/N]` question under a real pty (`script`): `y` watches, `n` does not.
- Full flow in the clone: no terminal and no flags = commit + tag, nothing pushed, manual commands printed. `--push --watch --release-as 9.9.11-rc.1` = push, `gh release create ... --prerelease`, watch.
Not verified without the real GitHub: a real `workflow_dispatch` run, the update of an existing release by the action, and the real `gh release create --verify-tag`.
Lesson: a workflow step that writes a file must check that the file exists, in the same step. And test shell steps locally with `bash -e -o pipefail`.

### Release watch fix (2026-09-18)
Symptom: `npm run release:publish -- v0.1.0`, answer `y` to "Watch the pipeline now?". The script printed `pipeline: FAILED. The release has no zip yet.` and exited 1. But the release was complete: `tilebox-v0.1.0.zip` and `tilebox-v0.1.0.sha256` were on it, from a good `workflow_dispatch` run (35318336115).
Root cause, two defects in `watchPipeline()`:
1. It never looked at the release. "No zip yet" was a guess from the exit code of `gh run watch`.
2. It took the newest run of `gh run list --workflow=release.yml --branch <tag> --limit 1`. That run (35316876510) was the old failed tag-push run, made long before this command. The tag was on GitHub already, so this command pushed nothing and started no run. And `--branch <tag>` cannot see a manual run: GitHub lists a `workflow_dispatch` run with `headBranch: main`.
Fix in `scripts/release.mjs` (`afterRelease()`, same code for `--push` and `--publish-only`):
- Files first: `gh release view <tag> --json assets --jq '[.assets[].name]'`. Both files there and no new tag pushed: `release is complete: ...` + the URL, no watch offer, exit 0.
- "Did this command push the tag?" = `git ls-remote --tags origin refs/tags/<tag>` is empty before the push.
- The run of this command: `startedAt` = now minus 60 s (clock skew), taken before the push. `gh run list --workflow=release.yml --limit 10 --json databaseId,createdAt,event,headBranch,status,conclusion,displayTitle`, parsed in Node. Candidate: `createdAt >= startedAt` and (`event: push` + `headBranch == tag`, or `event: workflow_dispatch`). A push run wins over a dispatch run. Poll up to 45 s after a tag push. One look when nothing was pushed. Never an older run.
- No candidate + files missing: it explains that this command started no run, then offers `gh workflow run release.yml -f tag=<tag>` (`[y/N]`, or `--rerun`). The new run: `workflow_dispatch`, not in the run list seen before the dispatch. No terminal and no `--rerun`: it prints the command, exit 0.
- After `gh run watch <id> --exit-status` it reads the files again. "complete" only with both files. Run ok but files missing: said plainly. Failure: `gh run view <id> --log-failed` + the re-run command. Exit 1 only for a run that this command pushed or started.
- Release complete + an older failed run of the tag: one `note:` line, so the old run is not read as the state.
- `--dry-run`: the plan only, no `gh` and no `git` command.
Verified in `.tilebox-test/` (ignored, deleted after): throwaway clone + local bare origin + fake `gh` first on `PATH` (argv log, canned JSON, switched by env vars). GitHub was never written to. 52 checks, 0 failed: (1) the owner's case: complete + old failed run = no watch question (also under a pty, also with `--watch`), note line, exit 0; (2) files missing + `--rerun --watch` = one dispatch, watches the new run 333, not 111 or 444, exit 0; (3) same, run fails = exit 1, both hints; (4) no terminal, no `--rerun` = prints the command, no dispatch, exit 0 (pty: `y` dispatches one time); (5) new tag + real push to the bare origin = watches the fresh push run 222, not the older run with the same `headBranch`; (6) run ok, files missing = clear message, exit 1; (7) dry run = empty `gh` log, nothing pushed. Plus the full flow (`--release-as 9.9.11 --push --watch`, the npm checks stubbed) in the clone.
Lesson: ask the system for its state (the files on the release), do not infer it from one run. And tie a "watch" to the work of this command with a time stamp, never to "the newest".
## WP9

Branch: `wp/9-profile-extras`. Date: 2026-09-18. Node used: 22.23.1.

Goal (decided by Ricardo): four profile extras. A pulsing status dot, up to 3 highlights, a required email that is private by default, the avatar from the email (Gravatar).

### What was built
- Contract change (`types/profile.ts`, frozen after WP0, so noted here): `profile.highlights` (`z.array(z.string().min(1).max(80)).max(3).default([])`), `profile.email` (`z.email()`, required), `profile.showEmail` (`z.boolean().default(false)`). New: `PublicProfileSchema`, `PublicProfile`, `PublicProfileInfo` (no `showEmail`, `email` optional, `avatar` a plain optional string), `toPublicProfile()` / `toPublicProfileInfo()` (the sanitizer, pure, no file access), `PLACEHOLDER_EMAILS`, `isPlaceholderEmail()`, `HIGHLIGHTS_MAX`, `HIGHLIGHT_MAX_CHARS`.
- A. `ProfileHeader.vue`: the dot has `animate-pulse motion-reduce:animate-none` and was already `aria-hidden="true"`. The global reduced-motion rule in `main.css` covers it too (duration 0.01ms, 1 iteration); the Playwright test reads `animation-name: none` with `reducedMotion: 'reduce'`. `tests/e2e/helpers.ts` `settle()` now skips endless animations: an endless animation's `finished` promise never resolves, so the a11y spec would hang.
- B. Highlights: a real `<ul aria-label="Highlights">` under the bio, above the email and the status. Bullet = 6px `bg-accent` dot, `aria-hidden`. Text `text-ink`, 15px/1.4 from `md`, 14px on phones. Nothing renders for an empty list.
- C. Email privacy. `modules/public-profile.ts` (a local Nuxt module, auto-registered from `modules/`) adds a template `.nuxt/tilebox/public-profile.json` = `toPublicProfile(parsed profile, gravatar path when the file exists)`. `#profile` points at it (`nuxt.config.ts` alias + tsconfig path, and the module sets `nuxt.options.alias` to the template's `dst`). `useProfile.ts` parses it with `PublicProfileSchema`. The raw file never reaches the client bundle. `UI_ICONS.email = line-md:email` (always in the icon bundle).
  - Why a template and not a file written at config time: `nuxt build` clears `.nuxt/` after the config is loaded. Templates are written after that, and `nuxt prepare` / `nuxt typecheck` write them too.
  - Refresh in dev: the module watches the folders `content/` (names `profile.json`, `profile.example.json`) and `public/` (name `avatar.gravatar.jpg`) with `fs.watch`, debounced 50ms, then `updateTemplates()`. The folder, not the file: the save route replaces the file with a rename. Vite then hot-reloads the JSON. A file that does not parse keeps the last good copy. The save route no longer forces `restartNeeded` on the first personal save: the old reason (the alias was bound to the example) is gone.
- D. Gravatar. `content/gravatar.ts` (node built-ins, paths from `ROOT` in `content/resolve.ts`, never from `import.meta.url`: the WP7 lesson) is shared by `scripts/fetch-avatar.ts` (tsx) and `server/api/avatar/gravatar.post.ts` (Nitro, `~~/content/gravatar`). sha256 of the trimmed lower-case email, `https://gravatar.com/avatar/<hash>?s=256&d=404`, 5 s timeout, image content-type, at most 2 MB. 200 -> writes `public/avatar.gravatar.jpg`. 404 -> removes a stale file. Anything else -> keeps the old file. One line each, never a non-zero exit. Skipped (one line) when `profile.avatar` is set or the email is a placeholder. `npm run fetch:avatar`, in `predev` and `pregenerate` right after `check:profile`.
- Migration: `content/migrate.ts` `migrateProfileText()` + `scripts/ensure-profile.ts`. Text in, text out: the missing keys are inserted as new lines after the `"bio"` line in the file's own indent; the result is parsed and compared with the expected object, and only on a mismatch the file is rewritten as 2-space JSON. A file that has the 3 keys is never written.
- `scripts/validate-profile.ts`: warning (not a failure) when a personal file still has a placeholder email.
- `content/profile.example.json`: `email: hello@example.com`, `showEmail: false`, 3 highlights. Tile `b7` was `mailto:hello@example.com`; it is now `https://example.com/contact` (same icon), so the example has no `mailto:` link and the privacy grep can be 0.
- Editor (Profile tab): Highlights (3 inputs, `n/80` counters, the model only gets the non-empty lines), Email (`type=email`, required, inline `role=alert` error from the schema, an invalid value never reaches the draft), "Show my email on the page" + the one-line explanation, "Use my Gravatar" (`POST /api/avatar/gravatar` with the draft's email; on `saved` it clears `profile.avatar`; the message shows inline). `GET /api/avatar/gravatar` tells the preview if the file exists. The preview gets `toPublicProfileInfo(draft.profile, gravatar path)`: the same sanitizer as the build.

### Overflow handling (fixed 2x2 tile: 500px desktop, 358px phone)
Measured with headless Playwright at 1280 and 390. Stress content: a 165-character bio, highlights of 78, 32 and 71 characters, a 38-character email shown, a status.
- First pass (full scale): overflow at both widths. Desktop: the avatar was squashed to 57px and the text ran 29px into the padding. Phone: `scrollHeight` 425 > `clientHeight` 356.
- Reducing gaps and the avatar on the phone was not enough: the worst case needs about 318px of text alone and the phone tile has 310px inside.
- Decision: a **compact scale** whenever the profile has highlights or a visible email. Without them the header is exactly the old one. Compact: avatar 64px desktop / 40px phone, name 56px / 36px, bio 17px / 16px with `line-clamp-3` (the brief's last resort, needed on both widths), gaps 12px / 8px, each highlight `line-clamp-2`, but one line each on phones when there are 3 (the editor says so under the inputs), email and status `truncate`. Avatar `shrink-0`, the tile `overflow-hidden` as a safety net.
- Result, same stress content: 1280: text block bottom 527 = the inner bottom (564 - 1 - 36), avatar 64px intact. 390: `scrollHeight` 356 = `clientHeight` 356.
- Editor preview: its tiles are lower than the real desktop tile (the preview row is `clamp(120px,13vw,240px)`), so `ProfileHeader` has a `small` prop used only by the two preview grids: the compact scale stays at phone sizes there. Without it the bio collapsed to zero height in the preview.
- Not covered: a name that needs 2 lines plus the full worst case. The clamps absorb most of it (the bio shrinks first), the tile clips the rest.

### Deviations and why
- Work was done in a separate git worktree (`/private/tmp/tilebox-wp9/wt`), not in the main checkout: Ricardo had `nuxt dev` open on the main checkout and was editing his real `content/profile.json`. The `dev` Playwright project and the migration checks back up and restore that file, which would have raced with his saves. The main checkout was put back on `main`, untouched.
- `playwright.config.ts`: `E2E_STATIC_PORT` / `E2E_DEV_PORT` (defaults unchanged). Port 4173 was held by an older `npx serve dist` of the main checkout, and Playwright reuses an existing server locally, so the first static run tested the wrong `dist/`.
- The example tile `b7` lost its `mailto:` URL (see above).
- `PublicProfile` drops `showEmail` (an email in the public profile already means "show it").
- In a full `npx playwright test` run the `dev` web server starts first and its `predev` creates `content/profile.json`, so the "example email" privacy test skips itself (`dist/` vs resolver mismatch guard) and the generic "hidden email" test covers the same string. `--project=static` alone (CI) runs all of them.
- A known dev-only delay: after a save that hides the email, the dev server serves the old sanitized copy for a moment (watcher + HMR, 1 to 3 s). The editor test polls. A production build always starts from a fresh template.

### Verified
- Migration, old example shape (`git show main:content/profile.example.json`): one line printed, diff = only the 3 new lines after `bio`, compact one-line blocks untouched, trailing newline kept. Second run: no output, file untouched. Same on a 2-space pretty file and on a copy of a real personal file (with `avatar` set: `avatar: profile.avatar is set, gravatar skipped`).
- Dev refresh: `POST /api/save` with a new bio and `showEmail: true` -> `restartNeeded: false`, the SSR HTML and an already open page show the new bio and the `mailto:` link without a restart or a manual reload. `showEmail: false` again -> the address is gone from the HTML and from `.nuxt/tilebox/public-profile.json`.
- Gravatar: a random address -> `avatar: no gravatar for this email` and a stale file is removed. The URL form answers 200 `image/png` for the hash in Gravatar's own docs (so the format is not fixed; the `.jpg` name is kept, browsers read the bytes). No real personal email was sent anywhere.
- `git check-ignore -v public/avatar.gravatar.jpg` -> `.gitignore:19:public/avatar.*`.

### Verification output (last lines)
```
$ npm run lint            -> exit 0
$ npm run typecheck       -> exit 0
$ npm run generate        -> exit 0
profile: content/profile.example.json (example)
avatar: placeholder email, gravatar skipped
OK  26 icons found in installed Iconify packs
Prerendered 4 routes
$ grep -r "hello@example.com" dist/ | wc -l
0
$ E2E_STATIC_PORT=4188 npx playwright test --project=static
28 passed
$ E2E_STATIC_PORT=4188 E2E_DEV_PORT=3144 npx playwright test      (both projects)
35 passed, 1 skipped
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks < /dev/null
would commit "chore(release): v0.1.1" and tag v0.1.1
working tree: still clean
```

### Feature E: visible delete

Branch: `wp/9e-delete-block` (from `wp/9-profile-extras`). Date: 2026-09-18. Asked by Ricardo: "Removing a block must be easy to find". Before, delete was one small text button at the top of `BlockForm.vue`, visible only after a block was selected.

- One action, one confirm. `useEditor.ts`: `deleteTarget` (`{ id, where: 'list' | 'tile' | 'form' }`, one at a time), `requestDelete`, `cancelDelete`, `deleteBlock` (the same action as before, now also keeps what Undo needs), `undoDelete`, `notice`, `canUndo`, `UNDO_MS = 8000`. `app/components/editor/DeleteConfirm.vue` is the only confirm: `role="group"` named `Delete <label>?`, text "Delete?", buttons "Yes" (`bg-pop`) and "No". Focus goes to "No" on mount. Escape or "No" cancels. No `window.confirm`.
- 1. `BlockList.vue`: each row ends with an icon-only button (`aria-label="Delete <label>"`, 44px, `text-muted`, `hover:text-pop`). A click swaps the arrows and the button for the confirm. After a cancel the focus goes back to the delete button (`nextTick`, the button is re-created). After a delete `edit.vue` focuses the next row's select button (the last row when the deleted one was last), or `[data-add-block]` when the list is empty.
- 2. `PreviewTile.vue`: a third control between Edit and the grip. Visible on hover, `focus-within`, when selected, and always with `@media (hover: none)` (the whole control group, so touch users also get Edit and the grip). The confirm is a small overlay at the top of the tile; on tiles it is stacked (question on line 1, buttons on line 2) because a 1x1 preview tile is about 150px wide inside. The button and the overlay carry `data-editor-control` (the capture click handler in `edit.vue` leaves them alone, so no select) and `data-no-drag`; both grids pass `filter="[data-no-drag]"` + `:prevent-on-filter="false"` to Sortable. The button also has `@click.stop`.
- 3. Keys (`edit.vue`, in the same dev-only `keydown` handler as Cmd/Ctrl+S): `Delete` or `Backspace` with a selected block, no modifier, no open confirm, and the target not inside `input, textarea, select, [contenteditable]` opens the confirm on the tile (`where: 'tile'`). It never deletes directly. Escape with the focus outside the confirm also cancels.
- 4. `BlockForm.vue`: the top button is gone. The last control is a full-width secondary "Delete this block" under a rule. Same confirm, in place.
- 5. Undo: `deleteBlock` stores the block, its index in `blocks`, in `layout.desktop` and in `layout.mobile`, and if it was selected. The save bar shows "Block deleted." in an always-present `aria-live="polite"` span plus an Undo button next to it (outside the live region). It goes away after 8 s or on the next draft change (a watcher compares the draft text with the text right after the delete; selecting a block is not a change). `undoDelete` puts the block back at the 3 old indexes (clamped), restores the selection, and the region says "Block restored.". Delete then Undo leaves the draft equal to the saved file, so Save is disabled again. Memory only: a reload, and the page remount after a save (WP3 deviation 2), forget it.
- Icon: `line-md:trash` (exists in `@iconify-json/line-md`; `line-md:remove` and `line-md:close` also exist, the trash reads best). Added as `UI_ICONS.trash`, so `check:icons` checks it and `nuxt.config.ts` puts it in the client bundle (27 icons now).
- Tests (`tests/e2e/editor.spec.ts`, dev project, same backup and restore): "No" and Escape keep the block and return the focus; Delete on a selected tile opens the confirm, Backspace and Delete inside a field do not; the tile button deletes without selecting; Undo restores the order in desktop and mobile and Save is disabled again; the next change ends the Undo offer; delete from the list row + save removes the id from `blocks`, `layout.desktop` and `layout.mobile`; focus lands on the next row. The test reads the block's name from the row's `aria-label`: importing `useEditor.ts` into the spec puts it under the node tsconfig (no Nuxt auto-imports) and `nuxt typecheck` fails. There is no axe check in the dev project and none was added.
- Not done: no 8-second expiry test (it would add 8 s to the run; the timer is one `setTimeout`). `line-md` icons draw themselves in, so the trash animates once when a row is re-created after a cancel.

Verification (last lines):
```
$ npm run lint            -> exit 0
$ npm run typecheck       -> exit 0
$ npm run check:icons     -> OK  27 icons found in installed Iconify packs
$ npm run generate        -> exit 0
$ E2E_STATIC_PORT=4391 E2E_DEV_PORT=3391 npx playwright test      (both projects)
38 passed, 1 skipped      (the skip is the known "example email" guard, see WP9 deviations)
```

### Review (OCR, range)
Range: the WP9 branch against `main`. Fixes, one commit each:
1. `content/gravatar.ts`: `fetchGravatar(email, { allowDelete })`. The caller says who it is. `scripts/fetch-avatar.ts` passes `true` (the SAVED email: a 404 removes a stale `public/avatar.gravatar.jpg`). `POST /api/avatar/gravatar` runs with the editor's UNSAVED draft email. It passes `true` only when the draft email equals the email in the saved profile file (`readProfileFile()` in `server/utils/editor.ts`, trimmed, lower case). A read or parse problem = `false`. A try with another email can never delete the picture of the saved profile.
2. `content/gravatar.ts`: atomic write. `writeAtomic()` writes `${file}.tmp`, then `rename` over the target. The tmp file is removed on failure. `git check-ignore -v public/avatar.gravatar.jpg.tmp` answers with the rule `public/avatar.*` (`.gitignore` line 19).
3. `content/gravatar.ts`: raster types only, `/^image\/(jpeg|png|webp)(;|$)/i`. Any other type (for example `image/svg+xml`) = no usable picture: status `offline`, the old file stays.
4. `app/components/editor/GravatarButton.vue` + `app/pages/edit.vue`: the POST answer is typed `{ status, exists }`. The button emits `resolved: [exists: boolean]` on EVERY answer, then `saved` when the status is `saved`. `edit.vue` sets `gravatar.value` from `resolved`, so the preview never points at a deleted file.
5. `app/pages/edit.vue`: no literal `/avatar.gravatar.jpg`. `GRAVATAR_PUBLIC_PATH` moved to `types/profile.ts` (client-safe). `content/gravatar.ts` imports Node built-ins, so the page cannot import from it. `content/gravatar.ts` imports the constant, exports it again, and builds `GRAVATAR_FILE` from it.
6. `playwright.config.ts`: `Number(process.env.E2E_STATIC_PORT) || 4173` and `Number(process.env.E2E_DEV_PORT) || 3111`. An empty or non-numeric value gives the default, not port 0 or `NaN`.

Tests: new `tests/e2e/gravatar.spec.ts` (static project, no browser, no network). `globalThis.fetch` is a stub. The file lives in a temp folder through the new optional `targetFile` option of `fetchGravatar`. Cases: 404 + `allowDelete: false` keeps the file; 404 + `allowDelete: true` removes it; `image/svg+xml` is rejected and the file stays; a JPEG is written and no `.tmp` is left; a failed write leaves no `.tmp` and answers `offline`.

Not reviewed: part of the review timed out on the provider side. Groups without a result: (a) `ProfileHeader` / `BentoGrid` / `useProfile` / types, (b) the `public-profile` module / `nuxt.config.ts` / `content/migrate.ts`. `tests/e2e/privacy.spec.ts` covers the sanitizer (`toPublicProfile`) and the built `dist/` for those groups.

Verification (last lines):
```
$ npm run lint            -> exit 0
$ npm run typecheck       -> exit 0
$ npm run generate        -> exit 0   (profile: content/profile.example.json (example))
$ grep -r "hello@example.com" dist | wc -l      -> 0
$ E2E_STATIC_PORT=4392 E2E_DEV_PORT=3392 npx playwright test      (both projects)
43 passed, 1 skipped      (38 + the 5 new gravatar tests; the skip is the known "example email" guard)
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks      -> exit 0
```

## WP10a

Branch: `wp/10a-smart-links` (from `origin/main`). Date: 2026-09-18. Node used: 22.23.1. Worked in a separate git worktree; the main checkout was not touched. Runs in parallel with WP10b (`site` object + "Site" tab): this WP adds no site-level metadata, and its edits in `types/profile.ts` and `edit.vue` are small and local (edit.vue: 5 event lines).

Goal (decided by Ricardo): smart links (brand icon from the URL, link previews fetched on the owner's machine) and three quick wins (hide, duplicate, spotlight).

### What was built
- Contract change (`types/profile.ts`, frozen after WP0, so noted here). Every block type: `hidden?: boolean`. Link blocks: `enrich?`, `showImage?`, `favicon?` (regex: `/icons/<a-z0-9>.<png|jpg|webp|gif|svg>` only), `image?` (`/thumbs/<a-z0-9>.webp` only), `imageAlt?`, `meta?` (`LinkMetaSchema`, strict), `spotlight?: 'pop' | 'wobble' | 'buzz'`. `superRefine`: a second spotlight is an issue at `blocks.<i>.spotlight`. New exports: `SPOTLIGHTS`, `Spotlight`, `LinkMetaSchema`, `LinkMeta`, `toPublicBlock()`. `toPublicProfile()` now removes hidden blocks and their ids from both layouts, and drops `enrich` and `meta` always, `image` / `imageAlt` when `showImage` is off. Old profiles stay valid (all keys optional).
- A. `app/utils/brand-icons.ts`: `BRAND_ICONS` (65 hosts -> 48 icons, 16 from `line-md`, 32 from `simple-icons`, plus `line-md:email` for `mailto:` and `line-md:phone` for `tel:`), `brandIconFor(url)`, `allBrandIcons()`. Pure, no imports. Every name was checked against `node_modules/@iconify-json/<prefix>/icons.json`. `scripts/check-icons.ts` now also checks the map and fails on `hidden: true` (63 icons checked).
- Icon resolution: `resolveLinkIcon()` in `app/components/blocks/media.ts`: `icon` > brand > `favicon` (only a local `/icons/` path) > `line-md:link`. `LinkBlock.vue` uses it. `isSafeHref()` now accepts `tel:` (the brand map has a phone icon, so a `tel:` tile must be a real link).
- Bundle list (`nuxt.config.ts`): `iconsIn(profile)` adds `brandIconFor(block.url)` for each visible link block without `icon`. Hidden blocks add nothing. So the built site has only the brands its profile uses (the example build: 33 icons, 27.61 KB, the whole map is not in it). `$development.icon.clientBundle.icons` adds the whole map + the icons of hidden blocks for `nuxt dev` only. Measured: `nuxt dev` 65 icons, 57.62 KB; the build 33 icons, 27.61 KB.
- B. Engine: `content/unfurl.ts` (network, htmlparser2, ipaddr.js, undici, sharp by dynamic import) and `content/unfurl-cache.ts` (node built-ins only: dirs from `ROOT`, `normalizeUrl`, cache file, `localFileExists`, `linkNeedsFetch`, `withLocalLinkFiles`). Split on purpose: `modules/public-profile.ts` loads the cache half at config time and must not pull the network half. Exports used by the tests: `safeRequest`, `checkTarget`, `isPublicAddress`, `parseHead`, `decodeHtml`, `sniffImage`, `largestPngFromIco`, `pickBySize`, `oembedUrlFor`, `githubAvatarFor`, `USER_AGENT`.
- Dev route `server/api/unfurl.post.ts`: `import.meta.dev ? await import('~~/content/unfurl') : null`, so the production server bundle has no engine (checked with `npx nuxt build`: no `tilebox-unfurl` / `htmlparser2` string in `.output/server`, no `sharp` / `undici` in its `node_modules`). Host check, Origin check, a per-target-host promise queue, zod body.
- Build: `scripts/fetch-links.ts` (git mv from `fetch-favicons.ts`). npm scripts: `fetch:links`, `fetch:favicons` = `npm run fetch:links --` (alias), `pregenerate` ends with `fetch:links`. Debug mode: `-- --url <link> [--image] [--force]`.
- `modules/public-profile.ts`: `toPublicProfile(withLocalLinkFiles(profile), gravatar)`.
- Editor: `LinkEnrich.vue` (two switches, the one-line note, preview card, Refresh = `force`, reason text, "Use fetched title / description", 600 ms debounce, AbortController + request id against stale answers), `LinkIconField.vue` ("auto" label, "Choose another", "Back to auto"), Spotlight select + live sample in `BlockForm.vue`, Hide / Show + Duplicate buttons in `BlockForm.vue` and as a second line under each `BlockList.vue` row, Hide / Show control + "Hidden" badge + dimming in `PreviewTile.vue`. `useEditor.ts`: `toggleHidden`, `duplicateBlock`, `copyOf`, `NEW_LINK_TITLE`, new links get `enrich: true`, `updateBlock` moves the spotlight. UI icons: `line-md:watch`, `line-md:watch-off`, `line-md:text-box-multiple`.
- Example: `b10` (github.com link without `icon`, `spotlight: pop`) and `b11` (hidden link "Hidden draft tile"). No `enrich` and no image in the example, so CI makes no link request (`OK  link previews 0/0`).

### SSRF guard (one function for every request: page, oEmbed, manifest, icon, image)
`safeRequest()` -> `checkTarget()` per hop: http/https only; port `''`, 80 or 443; `dns.lookup(host, { all: true })`; EVERY answer must have `ipaddr.parse(ip).range() === 'unicast'` (so loopback, private, linkLocal, carrierGradeNat, uniqueLocal, ipv4Mapped, 6to4, teredo, reserved... are refused, and one bad answer among good ones refuses the host); an IP literal is checked the same way without DNS; the first checked address is pinned with `new Agent({ connect: { lookup } })` (handles `options.all`), one Agent per hop, destroyed after the body; `redirect: 'manual'`, 5 redirects, `Location` resolved against the current URL; `AbortSignal.timeout(8000)` per hop; body read as a stream with a byte limit (`cut` for HTML at 512 KB or at `</head>` / `<body`, `fail` for JSON 256 KB, icons 1 MB, images 5 MB). `allowHosts`, `lookup`, `transport`, `dirs`, `now` are test-only options.

### Deviations and why
1. **No favicon download when the URL has a brand icon (or the owner's `icon`).** The brand icon wins on the tile, so the file would never show. It saves 1 to 6 requests per link. `linkNeedsFetch()` follows the same rule. Smoke results below: GitHub and YouTube have no `favicon`, nuxt.com has one.
2. **The `#manifest/icons` alias and `public/icons/manifest.json` are gone** (the brief allowed it). Link files are block fields. `#manifest/thumbs` stays for video tiles. Removed in `nuxt.config.ts`, `LinkBlock.vue`, `media.ts` (`faviconPath`), `empty-manifest.ts` docs, README, PLAN. Effect for old profiles: a link without `enrich` no longer gets a Google favicon at build; it gets the brand icon or `line-md:link`. That is the owner's rule ("with `enrich` off the tile uses only what the owner typed").
3. **The build never writes `profile.json`.** A path in the block counts only when its file is on disk; else the path from `.tilebox/unfurl-cache.json` is used; else the key is dropped. So a profile written by hand with only `"enrich": true` works, a fresh machine works, and the page never points at a 404.
4. **SVG icons: a small extra check.** Besides "< 100 KB, `<img>` only", an SVG with `<script`, `<foreignObject`, an `on*=` attribute or `javascript:` is refused (the next candidate is tried). Reason: the file is served from the site's own origin, and someone can open it directly.
5. **A site that blocks the request but has a brand icon answers `ok: true, source: 'brand'`** with a `note` ("The website gave no data (http 403). The brand icon still works."). It is not cached. Without a brand icon the answer is `{ ok: false, reason }`.
6. **`force` still sends `If-None-Match`** when the cached entry is complete. A `304` means "nothing changed", so the data is kept and `fetchedAt` moves.
7. **`nuxt dev` bundles the whole brand map** (`$development`). The brief said "only when used by the current profile": that holds for the built site. In dev the editor must show the icon of a URL pasted a second ago, without a restart.
8. **The tile's Hide control has no `aria-pressed`.** `[data-editor-control][aria-pressed]` is how `edit.vue` and the tests find the Edit control. Its name says the action ("Hide x" / "Show x"). The list row toggle and the form toggle have `aria-pressed`.
9. **List rows have a second line** (Hide / Show, Duplicate). Five 44 px buttons do not fit next to the title in the 400 px panel.
10. **Existing test fixed (`Delete on a selected tile...`).** It failed on `origin/main` too on this Mac (checked in a throwaway worktree): the Home and End keys do not move the caret in Chromium on macOS, so Backspace deleted the last letter and the expected label was wrong. The test now sets the caret with `setSelectionRange` and asserts the value did not change. Same intent.
11. **Every editor test mocks `POST /api/unfurl`** (`openEditor` answers `{ ok: false }`), because new link blocks have `enrich: true` and the first, older test fills a real URL. No test reads a real website.
12. The PLAN.md status line was not edited (WP10b edits the same line). Text for the architect: "WP10a smart links + quick wins on `wp/10a-smart-links`."

### Requests to other WPs
- WP10b / architect: on merge, `types/profile.ts` (WP10a touches the block schemas, `superRefine` and `toPublicProfile`), `edit.vue` (5 added event lines on existing components), `nuxt.config.ts` (`iconsIn`, `$development`, the removed `#manifest/icons` alias) and `README.md` may need a manual merge. `toPublicProfile()` builds a new `layout` object now: a `site` key must be passed through there.
- A Grok / OCR review of `content/unfurl.ts` is worth the cost: it is the only code in the repo that fetches URLs chosen by user input.

### Verified by hand
- Featured look on real files (nuxt.com, `--image`): 2x1 (image on the right third), 2x2 and 1x2 (image on top), 1x1 (no image), accent variant, 1280 and 390, screenshots checked. Hidden tile absent on the public page, dimmed with a badge in the editor.
- Real route in `nuxt dev`: `POST /api/unfurl` with nuxt.com -> `ok: true`; with `Origin: https://evil.example` -> 403; with `Host: evil.example` -> 403; `http://127.0.0.1:3401/api/profile` -> `blocked port`; `http://localhost/` -> `blocked address`. The engine loads inside Nitro dev (the WP7 lesson: paths from `ROOT`).

### Smoke test (real network, from the command line, files removed afterwards)
```
$ npx tsx scripts/fetch-links.ts --url https://github.com/nuxt --image
{ "ok": true, "cached": false, "url": "https://github.com/nuxt", "finalUrl": "https://github.com/nuxt", "title": "Nuxt",
  "description": "The Intuitive Vue Framework. Nuxt has 65 repositories available. Follow their code on GitHub.",
  "siteName": "GitHub", "themeColor": "#1e2327", "source": "html", "image": "/thumbs/40da6c047f241180.webp" }
$ npx tsx scripts/fetch-links.ts --url "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --image
{ "ok": true, "cached": false, "title": "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
  "description": "By Rick Astley", "siteName": "YouTube", "source": "oembed", "image": "/thumbs/24ca0ed0e641e75c.webp" }
$ npx tsx scripts/fetch-links.ts --url https://nuxt.com --image
{ "ok": true, "cached": false, "url": "https://nuxt.com/", "title": "Nuxt: The Full-Stack Vue Framework",
  "description": "Build fast, production-ready web apps with Vue. File-based routing, auto-imports, and server-side rendering — all configured out of the box.",
  "siteName": "Nuxt", "themeColor": "#020420", "favicon": "/icons/fb6ffcbd70de0858.png", "source": "html", "image": "/thumbs/3da768251b881db0.webp" }
```
GitHub: the image is the 200 px avatar shortcut. YouTube: oEmbed, the page was never loaded. No `favicon` on the first two: deviation 1.

### Tests
- `static` project: 33 -> 81. New files: `links.spec.ts` (17: brand map against the packs, icon order, featured look rule, schema, local files for the build), `unfurl.spec.ts` (24: pure helpers, the guard without `allowHosts`, a local `node:http` server with `allowHosts: ['127.0.0.1']`, a mocked connection for oEmbed and the brand answer; `lookup` throws in the server tests, so no fallback can reach the internet). `privacy.spec.ts` +3 (hidden block in no file of `dist/`, sanitizer: hidden blocks and layouts, editor-only link fields). `public.spec.ts` +4 (brand icon as inline SVG with no `<img>`, hidden block absent, spotlight `animation-name` / `infinite` / `6s` with an unchanged layout box, `animation-name: none` with reduced motion). axe: 0 violations, 4 runs.
- `dev` project: 11 -> 16 (link preview with a mocked route, failed fetch + preview off, Hide / Show + the public page follows, Duplicate in both layouts, one spotlight).

### Verification output (last lines)
```
$ npm run lint            -> exit 0
$ npm run typecheck       -> exit 0
$ npm run generate        -> exit 0
profile: content/profile.example.json (example)
OK  63 icons found in installed Iconify packs
OK  link previews 0/0, thumbnails 1/1
Nuxt Icon client bundle consist of 33 icons with 27.61KB(uncompressed) in size
Prerendered 4 routes
$ grep -r "hello@example.com" dist | wc -l      -> 0
$ grep -rl "Hidden draft tile" dist | wc -l     -> 0
$ npx nuxt build && grep -rl "tilebox-unfurl\|htmlparser2" .output/server      -> no file
$ npm run check:icons     -> OK  63 icons found in installed Iconify packs
$ E2E_STATIC_PORT=4401 E2E_DEV_PORT=3401 npx playwright test --project=static
81 passed
$ E2E_STATIC_PORT=4401 E2E_DEV_PORT=3401 npx playwright test      (both projects)
96 passed, 1 skipped      (the skip is the known "example email" guard, see WP9 deviations)
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks < /dev/null      -> exit 0
```

### Open
- Code review (Grok / OCR) not run yet.
- Safari and Firefox: the featured look and the spotlight were checked in headless Chromium only.
- The preview card shows no color from `themeColor` yet. The value is stored in `meta`.
- A very long description on a featured 2x1 tile on phones is clamped to 2 lines; the editor preview (lower rows) clips a little more than the real page.

## WP10b

Branch: `wp/10b-site-meta` (from `origin/main`). Date: 2026-09-18. Node used: 22.23.1. Work was done in a separate git worktree; the main checkout was not touched. WP10a (link blocks) runs in parallel on `wp/10a-smart-links`.

Goal (asked by Ricardo): "a section in the editor for the basic metadata: OG, favicon and metadata". Decision: the social image is generated from the profile at build time, and an optional upload wins.

### What was built
- A. Schema. New file `types/site.ts` (its own file, so the merge with WP10a's edits of `types/profile.ts` stays small): `SiteSchema` (zod strict, every key optional), `SiteAssetsSchema`, `PublicSiteSchema`, `toPublicSite()`, `isSiteUrl()`, the limits. `types/profile.ts` (frozen contract, so noted here): `site: SiteSchema.optional()` in `ProfileSchema`, `site: PublicSiteSchema.optional()` in `PublicProfileSchema`, and `toPublicProfile(profile, gravatarPath?, siteExtras?)`. The public `site` has no `favicon` / `ogImage` upload paths; it gets `assets` (the generated files that exist) and `builtAt`. No migration: an old profile is valid. `lang` and `noindex` have NO zod default (a default would write `lang: "en"` into every saved file); the defaults are applied when the head is built. `content/profile.example.json` has a small `site` (lang, jobTitle, location, no URL).
- B. Site URL precedence: `NUXT_PUBLIC_SITE_URL` > `site.url` > '' (`resolveSiteUrl()` in `app/utils/site-head.ts`). Unknown = no canonical, no `og:url`, relative `og:image`. The asset script uses the same function for the host line of the card.
- C + D. `content/site-assets.ts` `buildSiteAssets()` (shared by `scripts/build-site-assets.ts` through tsx and by `POST /api/site/assets` through Nitro; every path from `ROOT`, the WP7 lesson) and `content/site-files.ts` (node built-ins only: names, paths, `siteAssetsIfPresent()`; `modules/public-profile.ts` loads it at config time without loading sharp). Output `public/site/`: `favicon.ico`, `icon.svg` (initials or SVG upload only; removed when the source changes to a raster), `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-mask.png`, `manifest.webmanifest`, `og.png`.
  - Favicon source: `site.favicon` > avatar (`profile.avatar`, else `public/avatar.gravatar.jpg`; cover 512, circle mask with `dest-in`) > initials. Each source is tried in a `try`; a failure adds one line to `messages` and the next source runs. A remote `profile.avatar` (http URL) is skipped: no network in this script.
  - Initials tile: satori renders the letters with Geist SemiBold and returns SVG outlines (`<path d>`). The script lifts the path data and writes its own SVG: a rounded `rect` (rx 22%) in `accent`, the glyphs in `accent-soft`, and for `icon.svg` a `<style>` with a `prefers-color-scheme: dark` block (the preset's dark values). Outlines, so no renderer needs the font. The PNG master uses inline fills (librsvg ignores media queries anyway).
  - Apple icon and maskable icon: for initials, a full-bleed square (the system cuts the corners), with smaller letters inside the 80% safe zone for the maskable one. For an avatar or an upload: the art on the preset's light `ground`, at 70% (circle) or 56% (square) for the maskable icon. Both files have no alpha channel. sharp gotcha: inside one pipeline `flatten()` / `removeAlpha()` run BEFORE `composite()`, so the composite is written to a buffer first.
  - ICO: written by hand, `icoFromPng()`: ICONDIR 6 bytes + one ICONDIRENTRY 16 bytes (32x32, 1 plane, 32 bpp, size, offset 22) + the PNG bytes.
  - `og.png`: upload -> `resize(1200, 630, cover)`; when the PNG is over 1 MB it is written again with a 256-color palette. Generated -> satori element tree of plain objects (no React, no JSX), `sharp(svg).png()`. Layout: ground background, a large rounded tile, avatar circle (embedded as a data URI) or initials circle, name (SemiBold 76, `lineClamp: 2`), bio (`lineClamp: 3`), an accent bar, `@handle · host`. Example result: 37 550 bytes.
  - The card ALWAYS uses Geist and the LIGHT colors. "Mono" line: only Geist Regular and SemiBold ship (as asked), so the line is Geist with wide tracking, not Geist Mono.
- E. `app/utils/site-head.ts`: pure `buildHead(publicProfile, envSiteUrl)` -> `{ htmlAttrs, title, meta, link, script }`, plus `resolveSiteUrl`, `siteTitle`, `siteDescription`, `splitName`, `initialsOf`, `ogLocale`, `sameAsOf`, `buildJsonLd`, `jsonForScript` (`<` becomes `\u003c`). `app/composables/useSiteHead.ts` hands it to `useHead`. `app/pages/index.vue` calls it. Favicon links: ico (32), `icon.svg` when it exists, `icon-192.png`, apple-touch-icon = 4 for the example, plus the manifest. `og:locale` comes from `lang` (`pt-BR` -> `pt_BR`, `en` -> `en_US`, unknown language without a region -> no tag). `sameAs` = the http(s) URLs of the social blocks of the PUBLIC profile (a `mailto:` social tile is left out; a block with `hidden: true` is left out too, ready for WP10a). `dateModified` = `builtAt`, one ISO date per config load, written into the public profile, so the server HTML and the client agree. `Tile.vue` has a `rel` prop; `SocialBlock.vue` passes `rel="me"` -> `rel="me noopener noreferrer"`.
- F. Editor. `app/components/editor/SitePanel.vue` + the 4th tab in `edit.vue` (same ARIA model: the `tabs` array drives arrows, Home, End). Text fields keep what you type; the draft only gets a value the schema accepts (URL, lang, X handle show an inline `role="alert"`). An emptied field removes its key; no keys left removes `site`. Counters `n/70` and `n/160`. Favicon block: source label, 32 and 180 previews, upload, Remove upload. Social image block: preview with `?v=<version>`, Regenerate, upload, remove. Search result and social card previews from the draft. Routes: `POST /api/site/upload?kind=favicon|og` -> `public/site-uploads/<kind>-<6 hex>.<ext>`; `POST /api/site/assets` with the DRAFT profile -> `buildSiteAssets()` -> `{ files, faviconSource, ogSource, messages, version }`. Both start with the inline `if (!import.meta.dev) throw createError({ statusCode: 404 })`, and the builder is a dynamic import behind it, so a production build drops the branch. `nuxt generate` keeps no `.output/server` at all, and its log never names `sharp` or `satori`.
- G. `.gitignore` "Personal data": `public/site/`, `public/site-uploads/`. `tests/e2e/repo.spec.ts` asserts both with `git check-ignore`. `scripts/release.mjs` preflight lists the two folders too. CI builds the sample: `site: favicon from initials, social image generated (8 files in public/site/)`.

### Font source, license, checksums
- Source: the official `geist` npm package by Vercel, version 1.7.2, `https://registry.npmjs.org/geist/-/geist-1.7.2.tgz` (sha256 `88cbfaca51646078f3172802643691bb8fe2df15ca4c455b1b101e49b7d469a6`). Files `package/dist/fonts/geist-sans/Geist-Regular.ttf` and `Geist-SemiBold.ttf` (static instances; satori reads them as they are), and `package/LICENSE.txt` copied as `assets/fonts/OFL.txt`.
- License: SIL Open Font License 1.1, Copyright (c) 2023 Vercel, in collaboration with basement.studio.
- sha256: `Geist-Regular.ttf` `5c8968eafb98a4c4f47033daf29e38e284a6f2a82eb017d171ab040fe7c4b615` (126 048 bytes), `Geist-SemiBold.ttf` `612ec98df33935354f39e81e54101656961ab6e5549f64b63eb57868ba7bab8d` (127 872 bytes), `OFL.txt` `930853ee1daa68554d9e35c8a9175affb74f699fad9a5da6ee5ebe76379d9137`.
- New dev dependencies: `sharp` 0.35.4 (was in the tree through wrangler), `satori` 0.33.4.

### Deviations and why
- `public/site/` has no `.gitkeep`: the script creates the folder, nothing watches it, and a `.gitkeep` would land in `dist/site/`.
- `public/site/` is NOT watched by `modules/public-profile.ts`. A refresh of `#profile` remounts the app (the known save behavior), and "Regenerate" with an unsaved draft would lose the draft. Which files exist is read at config time and on the next profile change. The file names are stable, so this only matters when `icon.svg` appears or goes away: restart `npm run dev`.
- "Remove upload" clears the field. The file stays in `public/site-uploads/` (ignored). No delete route.
- Upload and Remove run "Regenerate" right away with the draft, so the previews show the result. It writes `public/site/` before a save; `predev` and every build write it again from the saved profile.
- The default title is now `Name (@handle)`. `tests/e2e/public.spec.ts` (WP5's file) had `toHaveTitle(name)`: one line changed to `siteTitle(...)`.
- `buildHead()` returns plain `string` names. unhead types every meta name as a literal union, so `useSiteHead` has one cast: `head as Parameters<typeof useHead>[0]`. No `any`.
- The editor preview of the host shows `site.url` only: the client does not know `NUXT_PUBLIC_SITE_URL`.
- PLAN.md status line not edited (WP10a edits it too); section 6 and section 8 are.

### Requests to other WPs
- WP1 (`useTheme.ts`), older than this WP: after hydration the DOM has the two `theme-color` metas twice. unhead's dedupe key for a meta with a `key` is `meta:theme-color:key:<key>`, the server HTML has no key, so the client appends a second identical pair. Harmless (same values). Checked by building with `useSiteHead()` commented out: same 4 tags. `site.spec.ts` therefore counts them in the raw HTML (2). Fix idea: drop the `key`s and let unhead match by `name` + `media`, then test the toggle again.
- WP10a: `sameAsOf()` already skips a social block with `hidden: true`. If hidden blocks are removed in `toPublicProfile()` instead, nothing changes here.

### Verified
- `public/site/og.png` looked at by eye (example): ground, tile, initials circle, name, 2-line bio, accent bar, `@ricardov03`. `icon-mask.png`: full-bleed accent, letters inside the safe zone. Site tab looked at in a screenshot at 1400 px.
- `git check-ignore -v public/site/og.png public/site-uploads/x.png` -> the two new rules.
- `npm run generate`: the log has 0 lines with `sharp` or `satori`, and `.output/` holds `public/` and `nitro.json` only.

### Verification output (last lines)
```
$ npm run lint            -> exit 0
$ npm run typecheck       -> exit 0
$ npm run generate        -> exit 0
profile: content/profile.example.json (example)
avatar: placeholder email, gravatar skipped
site: favicon from initials, social image generated (8 files in public/site/)
OK  27 icons found in installed Iconify packs
Prerendered 4 routes
$ ls dist/site
apple-touch-icon.png favicon.ico icon-192.png icon-512.png icon-mask.png icon.svg manifest.webmanifest og.png
$ grep -r "hello@example.com" dist | wc -l
0
$ E2E_STATIC_PORT=4402 E2E_DEV_PORT=3402 npx playwright test --project=static
60 passed      (26 new in site.spec.ts, 1 new in repo.spec.ts)
$ E2E_STATIC_PORT=4402 E2E_DEV_PORT=3402 npx playwright test      (both projects)
75 passed, 1 skipped      (dev: 16, 5 new in site-editor.spec.ts; the skip is the known "example email" guard)
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks < /dev/null      -> exit 0
personal data: not tracked
would commit "chore(release): v0.1.1" and tag v0.1.1
working tree: still clean
$ sharp metadata of public/site/*
og.png 1200x630 png 37550 bytes
apple-touch-icon.png 180x180 png 5221 bytes
icon-192.png 192x192 png 7997 bytes
icon-512.png 512x512 png 16092 bytes
icon-mask.png 512x512 png 9023 bytes
```

## WP10 integration

Branch: `wp/10-final` = `origin/wp/10a-smart-links` + merge of `origin/wp/10b-site-meta`. Date: 2026-09-18. Node used: 22.23.1. Work was done in a separate git worktree; the main checkout was not touched. Not merged into `main`, no tag.

### Conflict files and how each was resolved
- `types/profile.ts`: ONE `toPublicProfile(profile, gravatarPath?, siteExtras?)`. Body of WP10a (hidden blocks and their ids out of both layouts, `toPublicBlock()`, a new `layout` object) plus `site: toPublicSite(profile.site, siteExtras)` of WP10b in the same return object. Both schemas stay strict; an old profile is valid (new unit test).
- `modules/public-profile.ts`: both imports. One call: `toPublicProfile(withLocalLinkFiles(profile), gravatarPathIfPresent(), siteExtras)`.
- `package.json`: union. `predev`: ensure:profile, presets, check:profile, fetch:avatar, build:site-assets. `pregenerate`: presets, check:profile, check:contrast, check:icons, fetch:avatar, fetch:links, build:site-assets. `fetch:favicons` stays the alias. `satori` added next to `sharp`.
- `package-lock.json`: the WP10a side, then `npm install` (200 added lines, `satori` and its tree). `npm ci` passes.
- `playwright.config.ts`: `static` runs `links.spec.ts`, `unfurl.spec.ts` AND `site.spec.ts`; `dev` runs `editor.spec.ts` and `site-editor.spec.ts`.
- `content/profile.example.json`: the 11 blocks and both layouts of WP10a, plus the `site` object of WP10b.
- `README.md`: Contents has "Link previews" then "Site metadata"; both sections kept in that order; one personal-data list; the Scripts table has `fetch:links`, `fetch:favicons` (alias) and `build:site-assets` once each; the `predev` / `pregenerate` sentence follows `package.json`; the Tests table rows and the Project layout carry both sides.
- `content/README.md`: one ignored-files list (link tile wording of WP10a, the two `public/site*` lines of WP10b).
- `PLAN.md`: section 6 example = WP10a layouts + the `site` object; section 8 has "WP10a" then "WP10b"; the status line names the merge.
- `NOTES.md`: the merge mixed the two sections line by line. Rebuilt: the common part, then `## WP10a` and `## WP10b` whole, from each branch.
- Merged with no conflict, read and checked: `nuxt.config.ts` (`iconsIn()`, `$development`, `runtimeConfig.public.siteUrl`), `app/pages/edit.vue` (hide / duplicate events + the 4th tab; the `tabs` array drives the keyboard model, so 4 tabs are covered, `site-editor.spec.ts` tests it), `app/composables/useEditor.ts`, `.gitignore` (no duplicate line), `scripts/release.mjs` (the `public/site*` refusal next to the personal-data checks), `tests/e2e/public.spec.ts`.

### One real integration bug (found by the `dev` project)
`editor.spec.ts` "Hide dims the block..." (WP10a) hides the map block and waited until the page had no "Bogota". The sample `site.location` (WP10b) is "Bogota" too and is public (JSON-LD `address`). The test now checks `block.url`. No privacy problem: the hidden block itself is gone.

### theme-color fix (`app/composables/useTheme.ts`)
- Cause: a meta with a `key` has the unhead dedupe key `meta:<name>:key:<key>`. The server HTML carries no key, so the client could not match its tags and appended new ones: 4 `theme-color` and 2 `color-scheme` metas after hydration.
- Dropping the keys is not enough for `theme-color`: two metas with the same `name` then dedupe to ONE.
- Fix: the server renders the two `theme-color` metas (`useServerHead`, keyed, one per `prefers-color-scheme`). The client never gives them to unhead; `syncThemeColorMeta()` updates the two DOM nodes (and makes them on a page with no server HTML, the SPA fallback). There are ALWAYS two metas now: a fixed mode puts the same color in both. `color-scheme` lost its key, so unhead matches the server tag by name.
- Test: `public.spec.ts` "hydration and the toggle keep exactly 2 theme-color metas, 1 color-scheme meta, 1 inline script" (after load, after one toggle click, plus the contents). It failed before the fix with `{ themeColor: 4, colorScheme: 2 }`.

### Tests added
- `privacy.spec.ts` +2: one `toPublicProfile()` call with a hidden email, a hidden link, a hidden social block and a `site` with upload paths (none of the secrets in the JSON, layouts cleaned, `site` = public keys + extras, `PublicProfileSchema` strict parse); an old profile stays valid. The `dist/` checks (hidden email, hidden block title) were there already and run on the merged build.
- `site.spec.ts` +1: JSON-LD `sameAs` leaves out a hidden social block, because `buildHead()` gets the sanitized profile. `sameAsOf()` keeps its own `hidden` check as a second guard.
- `public.spec.ts` +1: the theme-color test above.

### Skipped on purpose
- `meta.themeColor` on the preview card: not used. The note in `## WP10a` > Open stays.

### Verification output (last lines)
```
$ npm ci                  -> exit 0 (2003 packages)
$ npm run lint            -> exit 0
$ npm run typecheck       -> exit 0
$ npm run generate        -> exit 0
profile: content/profile.example.json (example)
OK  63 icons found in installed Iconify packs
avatar: placeholder email, gravatar skipped
OK  link previews 0/0, thumbnails 1/1
site: favicon from initials, social image generated (8 files in public/site/)
Nuxt Icon client bundle consist of 33 icons with 27.61KB(uncompressed) in size
Prerendered 4 routes
$ ls dist/site | wc -l                          -> 8      (no `edit` in dist/)
$ grep -r "hello@example.com" dist | wc -l      -> 0
$ grep -rl "Hidden draft tile" dist | wc -l     -> 0
$ npm run check:icons     -> OK  63 icons found in installed Iconify packs
$ E2E_STATIC_PORT=4403 E2E_DEV_PORT=3403 npx playwright test --project=static
112 passed      (81 of WP10a + 27 of WP10b + 4 new)
$ E2E_STATIC_PORT=4403 E2E_DEV_PORT=3403 npx playwright test --project=dev
21 passed       (16 of WP10a + 5 of WP10b)
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks < /dev/null      -> exit 0
$ npm run dev -- --port 3404      GET / 200, /edit 200, /api/profile 200, 2 theme-color metas, no ERROR line
```

### Open
- Code review (Grok / OCR) of the merged branch not run yet. `content/unfurl.ts` is still the file that most needs it.
- Safari and Firefox: not checked (headless Chromium only).
- `public/site/` is not watched in dev (WP10b deviation): when `icon.svg` appears or goes away, restart `npm run dev`.

## WP10 security round

Branch: `wp/10-secure` (from `origin/wp/10-final`). Date: 2026-09-18. Node used: 22.23.1. Work was done in a separate git worktree; the main checkout was not touched. Not merged into `main`, no tag.

Input: an adversarial security review with working reproductions (S1 to S6) and a code review (C1 to C5). Every security fix has a regression test that fails before the fix. One fix per commit. Threat model: `docs/security.md`.

### Findings, fixes, regression tests
| Id | What was wrong | Fix | Regression test |
|---|---|---|---|
| S1 (high) | `isPlainSvg` was a regex on raw text. Six payloads passed it and were stored as `/icons/<hash>.svg`: opened directly they run script on the site's own origin (on localhost that script passes the Host / Origin checks of the dev routes) | `rasterizeIcon()` in `content/unfurl.ts`: EVERY fetched icon is decoded by sharp and drawn again as a PNG inside 128x128 (`limitInputPixels` 4096x4096, `failOn: 'error'`, SVG input 100 KB at most, SVG density set from the SVG's own size so the render is about 128 px, clamped 1 to 2400). Only `/icons/<hash of the OUTPUT>.png` is stored. ICO: the PNG entry goes through the same step. A file sharp cannot decode = "no icon", next source. `isPlainSvg` and `ICON_EXT` are gone. New `types/local-paths.ts`: ONE pair of patterns (`/icons/<hash>.png`, `/thumbs/<hash>.webp`) for `types/profile.ts`, `app/components/blocks/media.ts` and `content/unfurl-cache.ts` | `unfurl.spec.ts` > "S1: a remote SVG is never stored": `svg favicon "<name>": only PNG files land in the icons folder` for `prefixed-script`, `dtd-entity`, `entity-href`, `data-href-script`, `external-use`, `large-96kb`, `huge-viewbox`, `over-100kb`, `plain`; "a plain valid SVG becomes a PNG of 128 px at most, named after the OUTPUT bytes"; "icon bytes are never stored as they came"; "an SVG over 100 KB is not decoded at all"; "an icon sharp cannot decode is \"no icon\"". `links.spec.ts` "favicon and image must be local files..." (svg, jpg, gif, html paths refused). `security.spec.ts` "dist/icons holds no .svg file..." |
| S1b | No second layer when a bad file lands in `public/` | Tracked `public/_headers` (Cloudflare Pages and Netlify): `/icons/*`, `/thumbs/*`, `/blocks/*`, `/site/*`, `/site-uploads/*` get `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` + `nosniff`; `/*` gets `nosniff` + `Referrer-Policy`. `netlify.toml` lost its `/*` block (one source per header), the cache headers stay. Dev: the same headers through `routeRules` in `nuxt.config.ts` (prerender still 4 routes), plus `server/middleware/asset-headers.ts` (dev only): for a MISSING file Nitro's dev error handler wrote its own CSP over the route rule, so a missing file in those folders gets a plain 404 with the same two headers | `security.spec.ts` > "S1b: response headers for the static host" (4 tests: tracked + in `dist/`, the rules, netlify.toml, nuxt.config). `security-dev.spec.ts` > "S1b: the dev server sends the asset headers too" (7 tests, one for a missing file with four `Accept` values) |
| S1c | `content/site-assets.ts` wrote an uploaded SVG as it came to `public/site/icon.svg`; the upload route stored the raw SVG in `public/site-uploads/` | New `content/site-upload.ts` `storeSiteUpload()`: an SVG is drawn as a 512x512 PNG and ONLY the PNG is written (the route answers the `.png` path); a raster must decode with sharp as the format its extension names (a text file called `icon.png` = 415). `uploadArt()` never sets `svg`: `icon.svg` is the initials tile only. `site.favicon` no longer accepts `.svg` (`types/site.ts`) | `security.spec.ts` > "S1c: an uploaded SVG is never written to disk" (4 tests). `security-dev.spec.ts` > "S1c: the upload route never stores an SVG" (2 tests, the real route). `site.spec.ts` "uploads win..." now asserts no `icon.svg` |
| S2 | No total deadline: 6 icon sources x 8 s, redirects and requests per sub-request only, `dns.lookup` without a timeout, a closed editor request kept running, a dead link cost every build again | One `RequestBudget` per `unfurl()`: `AbortSignal.timeout(20000)` joined with the 8 s hop signal (`AbortSignal.any`), 8 requests, 8 redirects in total (5 per request stays), `lookupInTime()` 3 s. `UnfurlOptions.signal`: the route aborts it when the response closes before it ended; the job answers `cancelled` and caches nothing. Negative cache: `failures` in `.tilebox/unfurl-cache.json` (reason + time, 10 minutes, 200 at most, `force` skips it, guard refusals that cost no network are not stored, a good read forgets the failure) | `unfurl.spec.ts` > "S2: one budget for the whole unfurl": "a slow website ends after 20 s in total, and the failure is remembered: the second call is instant" (real 20 s, 3 hops of 7 s), "a failure is remembered for 10 minutes, `force` asks again...", "redirects are counted over ALL requests of one unfurl: 8 in total", "one unfurl makes 8 requests at most", "a DNS lookup that never answers ends after 3 s", "the caller can stop the job..." |
| S3 | `public/icons` and `public/thumbs` only grew and orphans shipped; the cache had no size limit; the editor unfurled every half-typed URL | `pruneLinkFiles()` (`content/unfurl-cache.ts`), last step of `scripts/fetch-links.ts`: removes files that no string of the current profile and no fresh cache entry names; keeps `.gitkeep`, `manifest.json`, dot files and the YouTube thumbnails of the video tiles; plain files directly inside the two folders only (a folder that is a symlink is skipped, symlinks and sub-folders inside are never followed or removed, real paths are compared). `MAX_CACHE_ENTRIES` 500, oldest `fetchedAt` first. `LinkEnrich.vue`: asks on paste and on blur (through `defineExpose`, `BlockForm.vue` reports both events); while typing only after 1200 ms AND for a whole http(s) URL with a dot in the host | `security.spec.ts` > "S3: unused fetched files are removed" (3 tests, temp dirs, symlinks) and "S3: the cache file has a size limit". `editor.spec.ts` "S3: a half-typed URL asks nothing; a whole URL asks after 1.2 s, a paste and a blur ask at once" |
| S4 | The cache was trusted: `favicon: "/icons/evil.html"`, `image: "/thumbs/manifest.json"`, `imageAlt: {}` reached the public profile | `CacheEntrySchema` / `UnfurlDataSchema` (zod, strict) on every read, paths with the SAME `localIconPath` / `localThumbPath` as `types/profile.ts` (exported), `imageAlt` a string of 200 at most; a bad entry is dropped silently. `localFileOf()` uses the same patterns | `security.spec.ts` > "S4: the cache file is checked like any other input" (poisoned file with the three values of the review + svg path, long alt, unknown key; the result passes `ProfileSchema`) |
| S5 | `[::127.0.0.1]` / `[::7f00:1]` counted as unicast | `isPublicAddress()` refuses IPv6 with 96 zero bits (`::/96`, so `::` too) and `::ffff:0:0/96` by its parts, on top of the ipaddr range check | `unfurl.spec.ts` address table (+13 forms) in "private, loopback..." and "an IP literal in the URL is refused before any connection" |
| S6 | `/api/unfurl` took any content type (an HTML form on another site could start a fetch: the first, unfixed test run really fetched example.com); the other write routes had no Host / Origin check at all | ONE helper `assertEditorRequest(event, 'json' | 'multipart' | 'none')` in `server/utils/editor.ts`: Host localhost -> else 403, Origin same -> else 403, `Sec-Fetch-Site: cross-site | same-site` -> 403, content type -> else 415. Used by `unfurl.post`, `save.post`, `upload.post`, `avatar/gravatar.post`, `site/assets.post`, `site/upload.post`, and (extra) by the three GET routes, because `/api/profile` holds the hidden email and DNS rebinding could read it | `security-dev.spec.ts` > "S6: the dev write routes take only what the editor sends" (14 tests: 415 per JSON route, 415 per multipart route, 403 per route for cross-site / same-site / Origin / Host, "what the editor sends still works", the read routes) |
| C1 | `networkReason` read one `cause` level | It walks the chain (8 levels, loop-safe): `bad certificate`, a guard reason such as `blocked address` / `too many redirects`, `timeout`, `offline or unknown host` | `unfurl.spec.ts` > "C1: the reason names the real cause" (2 tests) |
| C2 | The YouTube thumbnail used raw `fetch`, `redirect: 'follow'`, whole body before the size check | `fetchPicture()` in the engine: the guarded request, 5 MB while reading, written again as JPEG. The `--url` help now says that it writes the cache and the files | `unfurl.spec.ts` > "C2: build-time pictures use the guarded request" (2 tests) |
| C3 | Refresh sent `If-None-Match`, so a 304 kept the old data | No conditional headers with `force` | `unfurl.spec.ts` "the cache is fresh for 30 days..." (new assertions on the forced request) |
| C4 | Fetched text kept control and bidi characters | `cleanText()` strips C0 / C1 and U+202A-202E, U+2066-2069 | `unfurl.spec.ts` "C4: cleanText drops control characters and bidi controls..." |
| C5 | A failed favicon or social image left the files of an older build, so the head never fell back | `buildSiteAssets()` removes the favicon set or `og.png` of a kind that failed | `site.spec.ts` "C5: when a kind fails, its files of an older build are removed..." |
| D1 | Docs | README "Link previews" (PNG only, no stored SVG, `_headers`, 20 s budget, pruning, the honest Google s2 line and how to avoid it), README "Site metadata" (SVG uploads become PNG), `docs/security.md`, `docs/review-tools.md` "Large or security-critical files", PLAN status line | none |

### Contract changes (frozen files, so noted here)
- `types/profile.ts`: `favicon` is `/icons/<a-z0-9>.png` only (was png, jpg, webp, gif, svg). `localIconPath` and `localThumbPath` are exported. WP10 was never merged into `main`, so no saved profile has another extension; one that does fails `check:profile` with the path message. Fix: "Refresh" the link, or remove the `favicon` key.
- `types/site.ts`: `site.favicon` takes png, jpg, jpeg, webp (no svg). Upload the SVG again in the editor: it is stored as a PNG.
- This supersedes `## WP10a` deviation 4 (the SVG regex check) and deviation 6 (`force` sent `If-None-Match`).

### Deviations and why
- The 8-request limit counts a request that fails its DNS lookup too. With four dead icon links and a manifest, the image step can run out of budget. Real sites give an icon on the first or second try.
- A deadline that ends during the icon or image step still answers `ok: true` with what was read (and caches it, as a failed icon always did). Only a failed PAGE read is a negative result.
- Raster uploads are stored as they came (after the decode check): re-encoding would cost quality for the social image, and the folder has the sandbox CSP.
- `assertEditorRequest()` also guards the GET routes. The brief listed the write routes only.
- The route-level abort (`res.once('close')`) has no automated test: through the route no slow target is reachable without the network. The engine half is tested ("the caller can stop the job...").
- The editor resets the URL field when the typed text is not a valid URL yet (older behavior, seen while writing the S3 test). Not changed here.

### Verification output (last lines)
```
$ npm ci                  -> exit 0
$ npm run lint            -> exit 0
$ npm run typecheck       -> exit 0
$ npm run generate        -> exit 0
profile: content/profile.example.json (example)
OK  63 icons found in installed Iconify packs
OK  link previews 0/0, thumbnails 1/1
site: favicon from initials, social image generated (8 files in public/site/)
Prerendered 4 routes
$ ls dist                                       -> _headers, site/ (8 files), no `edit`
$ find dist -name '*.svg' -path '*icons*'       -> nothing
$ grep -r "hello@example.com" dist | wc -l      -> 0
$ npm run check:icons     -> OK  63 icons found in installed Iconify packs
$ E2E_STATIC_PORT=4405 E2E_DEV_PORT=3405 npx playwright test --project=static
152 passed      (was 112: +40)
$ E2E_STATIC_PORT=4405 E2E_DEV_PORT=3405 npx playwright test --project=dev
45 passed       (was 21: +24)
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks < /dev/null      -> exit 0
$ npm run dev -- --port 3406      GET / 200, /edit 200, /api/profile 200, no ERROR line
$ curl -sI http://localhost:3406/icons/x.png
content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox
x-content-type-options: nosniff
```

### Real smoke (network, files removed afterwards)
```
$ npx tsx scripts/fetch-links.ts --url https://nuxt.com --force
"favicon": "/icons/4adfe95e015260f9.png"      PNG 64x64 RGBA, 778 bytes (the site's icon.png is 1250 bytes: decoded and written again)
$ npx tsx scripts/fetch-links.ts --url https://vite.dev --force
"favicon": "/icons/66b9886f7b02200d.png"      PNG 128x123 RGBA, from the site's /logo.svg
$ find public/icons -name '*.svg' | wc -l     -> 0
```
nuxt.com served only a PNG icon link on that day, so vite.dev (an SVG favicon) was read too.

### Open
- Safari and Firefox: not checked (headless Chromium only).
- A host other than Cloudflare Pages or Netlify needs the `_headers` rules in its own format.

## Editor input fix

Branch `fix/editor-inputs`. Bug report: "a wrong behavior in the links avoids to clear the input field", and "it validates too often".

### Root cause
- The text inputs were CONTROLLED by the draft: `:value="block.url"` plus `@input="patch({ url: text($event) })"` (`app/components/editor/BlockForm.vue:162-168` on the base commit `39f6970`, the same shape for all 15 text inputs of the 7 block types).
- `patch()` ran `BlockSchema.safeParse()` on EVERY key (`BlockForm.vue:51-65`). A result that failed was not emitted (`:59-62`), but it wrote `errors.value`, and that re-rendered the form.
- Vue patches the `value` prop of an input on every render, also when the vnode prop did not change (`runtime-core` `patchProps`: `next !== prev || key === 'value'`). So the render wrote the OLD `block.url` back into the input.
- Result: a required field could not be cleared (`""` fails `z.url()` and `min(1)`), and no text could pass through an invalid state (`h`, `http`, `https://exa`). The top error list flashed on every key.
- Same family, other places: the image `alt` and `src` ignored an empty value (`BlockForm.vue:77-86`), the icon paste field was controlled and checked on `change` (`IconPicker.vue:79-84`), the email and the Site fields kept a local text but checked on every key (`edit.vue:213-231`, `SitePanel.vue:57-71`), `name` / `handle` went to the draft unchecked, so an empty name reached the save route.

### The pattern (one for every text field)
- `app/utils/field-draft.ts`: the state machine. Pure, no Vue. `text` (what the input shows), `error`, `pending`, `focused`, `edited`, `blurred`.
- `app/composables/useFieldDraft.ts`: makes the state reactive, watches the model, registers the field with the page (`provideFieldDrafts()`, `provideFieldDraftGroup()`).
- `app/components/editor/TextField.vue` (`<EditorTextField>`): label + input or textarea + inline error. The input shows the LOCAL `text`, never the model.
- The check is debounced: `FIELD_DEBOUNCE_MS` = 600 ms after the last key. At once on blur, Enter, a paste and the save key. A key hides the old message.
- Pass: `commit` is emitted, the draft, the preview and the dirty flag change. Fail: nothing is emitted, the text stays, the reason shows under the field (`aria-invalid`, `aria-describedby`, `role="alert"` only after the first blur, `text-pop`).
- Empty + optional: `commit('')`, the owner removes the key. Empty + required: "Required", the input stays empty, the draft keeps the LAST VALID value.
- The model writes into the input only when it changed from OUTSIDE (undo, "Use fetched title", a reload) and the user is not typing there (no focus, or focus without a key yet). The field's own commit never rewrites a focused input; after the blur the input shows the stored form (a Site URL without its trailing slash).
- Block form fields have `:key` = the field id, which holds the block id: another block gets fresh fields. A field that unmounts commits nothing (the form may already show another block).
- Save bar (`edit.vue`): "Not saved yet:" lists every mounted field with an error (`Blocks > URL: Required`). Save and Cmd/Ctrl+S run `flushAll()` first (check the field with waiting keys now), then save only when the list is empty. Else: "Save is blocked...", nothing is written.
- Selects, checkboxes, uploads, Hide, Duplicate: unchanged, they patch at once.
- Link preview (`LinkEnrich.vue`): it watches `block.url`, which is now the CHECKED URL. It waits only the rest of the 1.2 s (`TYPING_MS - FIELD_DEBOUNCE_MS`), so a typed URL is still asked 1.2 s after the last key, and at once after a paste or a blur. A new URL aborts the running request. The blur handler runs after the render, so a URL that was just replaced is never asked.

### Fields converted (33)
- `BlockForm.vue` (15): link title, url, description; social url, label; image caption; text title, body, footnote; section title; map label, sublabel, url; video url, title.
- `ImagePicker.vue` (2): the image path (required for an image block with `require-src`), the alt text (required). Used by the image block, the video thumbnail and the avatar.
- `IconPicker.vue` (1): the pasted icon name, checked with the schema of `LinkBlock.icon`. The search box has no model and keeps its own 300 ms debounce.
- `edit.vue`, Profile tab (5): name, handle (required), bio, status (optional), email (required).
- `HighlightsField.vue` (3): the three slots.
- `SitePanel.vue` (7): title, description, url, lang, xHandle, jobTitle, location. The two counters moved into the field (`counter`).
- `LinkEnrich.vue` has no text input: only the timing changed.

### Deviations
- A field with a refused value blocks the save only while it is mounted. The Profile and Site tabs stay mounted (`v-show`). A block form unmounts when you pick another block: its refused text is dropped and the draft still has the last valid value.
- The error texts are the zod messages without the `url:` / `email:` prefix (the label is right above). Three older tests changed for that and for the blocked save: `editor.spec.ts` (invalid URL, empty name, invalid email) and `site-editor.spec.ts` (bad URL).
- `types/profile.ts` is unchanged.

### Tests
- `tests/e2e/editor-inputs.spec.ts` (dev, 10 tests): written first, failed on the old code with `Expected: "" Received: "https://example.com/condomera"`.
- `tests/e2e/field-draft.spec.ts` (static project, no browser, 7 tests): the state machine with a fake clock.
```
$ npm run lint && npm run typecheck                                              -> clean
$ npm run generate                                                               -> ok
$ E2E_STATIC_PORT=4421 E2E_DEV_PORT=3421 npx playwright test --project=static    -> 159 passed (was 152: +7)
$ E2E_STATIC_PORT=4421 E2E_DEV_PORT=3421 npx playwright test --project=dev       -> 55 passed (was 45: +10)
```

### Open
- Safari and Firefox: not checked (headless Chromium only).
- A value typed with an IME is checked like any other: 600 ms after the last `input` event.

## WP11

Branch: `wp/11-second-wave` (from the local branch `merge/main-tmp`, commit `39f6970`). Date: 2026-09-18. Node used: 22.23.1. Work was done in a separate worktree; the main checkout was not touched. Not merged, no tag. "Linktree second wave" = PLAN.md 13.5: schedule, save contact, QR code, share button, UTM tags, link check.

### What was built
- **Schedule.** `startsAt` / `endsAt` on every block type (`z.iso.datetime({ offset: true })`, `endsAt` after `startsAt` through ONE `superRefine` on `BlockSchema`, so the block form and the profile get the same check). Pure rules in `app/utils/schedule.ts`. `blockDropReason()` in `types/profile.ts` is the one rule for the build, `check:profile` and the tests. `toPublicProfile()` got a 4th argument `{ now?, envSiteUrl? }`; `modules/public-profile.ts` passes the time of the render (build time; in dev, the last profile change). The public block keeps `endsAt` only. `BentoGrid.vue` writes `data-ends-at` on the `<li>`; `app/pages/index.vue` adds the inline script (`ENDS_AT_SCRIPT`, 194 bytes, `tagPosition: 'bodyClose'`) only when a block has an end date. It sets `hidden` (Tailwind preflight: `display: none !important`).
- **Save contact.** `ContactSchema` (strict, all optional), `app/utils/vcard.ts` (pure: escaping, 75-byte folding that never cuts a character, control and bidi characters removed by code point), `content/site-extras.ts` writes or REMOVES `public/site/contact.vcf`. `ContactBlock.vue` = `Tile` with the new `download` prop (only with it a local `href` becomes a link). The public profile gets `contact: { fileName }` only, and only when the file exists.
- **QR code.** `qrSvg()` (`uqr` `renderSVG`, ecc M, border 2) in `content/site-extras.ts`; https only (`isSiteUrl`); env > `site.url`. `QrBlock.vue` is an `<img>`. `GET /api/site/qr.png` (dev only, `assertEditorRequest(event, 'none')`) draws the local SVG with sharp at 1024 px, nearest-neighbour.
- **Share button.** `ShareButton.vue`, included in `ProfileHeader.vue` behind a `share` prop (the public page passes `site.share !== false`; the editor preview does not pass it). Same markup on server and client, so no `ClientOnly` and no hydration mismatch in the built page.
- **UTM tags.** `app/utils/utm.ts` (`withUtm`, `withoutUtm`, `isExternalHttpUrl`). String work, not `URL.searchParams`: the typed query and hash stay byte for byte. `toPublicBlock()` tags link, social, map and video URLs. `toPublicSite()` drops `utm`. `sameAsOf()` strips the tags, so JSON-LD identity URLs stay clean.
- **Link check.** `content/link-check.ts` (`linkTargets`, `classifyStatus`, `checkLink`, `checkLinks`, `linkTable`), `scripts/check-links.ts` (`--broken-only` for `publish.mjs`), `POST /api/links/check`, `useLinkCheck()` (`useState`, memory only), `LinkCheckButton.vue`, `BlockRowBadges.vue`.
- **Editor.** All new UI is in NEW components. `useEditor()` now `provide`s the draft (`EDITOR_DRAFT`, `useEditorDraft()`), and `useSiteDraft()` reads and writes `site.*` and `contact` through it. So `edit.vue` has NO change, `SitePanel.vue` has one include line (`<EditorSiteExtras />`) plus one type on `withKey`, `BlockForm.vue` has two includes (`EditorBlockExtraFields`, `EditorBlockAdvanced`), `BlockList.vue` two (`EditorLinkCheckButton`, `EditorBlockRowBadges`), `PreviewTile.vue` one. `ImagePicker.vue` was not touched.
- `server/api/save.post.ts` runs `buildSiteExtras()` BEFORE it writes the profile (no network, no sharp), so the dev page never drops a fresh contact or QR tile for a missing file and never links to a stale card.

### Deviations and why
1. **The example has a block that starts in 2099 (`b13`, "Scheduled draft tile").** The brief said "no time-dependent content except one `endsAt` in 2099", and also asked the privacy spec to prove that a future-start title is in no file of `dist/`. That proof needs such a block in the built profile. A 2099 start is as stable as a 2099 end, and it follows the precedent of the hidden block `b11`. Cost: `check:profile` prints one warning line on every build of the sample. The `endsAt` 2099 is on `b7`.
2. **No `qr` block in the example**: it has no `site.url` (checked). `dist/site/qr.svg` exists only with `NUXT_PUBLIC_SITE_URL` or `site.url`.
3. **The QR code always uses the LIGHT preset colors on a solid ground**, also in dark mode. The brief allowed "transparent/ground"; a light-on-dark code does not scan on many phones, and an `<img>` SVG cannot follow the theme toggle.
4. **The contact card and the QR code are in a sibling module (`content/site-extras.ts`), not inside `buildSiteAssets()`.** The WP10b tests pin "8 files" and the exact folder listing of that builder. The script prints its summary line unchanged, then the extras lines.
5. **`EMAIL;TYPE=INTERNET`** (the usual 3.0 form) instead of a bare `EMAIL`. `URL`, `TEL` and `EMAIL` are not text values in RFC 2426, so they are not comma-escaped; the schema and a second guard keep line breaks out.
6. **Link check classes.** Other 4xx (400, 451...) count as `blocked`. A refusal of the SSRF guard (a private address) counts as `broken`: a visitor cannot open it either. Hidden blocks are checked too (the owner may show them again); the vCard URL is checked when the card is on. Besides "4 at a time" there is "one request per host at a time" (PLAN 13.5).
7. **`content/unfurl.ts` (a WP10a file) got one option**: `method?: 'GET' | 'HEAD'` on `RequestOptions` (now exported) and `TransportInit`. Default `GET`, so the engine and its 152 tests are unchanged.
8. **Icons.** `line-md` has no clock and no share icon (checked in the pack). Schedule badge: `line-md:calendar`. Share: `line-md:upload` (the arrow-out-of-a-tray shape of the iOS share icon), `line-md:confirm` after a copy. Contact: `line-md:account` (exists). All in `UI_ICONS`, so `check:icons` covers them (68 icons).
9. **"Check links" sits at the top of the block list** (`BlockList.vue`), not in a tab header: the Blocks tab has no header, and this keeps `edit.vue` untouched.
10. **Share button position on phones.** The fixed theme toggle covers the top right corner of the profile tile below `md`. The share button sits left of it (`right-16`), and at `md` and up in the corner (`md:right-6`). A test checks at 1280 and 390: 44 px, no overlap, 8 px gap or more, inside the tile, clear of the avatar and the name.
11. `publish.mjs` runs the link check also with `--no-build`. Only `--skip-link-check` skips it. It can add up to about 5 minutes in the worst case (60 dead hosts); a normal profile takes seconds.

### For the merge with the two parallel branches
- `BlockForm.vue`: my change is the 10 lines before the last `<div class="mt-2 ...">` (two components that emit `update:block`). They need only `block` and the form's `emit`.
- `SitePanel.vue`: `<EditorSiteExtras />` before the closing `</div>`, and `Record<string, Site[keyof Site]>` in `withKey()` (`site.utm` is an object, so `string | boolean` no longer fits). If the refactor rewrites `withKey()`, keep it spreading `site.value`: that is what keeps `share` and `utm` alive when another field changes.
- `useEditor.ts`: `BLOCK_TYPES`, `BLOCK_TYPE_LABELS`, `newBlock`, `copyOf`, `blockSummary` got the two types; `provide(EDITOR_DRAFT, draft)` is the first line of `useEditor()`.
- The Site tab has new labels. Kept unique against the WP10b tests (`getByLabel` matches substrings): the card uses "Role", not "Job title".

### Known limits (documented in the README)
- A scheduled START needs a new publish after that time. `check:profile` says so, with the date.
- A tile with a passed `endsAt` stays visible with JavaScript off, and its text is in the files of the site until the next publish. Not for secrets.
- In `nuxt dev`, a page opened right after a save can log one Vue hydration warning (server bundle and client bundle refresh at slightly different times). Dev only; it was there before for every saved field. The built page has none.

### Tests
- `static`: 191 passed (was 152). New file `tests/e2e/second-wave.spec.ts` (37 tests): schema (old profile valid, offset needed, `endsAt` after `startsAt`, every block type, qr sizes, utm slugs, strict `contact`), schedule matrix with a fixed `now` (both layouts cleaned, only `endsAt` ships, input untouched), `datetime-local` <-> ISO, script under 400 bytes; UTM matrix (existing query and hash, existing `utm_*`, `mailto:`, `tel:`, local path, same site, `www.`, `noUtm`, hidden block, image source untouched, env URL wins, `sameAs` clean, brand icon + cache key on the ORIGINAL url with a real cache file); vCard (escaping, CRLF only, 75-byte lines, no `PHOTO`, profile email absent from the card and from the public profile, stale file removed); QR (no URL = no file, colors, no script in the SVG, env wins, http refused); link check with a mocked transport (HEAD first, honest UA, pinned address, GET retry reads 2 chunks at most, redirect followed, DNS / certificate / timeout reasons, private address refused with no connection, targets, 4 at a time and one per host). Browser: end-date script with `page.clock` (hidden at load in 2100; hidden by the 60 s check), share button (clipboard permission, "Link copied", gone after 2 s, no foreign or `/api/` request; the `navigator.share` branch with a stub), geometry at 1280 and 390, contact tile `href` + `download` + a real download event, no QR without a site URL. `privacy.spec.ts` +2 (`.vcf` is a text file now): the 2099 block is in no file of `dist/`; the card is in `dist/` only when it is on and has no profile email. `public.spec.ts` counts tiles with `blockDropReason()`. a11y stays at 0 violations with the new tile and button.
- `dev`: 54 passed (was 45). New file `tests/e2e/second-wave-editor.spec.ts` (7 tests): schedule round-trip to ISO with the machine's offset (saved file, reload, list badge, tile badge, dev page follows, Clear restores the block exactly), Expired badge, contact panel (public note, bad email refused, saved object, preview text, the card follows the save and leaves the disk when turned off), live UTM example (incomplete, bad value, saved, stored links clean, dev page tagged), share checkbox, "Check links" with the route mocked (badges, summary, file unchanged), the real routes (403 / 415 / 400 guards, a loopback link answers `blocked address` with no network, QR PNG 1024x1024 with the sandbox CSP on the SVG). `security-dev.spec.ts`: `/api/links/check` joined `JSON_ROUTES` (+2). The profile is backed up and restored; the two generated files are made again from the restored profile.
- Both projects in one run: 243 passed, 2 skipped (the two "example only" tests: the dev server's `predev` creates `content/profile.json` before the static tests start; alone, `static` runs them).

### Verification output (last lines)
```
$ npm run lint                      -> clean
$ npm run typecheck                 -> clean
$ npm run generate                  -> exit 0
  warning: block "b13" starts on 2099-01-01T00:00:00Z. This build leaves it out: publish again after 2099-01-01T00:00:00Z to show it.
  site: favicon from initials, social image generated (8 files in public/site/)
  site: contact card written (/site/contact.vcf). Everything in it is public.
$ ls dist/site                      -> the 8 files + contact.vcf (no qr.svg: the example has no site URL)
$ NUXT_PUBLIC_SITE_URL=https://ricardo.example npx tsx scripts/build-site-assets.ts
  site: QR code written for https://ricardo.example/
$ grep -r "hello@example.com" dist | wc -l          -> 0
$ grep -rl "Scheduled draft tile" dist | wc -l      -> 0
$ E2E_STATIC_PORT=4422 E2E_DEV_PORT=3422 npx playwright test --project=static   -> 191 passed
$ E2E_STATIC_PORT=4422 E2E_DEV_PORT=3422 npx playwright test --project=dev      -> 54 passed
$ npm run check:icons               -> OK  68 icons found in installed Iconify packs
$ npm run check:links               -> exit 0. 10 URLs: 6 ok, 0 blocked, 4 broken (the example.com/* sample paths answer 404)
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks         -> exit 0
```

### Open
- Review (Grok or OCR) not run yet. `content/link-check.ts`, `app/utils/vcard.ts` and the change in `content/unfurl.ts` are the security-relevant parts.
- Safari and Firefox: not checked. `navigator.share` on a real phone: not checked (stubbed in the test).
- `npm run publish` with the link check step was not run against a real provider (it needs Ricardo's login). `node scripts/publish.mjs --help` prints the new flag.

## WP12

Pexels photo picker (PLAN.md 13.1, now section 8 `### WP12`). Branch: `wp/12-pexels` (from the local `merge/main-tmp`). Date: 2026-09-18. Work was done in a separate git worktree; the main checkout was not touched. Not merged.

No real Pexels key was available: NO real API call was made. Everything below the documentation check runs against a mocked connection.

### Pexels API facts, checked on 2026-09-18 (https://www.pexels.com/api/documentation/)
- Search: `GET https://api.pexels.com/v1/search`. `query` (required), `orientation` (`landscape`, `portrait`, `square`), `size` (`large` 24 MP, `medium` 12 MP, `small` 4 MP), `color` (12 names or a hex code), `locale`, `page` (default 1), `per_page` (default 15, max 80). One photo: `GET https://api.pexels.com/v1/photos/:id`.
- Key: the header `Authorization: <key>`, the key as it is (no `Bearer`).
- Photo: `id`, `width`, `height`, `url` (the photo page), `photographer`, `photographer_url`, `photographer_id`, `avg_color`, `src`, `alt`, `liked`. `src`: `original`, `large2x` (940x650 at DPR 2), `large` (940x650), `medium` (height 350), `small` (height 130), `portrait` (800x1200), `landscape` (1200x627), `tiny` (280x200).
- Search answer: `photos`, `page`, `per_page`, `total_results`, `next_page` and `prev_page` (both optional).
- Limits: 200 requests per hour and 20,000 per month by default. Headers `X-Ratelimit-Limit`, `X-Ratelimit-Remaining`, `X-Ratelimit-Reset` (UNIX seconds). **They come with 2xx answers only, NOT with a 429.** This changes the design: see decision 3.
- Guidelines: "show a prominent link to Pexels" when you use the API, "always credit our photographers when possible (e.g. 'Photo by John Doe on Pexels' with a link to the photo page on Pexels)", do not copy the core function of Pexels, do not work around the rate limit.

### What was built
- `content/pexels.ts`: the engine (`searchPhotos`, `pickPhoto`, the zod input schemas, `PexelsError` with an HTTP status). Plain TypeScript, no Nuxt imports, paths from `ROOT` (the WP7 lesson), so Playwright can run it with a mocked `transport` and `lookup`.
- `server/api/images/pexels/status.get.ts`, `search.get.ts`, `pick.post.ts` + `server/utils/pexels.ts`. All: 404 outside `nuxt dev`, then `assertEditorRequest()` (`none`, `none`, `json`). `search` and `pick` load the engine with `import.meta.dev ? await import(...) : null`, like `/api/unfurl`, so a build has no copy of it.
- `app/components/editor/PexelsPicker.vue` (new) and the two tabs in `ImagePicker.vue`.
- `imageCredit()` in `app/components/blocks/media.ts` + the credit line of `ImageBlock.vue`.
- `.env.example`, README "Stock photos (Pexels)", `docs/security.md` "The Pexels picker", PLAN.md.

### Decisions
1. **The key is read with `process.env.PEXELS_API_KEY` in the route, not `runtimeConfig`.** Nuxt loads `.env` into the dev server (checked by hand: a `.env` with a dummy key -> `GET /status` answers `{ "configured": true }`). No `runtimeConfig` entry means no way to put it under `public` by mistake, and `nuxt.config.ts` has no word "pexels" (a test checks that).
2. **`POST /pick` takes `{ id, size? }`, `size` = `large2x` (default) or `large`.** Never a URL. `large2x` is 1880 px wide at most, enough for the 1600 px target, and about 0.3 to 0.8 MB. `original` is not offered: it can be 50 MP for no gain. The byte limit stays at 15 MB as asked.
3. **The 429 text.** A 429 has no rate-limit headers, so the engine remembers `X-Ratelimit-Reset` of the last good answer of this dev server. Known and in the future -> "try again at 14:05" (with the date when it is another day). Unknown -> "try again in about one hour". The route also sends `data.reset`.
4. **The allow-list lives in `safeRequest()`** (`content/unfurl.ts`, a WP10a file; change noted here as PLAN.md section 0 rule 2 asks). Two new, optional request fields: `onlyHosts` (every hop must be https on a listed host, else "blocked host"; the address check still runs) and `headers` (sent on the FIRST hop only, so a redirect target never gets the key). Nothing changes for the callers that do not set them; `unfurl.spec.ts` and `security.spec.ts` are green.
5. **WebP, quality 82.** Nothing was hurt by WebP: `ImageBlockSchema.src` is any local path, the link images of WP10a are WebP already, every browser of the last 5 years reads it. sharp drops metadata by default; the test puts an EXIF copyright text into the input and looks for it in the output.
6. **Idempotent pick still asks the API once** (1 request of the quota): the answer needs `alt` and the credit fields, and they are not stored next to the file. The download and the encode are skipped. A file that is not a readable WebP is written again.
7. **Alt text.** `alt` is required by the schema, so it is never empty: a new block has "Sample image". The Pexels alt is used when the current text is empty, starts with "Sample image", or is the text this field filled in for the photo picked before. A text the owner wrote stays. Pexels has no alt -> "Photo by {author}".
8. **One `stock` event, one patch.** `ImagePicker.vue` emits `stock` with `src`, `alt` and `source` together; `BlockForm.vue` patches them at once. Two separate `update:*` events would race with `onImageSrc`, which sets `source: null`. The edit in `BlockForm.vue` is 2 template lines (`:stock-size`, `@stock`), no script change: the agent that refactors the text inputs should keep them.
9. **Only image blocks get the Pexels tab** (`stock-size` prop). The video thumbnail field has no `source`, so a stock photo there could not be credited.
10. **No key name in client code.** The edit page chunk IS part of `dist/` (the page says "dev only" there). So the help text of the no-key state says "the Pexels line of `.env` / `.env.example`" and never names the variable; the exact name is in README and `.env.example`. This keeps the canary strict: the name of the variable is in NO built file.
11. **Offline.** The dev server is on the same machine and answers without internet, so the tab asks `navigator.onLine` first (no request). When the browser says online but Pexels cannot be reached, the server answers 502 / 504 "Cannot reach Pexels (...)" and the tab adds "Check your internet connection".
12. **`hideCredit`: not built**, as decided. `imageCredit()` always answers a line for `provider: pexels`, also without an author ("Photo on Pexels"). URLs are used as they are: the UTM feature of another branch must skip credit links (it should only touch block URLs).
13. **Thumbnails in the grid load from `images.pexels.com`** with `referrerpolicy="no-referrer"`. Dev editor only. The public page test "never requests another origin" is unchanged and green.
14. **Housekeeping (item 7): confirmed.** `pruneLinkFiles()` loops over `['icons', 'thumbs']` only. `pexels.spec.ts` has a test with a `blocks/pexels-1.webp` next to an orphan icon: only the icon goes.

### Deviations and why
- **The credit links are tested in the `dev` project, not in the static browser.** The static site is built from the tracked example, and that example must not claim a Pexels credit for `sample.jpg` (it is not a Pexels photo), and a real Pexels photo could not be downloaded without a key. The preview tile of the editor IS the public `ImageBlock.vue`, so `pexels-editor.spec.ts` checks the two links, `href`, `rel`, `target` there, and `pexels.spec.ts` checks `imageCredit()` as a unit. When Ricardo's profile has a Pexels photo, `public.spec.ts` ("never requests another origin") covers it on the static page as it is.
- **The key canary needs the dummy key at build time to be a full check**: `PEXELS_API_KEY=tilebox-canary-pexels-key-0f3a9c npm run generate`. Without it the value check passes trivially; the name check, the engine check (`api.pexels.com`) and the source checks still work. The test also looks for a key found in `.env` or in the environment, so on Ricardo's machine it checks his real key (only file names are printed). Suggestion for the architect, not done here (CI files belong to WP4/WP6): add that dummy variable to the `generate` step of `.github/workflows/ci.yml`.
- `.nuxt/dist/client` does not exist after `nuxt generate` in this Nuxt version (the client files are moved to `.output/public` = `dist`). The canary reads it when it exists, and `.output/server` too.

### Requests to other WPs
- `CLAUDE.md` still says "Later Pexels picker". An agent may not edit that file: Ricardo or the architect should change the line to "Pexels picker built (WP12), key in `.env`".
- The BlockForm refactor (local drafts): keep `:stock-size="block.size"` and `@stock="patch({ src, alt, source })"` on the image field, and let the alt draft follow `block.alt` after a pick.

### Tests
- `static`: +26 in `tests/e2e/pexels.spec.ts` (9 search, 2 input, 7 pick, 1 housekeeping, 4 credit, 3 key canary).
- `dev`: +10 in `tests/e2e/pexels-editor.spec.ts` (6 browser tests with mocked routes, 4 on the real routes that are refused before any network call).
- Cleanup: `content/profile.json` is backed up and restored (`.e2e-pexels-backup`, in `.gitignore`), every `public/blocks/pexels-*` is removed at the end.

### Verification output (last lines)
```
$ npm ci                  -> exit 0
$ npm run lint            -> exit 0
$ npm run typecheck       -> exit 0
$ PEXELS_API_KEY=tilebox-canary-pexels-key-0f3a9c npm run generate   -> exit 0
profile: content/profile.example.json (example)
OK  63 icons found in installed Iconify packs
OK  link previews 0/0, thumbnails 1/1
site: favicon from initials, social image generated (8 files in public/site/)
Prerendered 4 routes
$ grep -r "hello@example.com" dist | wc -l      -> 0
$ E2E_STATIC_PORT=4423 E2E_DEV_PORT=3423 npx playwright test --project=static
178 passed      (was 152: +26)
$ E2E_STATIC_PORT=4423 E2E_DEV_PORT=3423 npx playwright test --project=dev
55 passed       (was 45: +10)
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks < /dev/null      -> exit 0
$ printf 'PEXELS_API_KEY=<dummy>' > .env; npx nuxt dev --port 3423
$ curl -s localhost:3423/api/images/pexels/status                          -> { "configured": true }
$ curl -s -o /dev/null -w '%{http_code}' -H 'Origin: https://evil.test' ... -> 403
(.env removed afterwards)
$ ls public/blocks        -> sample.jpg
```

### Open (needs Ricardo's real key)
- One live run: a search, "Load more", a pick, the saved file (`public/blocks/pexels-<id>.webp`, about 1600 px, under 1 MB), the credit on the tile, `npm run generate`, the page with no foreign request.
- The real shape of a 401 and of a 429 from Pexels (status codes are from the documentation; the body is not read, so a change there cannot break the message).
- The real value of `X-Ratelimit-Reset`: the documentation says "UNIX timestamp". The code reads it as seconds.
- Safari and Firefox: not checked (headless Chromium only).
- Grok review of this WP (PLAN.md section 9).

## WP13 integration

Branch: `wp/13-integration` (from `origin/main` `df09fa4` = WP10 + the editor input fix). Date: 2026-09-18. It merges `origin/wp/11-second-wave`, then `origin/wp/12-pexels`. Both were built from the commit BEFORE the input fix. Work was done in a separate worktree. Not merged into `main`, no tag.

### Merge 1: `wp/11-second-wave` (3 conflict files)
- `playwright.config.ts`: union. `static` = main's list (with `field-draft.spec.ts`) + `second-wave.spec.ts`. `dev` = main's list (with `editor-inputs.spec.ts`) + `second-wave-editor.spec.ts`.
- `README.md`: the two rows of the Tests table = main's text + the WP11 sentence. Project layout: `useFieldDraft` AND `useSiteDraft`, `useLinkCheck`.
- `NOTES.md`: `## Editor input fix`, then the whole `## WP11`.
- Merged by git with no conflict, read by hand: `BlockForm.vue` (main's `EditorTextField` pattern + the two WP11 includes before the last div), `SitePanel.vue` (7 converted fields + `<EditorSiteExtras />`; `withKey()` still spreads `site.value`, so `share` and `utm` stay when another field changes), `useEditor.ts` (`provide(EDITOR_DRAFT, draft)` is the first line; the field registry of main lives in `useFieldDraft.ts` / `edit.vue`, untouched), `modules/public-profile.ts` (passes `{ now: new Date(), envSiteUrl: process.env.NUXT_PUBLIC_SITE_URL }` as the 4th argument), `package.json`, `package-lock.json` (`uqr`).

### Merge 2: `wp/12-pexels` (8 conflict files)
- `content/unfurl.ts`: `RequestOptions` has all three: `method` (WP11), `onlyHosts` and `headers` (WP12). In `safeRequest()` every hop runs the `onlyHosts` check, then `checkTarget()`; `headers` go on hop 0 only; `method` goes to the transport on every hop.
- `BlockForm.vue`: the image field has `require-src` (main) + `:stock-size` and `@stock` (WP12). One `stock` patch = `src`, `alt`, `source`.
- `ImagePicker.vue`: main's two `EditorTextField`s (path, alt) + the Upload / Pexels tabs and the `stock` event. The old `onSrcInput` / `onAltInput` of WP12 are gone (the fields commit). The path field is inside the Upload panel (`v-show`), so it stays mounted and follows a pick.
- `playwright.config.ts`: + `pexels.spec.ts` (static), + `pexels-editor.spec.ts` (dev).
- `README.md` (Tests table rows: + the two Pexels sentences; project layout: `content/pexels.ts`, the three routes, all spec names), `PLAN.md` (status line rewritten for this branch; section 8 has `### WP11` then `### WP12`), `docs/security.md` (the WP11 sections, then "The Pexels picker"), `NOTES.md` (`## WP11`, then `## WP12`).
- `CLAUDE.md`: the stale "Later Pexels picker" line now says that the picker exists (key in `.env`, dev only).
- `.gitignore`, `.env.example`, `content/README.md`, `package.json`: merged by git, checked. `package-lock.json`: `npm install` changed nothing, `npm ci` passes.
- Hook order (unchanged): `predev` = ensure:profile, presets, check:profile, fetch:avatar, build:site-assets. `pregenerate` = presets, check:profile, check:contrast, check:icons, fetch:avatar, fetch:links, build:site-assets.

### WP11 text fields converted to `EditorTextField` (13)
- `BlockExtraFields.vue` (3): contact tile title, description; QR caption. `:key` holds the block id. The check is `BlockSchema` on the whole block, like `BlockForm.vue`. The icon picker got a `:key` too.
- `ContactPanel.vue` (7): full name, company, role, phone (`type="tel"`, new in the `type` union of `TextField.vue`), public email, website, note (multiline). Model = the draft (`contact[key]`), check = `ContactSchema.shape[key]`, values are trimmed. Save bar name: `Site > Contact card, Public email`.
- `UtmPanel.vue` (3): source, medium, campaign. The draft has no place for half a setting, so the panel keeps `values` = the CHECKED text of each field; `site.utm` is written only while source and medium are both there. **Behavior change:** the example and the "tags are off" note follow the checked values (about 600 ms after the last key), and a refused campaign no longer turns the example off: the draft keeps the last valid tags, the field shows the reason, and Save is blocked. `second-wave-editor.spec.ts` was changed for that (contact: error after blur + save bar; UTM: example keeps source and medium).
- NOT converted, on purpose: the two `datetime-local` inputs of `BlockAdvanced.vue` (a picker, commits at once) and the Pexels search box (a search box, its own 800 ms wait).

### Follow-ups
- `ci.yml`: the Generate step sets `PEXELS_API_KEY: tilebox-canary-pexels-key-0f3a9c`. It is the same text as `CANARY` in `tests/e2e/pexels.spec.ts`, so the `e2e` job proves on CI that a key in the build environment reaches no file of `dist/`. Not a secret.
- `pexels-editor.spec.ts` +1: after a pick the alt FIELD and the path field follow the block (a change from outside, no focus), a pick replaces the text it filled in itself, the owner's typed text stays.
- `second-wave-editor.spec.ts` +1: contact card and UTM fields are clearable, show no message while typing, check about 600 ms after the last key, alert only after a blur, and Cmd/Ctrl+S on a refused value writes nothing.

### Verification output (last lines)
```
$ npm ci                                   -> exit 0
$ npm run lint && npm run typecheck        -> clean
$ PEXELS_API_KEY=tilebox-canary-pexels-key-0f3a9c npm run generate   -> exit 0, 13 blocks, 68 icons, "contact card written"
$ ls dist                                  -> _headers, site/ (8 files + contact.vcf), no edit
$ find dist -name '*.svg' -path '*icons*'  -> empty
$ grep -r "hello@example.com" dist | wc -l        -> 0
$ grep -rl "Scheduled draft tile" dist | wc -l    -> 0
$ E2E_STATIC_PORT=4431 E2E_DEV_PORT=3431 npx playwright test           (both projects, ONE run)
  298 passed, 2 skipped   (static 222 passed + 2 skipped, dev 76 passed)
$ E2E_STATIC_PORT=4431 E2E_DEV_PORT=3431 npx playwright test --project=static   -> 224 passed
$ npm run check:icons                      -> OK  68 icons
$ npm run check:links                      -> exit 0 (6 ok, 0 blocked, 4 broken: the example.com/* sample paths answer 404)
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks -> exit 0
$ npm run dev -- --port 3432 (25 s)        -> /, /edit, /api/profile, /api/images/pexels/status = 200, no ERROR line
```
The 2 skips of the one-run are the two "example only" tests (`privacy.spec.ts` "the example email is in no file of dist/", `second-wave.spec.ts` "no qr tile and no qr file without a site URL"): the `predev` of the dev server creates `content/profile.json` before the static tests start, and they skip when that file exists. Alone, `static` runs them: 224 passed. Numbers: static 159 (main) + 39 (WP11) + 26 (WP12) = 224. dev 55 (main) + 9 (WP11) + 10 (WP12) + 2 (this branch) = 76.

### Open
- Review (Grok or OCR) of this branch: not run. Security-relevant: the merged `safeRequest()` in `content/unfurl.ts`.
- `ImagePicker.vue` decides "is the alt text the owner's own?" from the draft (`block.alt`), not from the text in the field. A cleared alt field (refused, "Required") keeps the old alt in the draft, so a pick then does not replace it. Small; the owner can type the new alt.
- Still open from WP11 / WP12: one live Pexels run with Ricardo's key, `npm run publish` with the link check against a real provider, Safari and Firefox.

## Review pipeline

Branch `chore/grok-review-pipeline` (from `origin/main`). Date: 2026-09-18. Work was done in a separate git worktree. Not merged.

Goal: the Grok review toolchain of app.condomera, ported to this repo (Nuxt 4, TypeScript, Vue, static). Why: on 2026-09-18 Grok "cancelled" on 8 of 13 reviews here, because it had to fetch the diff through its shell tool with every tool and MCP server enabled. How to use it: `docs/review-tools.md`.

### What was built (`scripts/review/`)
- `grok-review.sh` (`npm run review`): diff into the prompt file, intent, impact map, read-only tools, `--json-schema`, effort medium, 8 turns, watchdog, blind-run guard (exit 3), cache in `<git common dir>/grok-review/`, `--dry-run`, `--ledger`, untracked new files, 150,000 character cap. Exit 0 / 1 / 2 / 3 and the trailer line are the ones of the reference.
- `impact-map.py` (python3, standard library): importers (relative, `~/`, `@/`, `~~/`, `@@/`, `#alias` from `nuxt.config.ts`), importers of an alias the changed file feeds (`#profile`), Nuxt component tags (`<EditorTextField>`, kebab, `Lazy`), auto-imported exports of `app/composables`, `app/utils`, `server/utils`, exported symbols the diff touches (changed lines, the hunk header, the nearest export above the change), npm script names (hooks, README, docs, workflows), `/api` routes, schema keys. 40 references per file, tests last and marked, 12 `<caller>` blocks of 25 lines, one per 25-line window. With `graphify-out/graph.json` and the `graphify` CLI it adds `graphify affected`; else it says the graph is unavailable. It states that it is not exhaustive.
- `grok-review.prompt.md`, `grok-review.schema.json`: the rules point at `docs/invariants.md` (new), `CLAUDE.md`, `PLAN.md` section 0, `docs/security.md`. Nine shapes to hunt, each with a real example from this file. Categories: second-code-path, bundled-path, privacy-leak, untrusted-input, editor-state, test-green-wrong-reason, schema-drift, runtime-network, dev-route-guard, a11y, docs, other.
- `findings-ledger.sh` (`npm run review:ledger`) + `findings-ledger.jsonl`: sources `grok|ocr|agent|human`, `--branch` next to `--pr`, no duplicate (source, pr-or-branch, id).
- `grok-review.test.sh` (`npm run test:review`, in the CI build job): 94 assertions, a fake `grok` and a fake `graphify` on `PATH`, no network.

### Deviations from the reference and why
1. The impact map is a text search in Python, not the PHP code graph. This repo has no graph for TypeScript or Vue, and Nuxt auto-imports leave no import line to follow.
2. `grok 1.0.30` flags: every flag of the reference exists with the same name (`--prompt-file`, `--json-schema`, `--tools`, `--disallowed-tools`, `--deny`, `--effort` = alias of `--reasoning-effort`, `--max-turns`, `--output-format json`, `--cwd`). New use: `--session-id`, `--resume`, and the `grok usage <id>` command.
3. **The conclude step (new).** At `--max-turns` grok 1.0.30 exits 1 with `max turns reached` and prints no envelope. The model does not count its turns: see the two blind runs below. The script gives the review call its own `--session-id`; at the cap it resumes that session once with "no more tools, write the verdict from what you have read" (`--max-turns 2`, 3 minutes). `--conclude <session id>` does that step alone for a session a blind run printed. The report says `verdict forced at the turn cap`.
4. Watchdog default 8 minutes (reference: 6). A turn takes 30 to 60 s here; run (c) finished on its own after 357 s.
5. Tokens, turns and model in the trailer come from `grok usage <session>` (both calls of a concluded run); the envelope is the fallback.
6. Intent: no PR in this repo most of the time, so the commit messages of the range are the description when `gh pr view` gives nothing.
7. The script notes in the prompt and on stderr when the head of `--range` differs from the checkout, because Grok and the map read the checkout.
8. The ledger report never names `other` as the next check: it is not a shape a script can catch.
9. The prompt render replaces all placeholders in one pass, so a `{{DIFF}}` inside a diff (this very script) is never substituted.
10. ESLint: no change. `eslint .` does not pick up `.sh`, `.py`, `.md`, `.json` or `.jsonl`.

### Real runs (Grok Build 1.0.30, `grok-4.6-build`, effort medium)
| Run | Command | Result | Wall | Turns | Tokens in / out | Trailer |
|---|---|---|---|---|---|---|
| a | `--dry-run --range origin/main~1..origin/main` | prompt printed: 17 files, the diff (108,436 chars), the impact map with 34 `<caller>` blocks, the commit messages as intent. No call | 1 s | 0 | 0 | `grok-review: scope=pr files=17 diff_chars=108436 cached=0 turns=0 elapsed_s=0 tokens_in=0 tokens_out=0 critical=0 warning=0 suggestion=0 verdict=DRY-RUN` |
| b1 | `--range 39f6970..origin/fix/editor-inputs --files app/utils/field-draft.ts app/composables/useFieldDraft.ts app/components/editor/TextField.vue --scope block` | BLIND, exit 3: `Error: max turns reached`. Session `01a0b565-a17a-7283-b6ad-50e80cfa1f29`: 8 inferences, all with tool calls (24 `read_file`, 13 `grep`), no tool denial, no verdict | 252 s | 8 | 360,266 / 14,434 (297,984 cached) | none |
| b2 | the same, with a smaller budget named in the prompt (6) under a cap of 10 | BLIND, exit 3: the watchdog (6 min) killed it in inference 9. Session `01a0b56b-3118-7641-957d-39964105e153`: 25 `read_file`, 21 `grep`. Every assistant message was the stub `{"passed": false, "summary": "placeholder", "findings": []}` plus tool calls. Naming a budget does not stop this model | 360 s | 9+ | not recorded (killed) | none |
| b | the same + `--conclude 01a0b565-a17a-7283-b6ad-50e80cfa1f29 --ledger --branch fix/editor-inputs` | FAIL, exit 1, 2 warnings. This is what made it work: resume the session of b1, forbid tools, ask for the verdict | 66 s (+252 s of b1) | 9 | 425,768 / 17,975 (359,936 cached) | `grok-review: scope=block files=3 diff_chars=14754 cached=0 turns=9 elapsed_s=66 tokens_in=425768 tokens_out=17975 critical=0 warning=2 suggestion=0 verdict=FAIL` |
| c | `--range origin/wp/10-final..wp/10-secure --files content/unfurl.ts server/api/unfurl.post.ts --scope block --ledger --branch wp/10-secure` (`wp/10-secure` is a local branch; it is not on origin) | FAIL, exit 1, 2 warnings + 1 suggestion. Ended on its own (`end_turn`), no conclude step | 357 s | 6 | 441,589 / 20,120 (338,688 cached) | `grok-review: scope=block files=2 diff_chars=27302 cached=0 turns=6 elapsed_s=357 tokens_in=441589 tokens_out=20120 critical=0 warning=2 suggestion=1 verdict=FAIL` |
| d | run b again, without `--conclude` | cache hit: no Grok call (0 new lines in `~/.grok/logs/unified.jsonl`), the ledger stayed at the same row count | 1 s | - | - | `grok-review: scope=block files=3 diff_chars=14754 cached=1 turns=9 elapsed_s=66 tokens_in=425768 tokens_out=17975 critical=0 warning=2 suggestion=0 verdict=FAIL` |

Cost from `grok usage`: `costUsdTicks` 1,426,238,800 (b, both calls) and 1,685,944,400 (c). If a tick is 1e-10 dollar, that is about 14 and 17 cents. Four model calls in total: b1, b2, the conclude call of b, and c.
How the blind runs were read: `~/.grok/logs/unified.jsonl` filtered by the session id (`shell.turn.inference_done` per turn, `shell.tool.exec_done` per tool call, no `warn` or `error` line, no denial), then `grok export <session id>` for the tool arguments.
Note: the prompt template was edited once after run d (the schema-drift example), so a re-run of b today is a new hash and a fresh call. That is the cache rule, not a fault.

### The findings, judged
| Id | Grok says | Judgement |
|---|---|---|
| `blur-skips-stored-form` (warning, editor-state, `app/utils/field-draft.ts:87`) | After a debounced commit, a blur does not show the stored form: `commit()` returns early because the value equals the model, so `modelChanged()` / `take()` never run. A Site URL keeps its trailing slash in the input | REAL, read in the code (`commit()`, `blur()`, `modelChanged()`). The draft holds the right value; only the input text is stale. It contradicts "after the blur the input shows the stored form" in "Editor input fix". Low impact. NOT fixed here: the code belongs to another branch |
| `stored-form-test-misses-debounce-blur` (warning, test-green-wrong-reason, `tests/e2e/field-draft.spec.ts:144`) | The test named for that behavior types more text before the blur, so it never checks the case above | REAL. The test "the stored form shows only after the field lost the focus" never asserts a stripped text after a blur. NOT fixed here |
| `save-image-no-pixel-limit` (warning, second-code-path, `content/unfurl.ts:755`) | `saveImage()` decodes the website's image with sharp twice with no `limitInputPixels` / `failOn`, while `rasterizeIcon()` (607) and `fetchPicture()` (786) got the 4096x4096 limit in the security round | REAL, read in the code. sharp's own default limit (about 268 million pixels) still applies, so it is a memory-pressure gap, not an open door. The shape of S1 / S1c again: the fix reached two of three decode sites. NOT fixed here |
| `force-still-honors-304` (warning, untrusted-input, `content/unfurl.ts:946`) | `force` sends no conditional headers (C3), but a 304 answer is still accepted when a cache entry exists, so a hostile site keeps its old data through a refresh | REAL, low impact (the owner sees old text after "Refresh"). The C3 test asserts the request headers only. NOT fixed here |
| `save-image-hashes-remote-bytes` (suggestion, schema-drift, `content/unfurl.ts:762`) | The thumb file name is the hash of the REMOTE bytes; icons use the hash of the OUTPUT (`docs/security.md` layer 3) | REAL as a drift between the two paths. `writeOnce` would also keep an old WebP after a sharp upgrade. NOT fixed here |

5 findings: 5 real, 0 false positives, 0 already fixed. Both blocks had passed the review of their own branch before.

### Ledger backfill and report
`scripts/review/findings-ledger.jsonl`: 87 rows from this file (WP0 to WP10 reviews, the security round S1 to S6 and C1 to C5, the two release bugs, the `/edit` regression, the input bug) + the 5 Grok rows of today. Owner-reported bugs are `human`. The WP1 to WP3 findings (listed under WP5) carry no tool name in this file; they are split between `grok` and `ocr` by the "best catches" row of the old `docs/review-tools.md`. Every `line` is `null` but three: the notes name files, not lines.
```
# Findings ledger: 92 rows

## By category (the top one that is not `other` is the next script to write)
- other: 23
- untrusted-input: 20
- second-code-path: 10
- editor-state: 9
- test-green-wrong-reason: 8
- a11y: 7
- schema-drift: 6
- dev-route-guard: 3
- privacy-leak: 2
- bundled-path: 2
- runtime-network: 1
- docs: 1

## By source
- ocr: 35
- grok: 30
- agent: 19
- human: 8

## By severity
- warning: 69
- suggestion: 12
- critical: 11

## By area
- app/components: 14
- content/unfurl.ts: 9
- server/api: 8
- scripts/release.mjs: 8
- tests/e2e: 6
- .github/workflows: 5
- app/pages: 5
- scripts/publish.mjs: 5

findings-ledger: rows=92 top_category=untrusted-input top_count=20 grok=30 ocr=35 agent=19 human=8
```
Reading: `untrusted-input` leads (20), and its scripted checks exist since the security round (`unfurl.spec.ts`, `security.spec.ts`, `security-dev.spec.ts`). Next without a scripted check: `second-code-path` (10). Candidate: a test that fails when a `sharp(` call in `content/` has no `limitInputPixels`, or when `content/`, `scripts/` or `server/` call `fetch(` outside `content/unfurl.ts` and `content/gravatar.ts`.

### Verification output (last lines)
```
$ npm run lint                                  -> exit 0
$ npm run typecheck                             -> exit 0
$ npm run test:review
grok-review.test: passed=94 failed=0 total=94 expected=94
$ bash scripts/review/grok-review.sh --help     -> prints the usage (options, exit codes, the trailer)
```

### Open
- The 5 real findings above are not fixed. Two small fix branches: `fix/field-draft-stored-form` (one `take()` after a passed check without focus + the missing test) and `fix/unfurl-image-limits` (the sharp limits in `saveImage()`, refuse a 304 under `force`, hash the WebP).
- The case "the conclude call fails too" did not happen in a real run. Only the fake covers it.
- Resuming a session that the watchdog KILLED (run b2) was not tried. `--conclude` on a session that ended at the turn cap works (run b).
- The Grok CLI reads `~/.grok` of the user. CI runs the suite with the fake binary only; no real review runs in CI.


## WP14 review round

Branch `wp/14-reviewed` (from `origin/wp/13-integration`, plus the merge of `origin/chore/grok-review-pipeline`). Date: 2026-09-18. Work was done in a separate git worktree. Not merged into `main`, no tag. Goal: review the new code of WP11 second wave, WP12 Pexels and the WP13 integration with the pipeline, block by block (the author was not Grok), and fix what is real.

### The merge
Conflicts: `NOTES.md` (both sections kept whole, "WP13 integration" then "Review pipeline") and `README.md` > "More docs" (the union; `docs/security.md` keeps the Pexels words). `package.json`, `CLAUDE.md`, `PLAN.md` and `.github/workflows/ci.yml` merged by git: one Scripts table, each script once; `ci.yml` has the `npm run test:review` step AND the Pexels canary env on the generate step.

### Blocks (range `origin/main..HEAD`, `--scope block --ledger --branch wp/13-integration`)
| Block | Files of the block | files | diff_chars | turns | elapsed_s | tokens in / out | Verdict | Cost |
|---|---|---|---|---|---|---|---|---|
| B1 network core | `content/unfurl.ts content/link-check.ts content/pexels.ts` | 3 | 27,907 | 9 | 353 | 687,768 / 17,172 | PASS, 0 findings. Verdict forced at the turn cap (8) by the automatic conclude call | $0.20 |
| B3 public data | `types/profile.ts types/site.ts modules/public-profile.ts content/site-extras.ts content/site-files.ts app/utils/{vcard,site-head,schedule,utm,networks}.ts scripts/validate-profile.ts` | 11 | 39,327 | 2 | 150 | 83,814 / 7,782 | FAIL, 1 warning. **Diff-only verdict**: the run ended on a 1-turn stub, `--conclude` wrote the verdict from the pasted diff and the impact map, no file was read (the summary says so) | $0.05 |
| B2 + B6 dev routes and scripts | `server/api/images/pexels server/api/links server/api/site server/api/save.post.ts server/utils/pexels.ts server/utils/editor.ts scripts/{check-links.ts,publish.mjs,fetch-links.ts,build-site-assets.ts}` | 11 | 20,177 | 14 | 400 | 2,088,169 / 19,187 | FAIL, 2 warnings. A full run | $0.49 |
| B4 public UI | `app/components/{BentoGrid,ProfileHeader,ShareButton}.vue app/components/blocks app/pages/index.vue` | 11 | 19,422 | 8 | 537 | 699,970 / 28,372 | PASS, 0 findings. A full run | $0.31 |
| B5a editor UI, Pexels | `app/components/editor/{PexelsPicker,ImagePicker,TextField,BlockForm,PreviewTile}.vue` | 5 | no trailer | 1 | - | - | **NOT REVIEWED.** Blind (1-turn stub), then the conclude call was killed by its 3 minute watchdog | $0.03 + the killed call |
| B5b editor UI, WP11 panels | the rest of `app/components/editor/` + `app/composables/` | - | - | - | - | - | **NOT REVIEWED.** The budget of 9 calls was spent | - |

Trailer lines, as printed:
```
grok-review: scope=block files=3 diff_chars=27907 cached=0 turns=9 elapsed_s=353 tokens_in=687768 tokens_out=17172 critical=0 warning=0 suggestion=0 verdict=PASS
grok-review: scope=block files=11 diff_chars=39327 cached=0 turns=2 elapsed_s=150 tokens_in=83814 tokens_out=7782 critical=0 warning=1 suggestion=0 verdict=FAIL
grok-review: scope=block files=11 diff_chars=20177 cached=0 turns=14 elapsed_s=400 tokens_in=2088169 tokens_out=19187 critical=0 warning=2 suggestion=0 verdict=FAIL
grok-review: scope=block files=11 diff_chars=19422 cached=0 turns=8 elapsed_s=537 tokens_in=699970 tokens_out=28372 critical=0 warning=0 suggestion=0 verdict=PASS
```

B2 and B6 ran as one block (20,177 characters: the link check route and `check-links.ts` share one engine) to save a call. B5 (67,299 characters) was split before the first try. From B3 on the runs used `--max-turns 14 --timeout 12`: with 8 turns B1 hit the cap and paid for a conclude call; with 14 no run hit the cap. B3 was reviewed at the merge commit; B2, B4 and B5a at later heads that already held the first fixes (the range is `origin/main..HEAD`).

### Blind runs
| Run | What happened | What was done |
|---|---|---|
| B1, try 1 | exit 3. Grok ended after ONE turn with the progress stub (`"passed": false`, "Starting independent review...", no finding) and no tool call (`stopReason: end_turn`, 41k tokens in, $0.03) | Started again: a conclude on a session that read nothing is a diff-only verdict. Try 2 gave the verdict. This is a deviation from "conclude first" |
| B3, try 1 | the same stub after one turn | `--conclude 8af7e8e6-fa21-4e6f-80e3-eb441b48172a`: a schema-valid verdict with 1 real warning, but from the diff only |
| B5a, try 1 | the same stub after one turn | `--conclude 3b4cfd26-cb8b-4055-b847-00af90937609`: killed by the 3 minute watchdog of the conclude step, exit 3. First real case of "the conclude call fails too". Given up: the budget was spent |

Pipeline finding (ledger `review-run-ends-on-first-progress-stub`, OPEN): 3 of 6 fresh calls ended on a 1-turn stub. The guard catches it (exit 3, never green). But it prints no session id for this case (it is in `<hash>.raw.json` > `sessionId`), and the conclude prompt forbids tools, so the verdict that follows read nothing. Next step for the pipeline: resume a 1-turn stub once WITH tools ("continue the review") before the no-tools conclude.

Grok calls: 9 of 9 (3 stubs, 4 review runs, 2 conclude calls by hand; the automatic conclude of B1 is inside its run and its cost). Cost: about $1.15 ($0.20 + $0.05 + $0.49 + $0.31 + 3 stubs at $0.03 + the killed conclude).

### Findings and triage
| Finding | Source | Triage | Fix |
|---|---|---|---|
| `utm-panel-ignores-env-site-url` (warning, second-code-path, `UtmPanel.vue:56`) | Grok B3 | REAL. `resolveSiteUrl('', site)` in the panel. And `toPublicProfile` used `build.envSiteUrl or site.url`, a second definition: an env value that is not a URL (`ada.example`) switched the "same site, no tags" rule off | `d7fc86f`: both use `resolveSiteUrl(env, site)`. Test in `second-wave.spec.ts` (fails before) |
| `draft-assets-deletes-saved-contact-and-qr` (warning, editor-state, `server/api/site/assets.post.ts:29`) | Grok B2 | REAL. `buildSiteExtras()` removes `contact.vcf` and `qr.svg` when the profile does not want them, and the route passes the DRAFT (invariant 8) | `2b33a7e`: option `draft: true`, a draft writes and never removes. Test (fails before) |
| `publish-skipped-link-check-reported-clean` (warning, other, `scripts/publish.mjs:698`) | Grok B2 | REAL. Checked by hand: an invalid `content/profile.json` gives `links: check skipped`, exit 0, and publish printed "No broken link found." | `e2b9469`: `--broken-only` ends with `links checked: N` (`brokenOnlyReport()`), publish asks for that line. A test compares the two copies of the text |
| F1 `blur-skips-stored-form` + `stored-form-test-misses-debounce-blur` (`app/utils/field-draft.ts`) | Grok, earlier run | REAL | `bfcec78`: a passed check without the focus shows the stored form. 2 tests ("debounced commit, then blur" fails before) |
| F2 `save-image-no-pixel-limit` (`content/unfurl.ts`, `saveImage`) | Grok, earlier run | REAL | `9d12326`: `limitInputPixels` 4096x4096 + `failOn: 'error'`, and the output is sniffed. Test with a 5000x5000 PNG of a few KB (fails before: the thumb was written) |
| F3 `save-image-hashes-remote-bytes` | Grok, earlier run | REAL | `5d3a8b6`: the name is the hash of the stored WebP. Test (fails before) |
| F4 `force-still-honors-304` | Grok, earlier run | REAL | `8743b44`: a 304 counts only when OUR condition was sent. Else `http 304`, the old entry stays, the editor gets `ok: false`. Test with a server that always answers 304 (fails before) |
| F5 `pexels-pick-keeps-refused-alt` (`ImagePicker.vue`) | integration report | REAL | `22a00ad`: the text in the FIELD decides (`EditorTextField` exposes `text()` and `sync()`). Dev test, also "the same photo again" (fails before) |
| F6 `site-assets-decodes-without-pixel-limit` | agent | REAL, small. `avatarArt`, `avatarDataUri` and the og image upload decoded files with no limit; `uploadArt` and `site-upload.ts` had 8192x8192 | `68f3d19`. No test: it needs an 81 megapixel file |
| F6 `gravatar-stores-remote-bytes` (`content/gravatar.ts:103`) | agent | REAL, **OPEN**. The Gravatar body is stored as it came (Content-Type only, raw `fetch`, no magic bytes, no re-encode): invariants 10 and 12. Not in the diff of this branch. The fix (through `fetchPicture()`) changes what Nitro bundles for a route with a static import, and needs a live check | not fixed |

F6, what was checked. `content/pexels.ts`: pixel limit (8192x8192, documented), `failOn: 'error'`, magic bytes before the decode and on the output, temp file + rename; the name is `pexels-<id>.webp` from the validated number id, never from remote data. No drift. `content/site-upload.ts`: limits on every decode, the format is checked against the extension, random name; a raster upload of the owner is stored as it came by design (not remote bytes). `content/site-assets.ts`: fixed above.

Grok findings of this round: 3, all real, 0 false positives, no critical.

### Ledger report
```
# Findings ledger: 99 rows

## By category (the top one that is not `other` is the next script to write)
- other: 25
- untrusted-input: 21
- second-code-path: 12
- editor-state: 11
- test-green-wrong-reason: 8
- a11y: 7
- schema-drift: 6
- dev-route-guard: 3
- privacy-leak: 2
- bundled-path: 2
- runtime-network: 1
- docs: 1

## By source
- ocr: 35
- grok: 33
- agent: 23
- human: 8

## By severity
- warning: 75
- suggestion: 13
- critical: 11

## By area
- app/components: 16
- server/api: 9
- content/unfurl.ts: 9
- scripts/release.mjs: 8
- tests/e2e: 6
- scripts/publish.mjs: 6
- .github/workflows: 5
- app/pages: 5

findings-ledger: rows=99 top_category=untrusted-input top_count=21 grok=33 ocr=35 agent=23 human=8
```

### Verification
```
$ npm ci                                   -> ok
$ npm run lint                             -> ok
$ npm run typecheck                        -> ok
$ npm run test:review                      -> passed=94 failed=0 total=94 expected=94
$ PEXELS_API_KEY=<canary> npm run generate -> ok; dist/_headers, dist/site/contact.vcf; no dist/edit; 0 svg under dist/icons
$ grep -r "hello@example.com" dist | wc -l -> 0
$ E2E_STATIC_PORT=4441 E2E_DEV_PORT=3441 npx playwright test   (ONE run, both projects)
    static: 229 passed, 2 skipped   dev: 77 passed   total: 306 passed, 2 skipped
$ npm run check:icons                      -> exit 0
$ npm run check:links                      -> exit 0 (6 ok, 4 broken: links of the sample profile)
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks -> exit 0
```
The 2 skips are the two "example only" tests (`privacy.spec.ts` "the example email is in no file of dist/", `second-wave.spec.ts` "no qr tile and no qr file without a site URL"): the `predev` of the dev server creates `content/profile.json` before they start. New tests: static +7 (field-draft 2, unfurl 2, second-wave 3; 1 unfurl test extended), dev +1.

### Open
- B5 (the editor UI of WP11 and WP12, 67,299 diff characters) has NO Grok verdict. Run it again in two halves with `--max-turns 14 --timeout 12`.
- B3 has a diff-only verdict. The reviewer did not read `modules/public-profile.ts` and `app/utils/schedule.ts`. The privacy tests (`privacy.spec.ts`, `second-wave.spec.ts`) are green.
- `content/gravatar.ts` (above).
- The pipeline: resume a 1-turn stub with tools; print the session id for every blind run.


## WP15 review follow-up

Branch `wp/15-review-followup` (from `origin/main`). Date: 2026-09-18. Work was done in a separate git worktree. Not merged into `main`, no tag. Goal: harden the review pipeline against the 1-turn stub, finish the review of the WP11 / WP12 editor UI that WP14 skipped for budget, review B3 again with full evidence, and close the open drift `gravatar-stores-remote-bytes`.

### A. The pipeline (`scripts/review/`, commit `25aec54`)
- **A1, stub retry.** `grok-verdict.py is-stub`: `stopReason` `end_turn`, and `num_turns` 1 or less (or 0 tool calls in `grok export`), and no valid verdict (nothing schema-shaped, or `passed: false` with no finding). Then ONE automatic call: `--resume <session>`, the same read-only tools, `--max-turns` = the rest of the budget, the prompt "You stopped after announcing your plan. Continue now: use your tools, then return ONLY the JSON verdict." A second stub is exit 3. `retries=N` in the trailer and in `_meta`.
- **A2, the session id.** `grok-review: session <id>` on stderr at the start of every call. Every exit 3 goes through one function (`blind_exit`): raw output kept as `<hash>.raw.json`, the session id with the command that resumes it, and a trailer on stdout with `verdict=BLIND session=<id>`.
- **A3, conclude.** `--conclude <id>` counts the tool calls of the session with `grok export <id>` (Markdown: one `## Tools` section per tool turn, one `- Read:` / `- Search:` / `- List:` line per call; only sections after the first `## Assistant` count, because the prompt pastes source that can hold any heading). 0 calls = refused, exit 3, with the advice `--conclude-tools` (resume WITH tools, `--max-turns` turns, the `--timeout` watchdog) or a new run. `grok usage` has no tool count and the JSON envelope has none either, so the export is the source. `evidence=full|diff-only` in the trailer and in `_meta`; without an export the fallback is the turn count.
- **A4, defaults.** `--max-turns 14`, `--timeout 12`, conclude watchdog 5 minutes (was 3: WP14 lost a conclude call to it).
- **A5, fewer stubs at the source.** `grok --help` (1.0.30) has `--no-plan` ("Disable plan mode") and `--rules` ("Extra rules to append to the system prompt"); no `--append-system-prompt`. All calls now pass `--no-plan` and a `--rules` line, and the prompt opens with "Do not announce a plan. Your FIRST action must be a tool call; your LAST message must be only the JSON verdict." **Measured: 1 stub in 4 fresh calls (B5a, B5b1, B3 no stub; B5b2 stub after 14 s). Before: 3 in 6.** The sample is too small to say that it helped, and the three changes were not measured one by one. What is certain: the stub still happens with all three in place, so the retry (A1) is the part that matters. It worked on its first real case: B5b2, stub, automatic retry with 13 turns, a verdict with `evidence=full`. Cost of that stub: $0.027.
- **A6, the suite.** `grok-review.test.sh`: 130 assertions (was 94). New: stub then a good retry (same session, continue prompt, tool allowlist, 13 turns, `retries=1`, `evidence=full`, `session=`, turns of both calls, the cache keeps the fields), the text form of the stub, stub twice = exit 3 after two calls with the session id and a BLIND trailer as the last line, a diff-only verdict and its report label, the refused tool-less conclude, `--conclude-tools`, no `grok export` (fallback), the new defaults, `--no-plan`, the first line of the prompt, `--help`.
- Also: the envelope checks moved from a heredoc to `scripts/review/grok-verdict.py` (two modes). `GROK_REVIEW_CACHE_DIR` moves the cache: a worktree agent may not read `<git common dir>`. The runs of this round used `/tmp/wp15-grok-cache`, so they are not in the shared cache.

### B. The blocks (range `df09fa4..origin/main`, `--scope block --ledger --branch main`, defaults 14 turns / 12 minutes)
| Block | Files | diff_chars | Grok calls | turns | elapsed_s | tokens in / out | Verdict | Cost |
|---|---|---|---|---|---|---|---|---|
| B5a editor UI, Pexels | `PexelsPicker.vue ImagePicker.vue TextField.vue` | 23,804 | 1 | 6 | 423 | 385,379 / 21,067 | FAIL, 2 warnings. Ended on its own | $0.19 |
| B5b1 site panels | `ContactPanel QrPanel SharePanel SiteExtras SitePanel UtmPanel` + `useSiteDraft.ts` | 20,856 | 2 (review + conclude at the cap of 14) | 15 | 580 | 1,154,221 / 28,584 | FAIL, 2 warnings | $0.34 |
| B5b2 block fields | `BlockAdvanced BlockExtraFields BlockForm BlockList BlockRowBadges LinkCheckButton PreviewTile` + `useEditor.ts useLinkCheck.ts` (`useFieldDraft.ts` has no change in the range) | 24,504 | 3 (stub, automatic retry, conclude at the cap) | 15 | 464 | 1,317,545 / 21,782 | FAIL, 2 warnings | $0.38 |
| B3 public data, again | `types/profile.ts types/site.ts modules/public-profile.ts content/site-extras.ts app/utils/{vcard,schedule,site-head}.ts` | 32,030 | 1 | 8 | 454 | 761,497 / 23,349 | FAIL, 1 warning. Ended on its own | $0.24 |

B5b was one block of 45,360 diff characters (a prompt of 183,542 characters). It was split in two before the first call: the B3 session of WP14 had its prompt partly offloaded at that size. The 19 editor files that WP11 and WP12 changed are all in B5a, B5b1 or B5b2. All four verdicts have `evidence=full`.

Trailer lines, as printed:
```
grok-review: scope=block files=3 diff_chars=23804 cached=0 turns=6 elapsed_s=423 tokens_in=385379 tokens_out=21067 retries=0 evidence=full session=f745f3b4-2854-4b1c-b84a-e323a84588c7 critical=0 warning=2 suggestion=0 verdict=FAIL
grok-review: scope=block files=7 diff_chars=20856 cached=0 turns=15 elapsed_s=580 tokens_in=1154221 tokens_out=28584 retries=0 evidence=full session=87ff0d56-0e7d-4e76-96f7-8e88e8498c6e critical=0 warning=2 suggestion=0 verdict=FAIL
grok-review: scope=block files=9 diff_chars=24504 cached=0 turns=15 elapsed_s=464 tokens_in=1317545 tokens_out=21782 retries=1 evidence=full session=7664a9a9-d061-4c65-b353-df1ed886b501 critical=0 warning=2 suggestion=0 verdict=FAIL
grok-review: scope=block files=7 diff_chars=32030 cached=0 turns=8 elapsed_s=454 tokens_in=761497 tokens_out=23349 retries=0 evidence=full session=5ed00220-f780-4f81-b6ef-2bb1b384bfda critical=0 warning=1 suggestion=0 verdict=FAIL
```
Grok calls: 7 of 7 (4 review calls, 1 automatic retry, 2 conclude calls). Cost from `grok usage`: $1.15. Two of four blocks hit the cap of 14 turns and paid about 3 cents for the conclude call: 14 is not "never hit" any more.

### Findings and triage
| Finding | Block | Triage | Fix |
|---|---|---|---|
| `pexels-pick-lost-on-tab-switch` (warning, editor-state, `ImagePicker.vue:207`) | B5a | REAL. The Pexels panel had `v-if`; Vue drops `emit` of an unmounted component (`runtime-core`: `if (instance.isUnmounted) return`). The new dev test failed first: the file was "saved" and the block kept `/blocks/sample.jpg` | `94b2f8f`: the panel mounts on its first open and stays under `v-show`, keyed by the block id (another block starts again, so a late answer never patches the wrong block) |
| `load-more-focus-clamped-to-old-grid` (warning, a11y, `PexelsPicker.vue:187`) | B5a | FALSE POSITIVE. `photos.value` is set inside `search()`, so Vue's flush is queued before the continuation of `await search()` in `loadMore()`: the new buttons exist when `focusPhoto()` reads them. The existing test asserts the exact repro and is green (`pexels-editor.spec.ts`, "Load more adds page 2 and moves the focus to its first photo", 3 photos then `444444` focused) | none |
| `qr-caption-mismatches-file` (warning, editor-state, `QrPanel.vue:97`) | B5b1 | REAL. The caption showed the site URL of the draft under a file made for another URL. The new dev test failed first ("Received: https://new.example/") | `6e41c25`: three states. `current` = "Opens <url>" (made in this session for this URL), `stale` = says both URLs and hides the downloads, `unknown` = a file of the last build, no claim |
| `qr-make-leaves-site-previews-stale` (warning, second-code-path, `QrPanel.vue:47`) | B5b1 | REAL, small. `POST /api/site/assets` writes every file of `public/site/`, and each panel had its own `?v=` stamp | `6e41c25` (the same commit: the caption needs the shared `qrUrl`): `app/composables/useSiteAssets.ts`, one stamp and one `qrUrl` for both panels. Same test |
| `draft-extras-overwrite-saved-files` (warning, editor-state, `content/site-extras.ts:80`) | B3 | REAL for the contact card, BY DESIGN for the QR code. WP14 (`2b33a7e`) only stopped the deletes. A typed, unsaved public email went into `public/site/contact.vcf`, the file the dev page hands out. The QR code from the draft is what "Make the QR code" is for; favicons and the social image are drawn from the draft since WP10b. Nothing unsaved reaches `dist/`: `pregenerate` draws all of them again from the saved file | `420a5c7`: a draft never writes `contact.vcf` (test fails before). `docs/invariants.md` 8 now states the exception for the generated previews. **For the architect:** this narrows an invariant in words; say no if the QR code should also wait for the save |
| `schedule-datetime-local-value-overwrite` (warning, editor-state, `BlockAdvanced.vue:143`) | B5b2 | FALSE POSITIVE. Two reasons. The 30 s clock does not render the form again: the template reads the computed `state`, a string that stays the same (Vue 3.5 does not trigger then). And a half-typed `datetime-local` has the value `''` and the browser fires `change` for that, so `local` equals `el.value` and a new render writes nothing back. Checked with a new dev test that passed WITHOUT a code change | `4092213` keeps that test as a guard |
| `qr-size-select-disagrees-with-schema` (warning, schema-drift, `BlockForm.vue:161`) | B5b2 | REAL. The select listed the 4 `SIZES`, `QrBlockSchema` takes `QR_SIZES` (1x1, 2x2). Dev test fails before | `4092213`: the options come from `QR_SIZES` for a `qr` block |

7 Grok findings: 5 real (all fixed), 2 false positives, 0 already fixed, no critical. The fixes of this branch have NO Grok verdict of their own: the budget of 7 calls was spent. Next review: `npm run review -- --range origin/main..wp/15-review-followup --files app/components/editor app/composables content/site-extras.ts` and `--files content/gravatar.ts content/gravatar-fetch.ts server/api/avatar scripts/fetch-avatar.ts`.

### C. `gravatar-stores-remote-bytes` (commit `0db06fd`)
- Before: raw `fetch` with `redirect: 'follow'`, a Content-Type check, the body stored as it came as `public/avatar.gravatar.jpg`.
- Now, the same rules as the icons and images (invariants 10 and 12): `safeRequest()` of `content/unfurl.ts` with `onlyHosts` = `gravatar.com`, `www.gravatar.com`, `secure.gravatar.com` (`https` on every hop), 2 MB while reading, magic bytes (JPEG, PNG, WebP) BEFORE the decode, sharp with `limitInputPixels` 4096x4096 and `failOn: 'error'`, `rotate()`, inside 512x512 without enlargement, a new WebP with no metadata, the output sniffed again, one budget of 8 s. The hosts were measured with `curl -sIL`: all three answer 200 (`image/png`) or 404 directly. No redirect and no image CDN host, so no other host is allowed.
- The file is `public/avatar.gravatar.webp` (`GRAVATAR_PUBLIC_PATH` in `types/profile.ts`; the sanitizer, `content/site-assets.ts`, the editor preview and the module watcher all read that constant or `GRAVATAR_FILE`). `.gitignore` `public/avatar.*` covers it (`repo.spec.ts`). A good download removes the old `avatar.gravatar.jpg`; so does a 404 that may delete. Kept: `allowDelete`, the atomic write, the three one-line messages, never a throw.
- **The WP7 lesson.** The download moved to `content/gravatar-fetch.ts`. `content/gravatar.ts` stays light (names, hash, "is the file there?") because `GET /api/avatar/gravatar`, `modules/public-profile.ts` and `content/site-assets.ts` import it statically. `POST /api/avatar/gravatar` loads the download with `import.meta.dev ? await import(...) : null`, as `/api/unfurl` does. Checked live: `npm run dev -- --port 3452`, after 25 s `GET /api/avatar/gravatar` 200 `{ "exists": false }`, `GET /api/profile` 200, `POST /api/avatar/gravatar` with an unknown email 200 `avatar: no gravatar for this email` (a real request through the pinned connection), 0 lines with `error` in the log. `npx nuxt build`: `grep -rl tilebox-unfurl .output/server` = 0 files.
- `tests/e2e/gravatar.spec.ts`: 13 tests with a mocked `transport` and `lookup` (was 5 with a `globalThis.fetch` stub). Run first against the OLD logic behind the new seam: 7 failed (SVG body with an `image/jpeg` header stored, fake JPEG stored, text stored, a good PNG stored byte for byte, 5000x5000 stored, a redirect to `evil.example` followed, the old-name file left). All 13 pass now.
- Ledger: a new row `gravatar-stores-remote-bytes` on this branch, "FIXED in 0db06fd" (the ledger has no status field; the OPEN row stays). The same for `review-run-ends-on-first-progress-stub` ("FIXED in 25aec54").

### Ledger report
```
# Findings ledger: 108 rows

## By category (the top one that is not `other` is the next script to write)
- other: 26
- untrusted-input: 22
- editor-state: 15
- second-code-path: 13
- test-green-wrong-reason: 8
- a11y: 8
- schema-drift: 7
- dev-route-guard: 3
- privacy-leak: 2
- bundled-path: 2
- runtime-network: 1
- docs: 1

## By source
- grok: 40
- ocr: 35
- agent: 25
- human: 8

## By severity
- warning: 84
- suggestion: 13
- critical: 11

## By area
- app/components: 22
- server/api: 9
- content/unfurl.ts: 9
- scripts/release.mjs: 8
- tests/e2e: 6
- scripts/publish.mjs: 6
- .github/workflows: 5
- app/pages: 5

findings-ledger: rows=108 top_category=untrusted-input top_count=22 grok=40 ocr=35 agent=25 human=8
```

### Verification
```
$ npm ci                                   -> ok
$ npm run lint                             -> ok
$ npm run typecheck                        -> ok
$ npm run test:review                      -> passed=130 failed=0 total=130 expected=130
$ npm run generate                         -> ok (avatar: placeholder email, gravatar skipped)
$ grep -r "hello@example.com" dist | wc -l -> 0
$ E2E_STATIC_PORT=4451 E2E_DEV_PORT=3451 npx playwright test   (ONE run, both projects)
    static: 238 passed, 2 skipped   dev: 81 passed   total: 319 passed, 2 skipped
$ npm run check:icons                      -> exit 0
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks -> exit 0
$ npx nuxt build; grep -rl tilebox-unfurl .output/server | wc -l -> 0
```

### Open
- The fixes of this branch are not reviewed by another model yet (see the two commands above).
- A5 is not proven. To measure it: count `retries=` over the next 20 trailers.
- `docs/invariants.md` 8 got one stated exception. The architect decides if it stays.
- The dev server prints Vue hydration warnings for `/` while the dev tests rewrite `content/profile.json`. They were already in the first dev run of this branch, before any editor change. Not looked into.
- Still open from before: WP12 needs Ricardo's real Pexels key for one live check; a real Gravatar 200 was only tested with a mocked transport (the live check was a 404).
The 2 skips are the two "example only" tests of WP14 (`privacy.spec.ts` "the example email is in no file of dist/", `second-wave.spec.ts` "no qr tile and no qr file without a site URL"): the `predev` of the dev server creates `content/profile.json` before they start. New tests: static +9 (gravatar 13 for 5, second-wave +1), dev +4 (pexels-editor +1, second-wave-editor +3).

## WP18. Two icon sets, local search

Branch `wp/18-icon-sets`. Date 2026-09-18. Plan: `PLAN.md` section 5.5 and section 8 `WP18`.
Ricardo asked for it in these words: "We need to limit all the icons possibilities. Let's support simple-icons and line-md by default. Let's make the search only look into these libraries in the search box."

### For the owner of `app/components/editor/IconPicker.vue`
- **Swap the result preview `img` src to `/api/icons/svg?name=`.** `previewUrl()` (line 38) still builds `https://api.iconify.design/<prefix>/<icon>.svg?color=%23<inkHex>`. The new dev route takes the same two values: `/api/icons/svg?name=<prefix:name>&color=<rrggbb>` (no `#`, six hex digits). Then the editor makes no `api.iconify.design` request at all. Nothing else in that file has to change: `/api/icons/search` keeps its `{ icons: string[] }` shape.

### What changed
- `app/utils/icon-sets.ts` (new) is the ONE list: `ICON_SETS = ['line-md', 'simple-icons']`, `IconSet`, `ICON_NAME_RE` (`^(line-md|simple-icons):[a-z0-9]+(?:-[a-z0-9]+)*$`, built from the list), `isAllowedIconName()`, `iconSetOf()`, `iconSetUrl()`, `ICON_SETS_TEXT`, `ICON_SETS_MESSAGE`. Client-safe: no node import, so the schema, the app, the server, the scripts and the tests all read the same file.
- `types/profile.ts`: `iconName` is `z.string().regex(ICON_NAME_RE, ICON_SETS_MESSAGE)`. The message is "Use an icon from line-md or simple-icons". The old pattern took any prefix.
- `content/migrate.ts`: `migrateIconsText()` removes an `icon` of another set from its block, plus `foreignIcons()`, `removedIconLine()` and `foreignIconAdvice()`. Called from `scripts/ensure-profile.ts` (so it runs in `predev`). It cuts the `"icon": "..."` line when it can, so a hand-made file keeps its own layout; otherwise it rewrites 2-space JSON with a final newline. Idempotent. `content/profile.example.json` is never touched. `scripts/validate-profile.ts` adds one advice line when a build hits such an icon (a build never changes your file).
- `content/icon-index.ts` (new) is the local index and the ONE rule. `iconStatus()` / `iconProblem()` (allowed set AND exists AND not hidden), `searchIcons()`, `defaultIcons()`, `buildIconSvg()`, `iconIndexStats()`. The packs are found with `createRequire(resolve(ROOT, 'package.json'))`: from `ROOT` of `content/resolve.ts`, never from the file's own location (Nitro bundles it into `.nuxt/`, the bug that broke `/api/profile` once).
- `server/api/icons/search.get.ts`: no more `fetch` of `api.iconify.design`. It loads the index under `import.meta.dev` only, then `assertEditorRequest(event, 'none')`, then zod (`q` once, an array is a 400). Answer `{ icons, sets, total }`, 48 names at most.
- `server/api/icons/svg.get.ts` (new): `GET /api/icons/svg?name=<prefix:name>[&color=<rrggbb>]` -> `image/svg+xml`, `Cache-Control: max-age=3600`, and the sandbox CSP + `nosniff` of the asset folders through a `routeRules` entry in `nuxt.config.ts`. 400 for another set or a bad shape, 404 for a missing or hidden icon.
- `server/utils/editor.ts`: `checkIcons()` is now four lines over `iconProblem()`. The pack loader, its zod schemas and its cache moved to the index, so save and `check:icons` cannot drift apart.
- `scripts/check-icons.ts`: same rule, one message per problem, both collection links. It reads the raw profile JSON instead of `parseProfile()`, so a foreign name gets this script's message and not a schema error.
- `nuxt.config.ts`: `iconsIn()` and the dev brand list drop a name outside the two sets instead of asking `@nuxt/icon` to bundle it.

### Ranking (the search)
Query: lower case, trimmed, cut to 64 characters, split on spaces and hyphens. 0 exact name, 1 name starts with the query, 2 every token starts a name segment, 3 name contains the query. Ties: `line-md` before `simple-icons`, then the shorter name, then the alphabet. A query that is itself an allowed name and exists is the FIRST result. An empty query gives `UI_ICONS` + the networks, so the grid is never blank.
`mail` shows the rule at work: `simple-icons:mailbox` (starts with) comes before `line-md:email` (contains). That is the spec, not a bug.

### Numbers (2026-09-18, this machine)
| Set | names in the pack | hidden | in the index |
|---|---|---|---|
| `line-md` | 1279 | 15 | 1264 |
| `simple-icons` | 3745 | 275 | 3470 |
| both | 5024 | 290 | 4734 |

Hidden = the brands simple-icons removed, plus their aliases (`simple-icons:linkedin`, `simple-icons:slack`, `simple-icons:amazonaws` -> hidden parent). `line-md:linkedin` is there.
Index build 61 ms (budget 1500 ms). One query: `mail` 1.4 ms, `github`/`a` 2.0 ms, `you tube` 7.3 ms (budget 50 ms). Built once per dev process.

### Checks
```
$ npm ci                                   -> exit 0
$ npm run lint                             -> exit 0
$ npm run typecheck                        -> exit 0
$ npm run test:review                      -> exit 0 (passed=130 failed=0)
$ npm run check:icons                      -> exit 0 (68 icons, line-md and simple-icons)
$ npm run generate                         -> exit 0
$ grep -r "hello@example.com" dist | wc -l -> 0
$ npx playwright test                      -> 353 passed, 2 skipped (static 262, dev 91)
$ node scripts/release.mjs --dry-run --no-ai --skip-tests --skip-checks -> exit 0
$ npm run dev -- --port 3482               -> /edit 200, /api/icons/search?q=mail 200,
                                              /api/icons/svg?name=line-md:email 200 image/svg+xml,
                                              0 ERROR lines in 20 s
```
New tests: static +24 (`icons.spec.ts`), dev +10 (`icons-dev.spec.ts`).
The 2 skips are the same two "example only" tests as before (`privacy.spec.ts` "the example email is in no file of dist/", `second-wave.spec.ts` "no qr tile and no qr file without a site URL"): the `predev` of the dev server creates `content/profile.json` before the static project reads it, so `profileIsPersonal()` is true and both skip themselves.
Live migration check: two foreign icons put into `content/profile.json` by hand, then `npm run ensure:profile` printed
`profile: removed icon "lucide:mail" from block b1 (only line-md and simple-icons are supported)` and the same line for `mdi:home` / block `b7`. A second run printed nothing.

### Open
- The `IconPicker.vue` preview `img` still calls `api.iconify.design`. One line for its owner, above. Until then the editor makes one foreign request per shown result; the search itself makes none.
- No Grok verdict for this branch yet (`npm run review -- --range main..wp/18-icon-sets --files <block>`).
- A pack update can hide more brands. `npm run check:icons` runs in `pregenerate`, so a build says so; the profile keeps the name until you change it (the migration only removes a FOREIGN set, never a hidden icon, so nothing is lost silently).
