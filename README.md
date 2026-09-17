# tilebox

Bento-style personal link page. Edit locally, host static on Cloudflare Pages.

tilebox is a self-hosted alternative to [Bento.me](https://bento.me) (shut down in February 2026) and Linktree. One page. A profile block. A grid of tiles you arrange yourself. No backend, no database, no account.

> Status: planning. No code yet. The full plan is in [`PLAN.md`](./PLAN.md).

## What it does

- **Profile.** Avatar, name, bio, a status line.
- **Tiles.** Link, social, image, text, section title, map, video. Sizes `1x1`, `2x1`, `1x2`, `2x2` on a 4-column grid.
- **Two orders.** One tile order for desktop, one for phone.
- **Themes like PowerPoint.** Pick a color preset and a font preset. One click changes the whole page. Light and dark mode.
- **Local editor.** Run `npm run dev`, open `/edit`, drag tiles, edit text, pick icons, save. The editor never ships to production.
- **Static output.** `npm run generate` writes plain HTML, CSS and JS to `dist/`. Push to Git. Cloudflare Pages or Netlify builds and hosts it.

## Stack

| Part | Choice |
|---|---|
| Framework | Nuxt 4, static output |
| CSS | Tailwind CSS 4 |
| Fonts | `@nuxt/fonts`, self-hosted Google Fonts |
| Icons | `@nuxt/icon` with Iconify. Default set `line-md`. Browse at [icones.js.org](https://icones.js.org/collection/line-md) |
| Drag and drop | `vue-draggable-plus` |
| Hosting | Cloudflare Pages (Netlify also works) |
| Node | 24 |

## How you use it

1. Clone the repo. Run `npm install`.
2. Run `npm run dev`. Open `http://localhost:3000/edit`.
3. Change your profile, add tiles, pick a theme. Click **Save**. Everything lands in `content/profile.json`. Images go to `public/blocks/`.
4. Commit and push.
5. Cloudflare Pages builds it. Settings: build command `npm run generate`, output folder `dist`, env `NODE_VERSION=24`.

## Project layout

```
content/profile.json   your data. The only file the editor writes.
public/                avatar, tile images, favicons
app/                   Nuxt app: public page, editor, components
server/api/            dev-only routes (save, upload). Not in the build.
design/canvas/         the design boards (light and dark)
PLAN.md                the plan. Source of truth.
```

## Roadmap

- v1: public page, all tile types, local editor, presets, deploy.
- Later: Pexels photo picker in the editor. Personal photo uploads to Cloudflare R2. A left-rail layout preset. Import a Bento.me export zip.

## Design

The look is on a Claude Design canvas. A local copy of the boards is in `design/canvas/`. Default preset: CONDOMERA blues with the Geist font family.

## License

MIT. To be added with the first code commit.
