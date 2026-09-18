# Tilebox

Bento-style personal link page. One profile, a grid of tiles you arrange yourself.
Edit locally in the browser, commit a JSON file, host it static on Cloudflare Pages.

## Features

- Profile block: avatar, name, handle, bio, status line.
- Seven tile types: link, social, image, text, section, map, video.
- Four tile sizes on a 4-column grid. Separate tile order for desktop and phone.
- Presets like PowerPoint: 3 color presets and 3 font presets. Light, dark and system mode.
- Local editor at `/edit`: drag tiles, edit text, pick icons, save. Never shipped to production.
- Static output. No backend, no database, no runtime network calls on the public page.

## Quick start

```sh
npm install
npm run dev
```

1. Open http://localhost:3000/edit.
2. Edit your profile and tiles. Click **Save**. This writes `content/profile.json`.
3. `git commit` and `git push`. Your host builds and publishes the page.

Restart `npm run dev` after you change the color preset, the font preset or an icon name.
`nuxt.config.ts` reads `profile.json` once at start to pick fonts and bundle icons.

## Editing by hand

Everything lives in `content/profile.json`. The schema is in `types/profile.ts` (zod).
Run `npm run check:profile` to validate it.

```json
{
  "profile": {
    "name": "Ricardo Vargas",
    "handle": "ricardov03",
    "bio": "Front-end developer.",
    "status": "Now building CONDOMERA",
    "theme": { "colors": "condomera", "fonts": "geist", "mode": "system" }
  },
  "blocks": [
    { "id": "b1", "type": "link", "size": "2x1", "title": "CONDOMERA", "url": "https://example.com", "accent": true },
    { "id": "b2", "type": "social", "size": "1x1", "network": "github", "url": "https://github.com/ricardov03" },
    { "id": "b3", "type": "section", "title": "Projects" }
  ],
  "layout": {
    "desktop": ["b1", "b2", "b3"],
    "mobile": ["b2", "b1", "b3"]
  }
}
```

Rules: every block `id` is unique. `layout.desktop` lists every block id. `layout.mobile` is optional.
`size` is one of `1x1`, `2x1`, `1x2`, `2x2`. Section blocks have no `size`.

| Type | Required fields | Optional fields |
|---|---|---|
| `link` | `title`, `url` | `description`, `icon`, `accent`, `pop` |
| `social` | `network`, `url` | `label` |
| `image` | `src`, `alt`, `source` (or `null`) | `caption` |
| `text` | `body` | `title`, `footnote` |
| `section` | `title` | |
| `map` | `label`, `url` | `sublabel` |
| `video` | `url` | `title`, `thumbnail` |

Presets: colors `condomera`, `lunchbox`, `night`. Fonts `geist`, `lunchbox`, `night`.
Icons are Iconify names like `line-md:github`. Browse https://icones.js.org/collection/line-md.
Brand icons that `line-md` lacks come from `simple-icons`.
Social `network` values: see `NETWORK_IDS` in `app/utils/networks.ts`.

Images: put files in `public/blocks/` and reference them as `/blocks/sample.jpg` (a sample ships there). Avatar goes in `public/`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with the editor at `/edit` |
| `npm run generate` | Static build to `dist/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `nuxt typecheck` (app, scripts, types) |
| `npm run presets` | Writes `app/assets/css/presets.css` from `app/utils/presets.ts` |
| `npm run check:contrast` | WCAG contrast check for every preset |
| `npm run check:profile` | Validates `content/profile.json` |
| `npm run check:icons` | Fails on an unknown icon name |
| `npm run fetch:favicons` | Fetches favicons for link tiles into `public/icons/` and YouTube thumbnails into `public/thumbs/` |

| `npm run test:e2e` | Playwright end-to-end tests (see Tests) |

`predev` runs presets and check:profile. `pregenerate` also runs check:contrast, check:icons and fetch:favicons.

## Tests

End-to-end tests run in headless Chromium with Playwright. Two projects:

| Project | What it tests | Server | Runs in CI |
|---|---|---|---|
| `static` | The prerendered page in `dist/`: one h1, 4 and 2 columns, phone order, theme toggle, no light flash, no Iconify calls, click-to-load video, axe (0 serious or critical issues at 1280 and 390, light and dark) | `node scripts/serve-dist.mjs` on :4173 | yes |
| `dev` | The editor: add and edit a block, mobile order, keyboard reorder, Cmd/Ctrl+S, validation errors, image upload. Writes `content/profile.json` (backed up and restored) and `public/blocks/` | `npm run dev -- --port 3111` | no, local only |

```sh
npx playwright install chromium   # once
npm run generate                  # the static project reads dist/
npm run test:e2e                  # both projects
npm run test:e2e -- --project=static
npm run test:e2e -- --project=dev
```

Lighthouse (mobile) against the static server: `node scripts/serve-dist.mjs` then `npx --yes lighthouse http://localhost:4173/ --chrome-flags="--headless=new"`. Scores are recorded in `NOTES.md` (WP5).

## Deploy

### Cloudflare Pages

1. Push the repo to GitHub.
2. Cloudflare dashboard: **Workers & Pages > Create > Pages > Connect to Git**. Pick the repo.
3. Build settings: framework preset **None**. Build command `npm run generate`. Output directory `dist`.
4. Environment variable `NODE_VERSION` = `24`. Cloudflare also reads `.node-version` in the repo root, which says `24`. Cloudflare's default Node is too old for Nuxt 4.
5. Environment variable `NUXT_PUBLIC_SITE_URL` = your site URL, for example `https://ricardov.dev` (no trailing slash). It makes `og:image` and `og:url` absolute, which link previews need. Leave it unset and the page uses `/og.png`.
6. Save and deploy. Add a custom domain under **Custom domains** after the first build.

No Nitro preset is set. The build is plain static files. `/edit` and `/api` are not in `dist/`.

### Netlify

Connect the repo. `netlify.toml` sets the build command, output folder, Node 24 and cache headers. Add `NUXT_PUBLIC_SITE_URL` in the site's environment variables, same as above.

## Roadmap

- Pexels photo picker in the editor, with attribution on the tile.
- Personal photo uploads to Cloudflare R2.
- Left-rail layout preset.
- Import a Bento.me export zip.
- Open Graph image built from the profile at generate time.

Full plan and decisions: `PLAN.md`.

## License

MIT. See `LICENSE`.
