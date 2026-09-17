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
[@nuxt/fonts] ✔ Fonts downloaded and cached.
[nitro] ✔ Generated public .output/public
[nitro] ✔ You can preview this build using npx serve .output/public
│
└  ✨ You can now deploy .output/public to any static hosting!
(exit 0)
```

`dist/` check: `test -f dist/index.html && ! test -e dist/edit` passes. `dist/og.png` present, 32893 bytes.
