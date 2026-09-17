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
ℹ Nuxt Icon client bundle consist of 25 icons with 21.68KB(uncompressed) in size
(exit 0)
```

`npm run generate`
```
[nitro]   ├─ /_payload.json (1ms)
[nitro] ℹ Prerendered 4 routes in 0.692 seconds
[nitro] ✔ Generated public .output/public
[nitro] ✔ You can preview this build using npx serve .output/public
│
└  ✨ You can now deploy .output/public to any static hosting!
(exit 0)
```
