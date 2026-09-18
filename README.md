# Tilebox

Bento-style personal link page. One profile, a grid of tiles you arrange yourself.
Edit it in your browser on your own machine. Publish it with one command to Cloudflare Pages or Netlify.
Your profile and photos stay on your machine. They are never committed to git.

A self-hosted alternative to Bento.me (shut down in February 2026) and Linktree. No backend, no database, no account on a third-party editor.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Your personal data](#your-personal-data)
- [Editing by hand](#editing-by-hand)
- [Link previews](#link-previews)
- [Stock photos (Pexels)](#stock-photos-pexels)
- [Site metadata](#site-metadata)
- [Scheduling](#scheduling)
- [Save contact](#save-contact)
- [QR code](#qr-code)
- [Share button](#share-button)
- [UTM tags](#utm-tags)
- [Link check](#link-check)
- [Scripts](#scripts)
- [Tests](#tests)
- [CI](#ci)
- [Publish](#publish)
- [Commit messages](#commit-messages)
- [Release](#release)
- [Stack](#stack)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)
- [More docs](#more-docs)
- [Roadmap](#roadmap)

## Features

- Profile block: avatar, name, handle, bio, up to 3 highlights, status line with a pulsing dot, optional email link.
- Email privacy: your email is required but hidden by default. A hidden email is removed at build time and is in no file of the site.
- Avatar from your email: the build downloads your Gravatar picture once. The public page never calls gravatar.com.
- Site metadata from your profile: title, description, canonical link, Open Graph and X card, JSON-LD (`ProfilePage` + `Person`), `rel="me"` on social links, optional `noindex`. Edit it in `/edit` > **Site**.
- Favicon set and social preview image made at build time from your avatar or your initials, in your colors. Your own upload wins. No network, no service.
- Nine tile types: link, social, image, text, section, map, video, save contact, QR code.
- Four tile sizes on a 4-column grid. Separate tile order for desktop and phone.
- Presets like PowerPoint: 3 color presets and 3 font presets. Light, dark and system mode.
- Smart links: paste a URL and the tile finds its brand icon (about 60 sites, no network). With link previews on, your machine reads the title, the description, the icon and, only if you switch it on, the image of the website. Everything is saved as local files. Visitors never call another host.
- Featured look: a 2x1, 1x2 or 2x2 link tile can show the website's image next to its text.
- Stock photos: search Pexels inside the editor and pick a photo. Your machine saves it as a local WebP file, and the tile credits the photographer and Pexels. Optional, with your own free key, which never leaves your machine.
- Hide a block without deleting it: a hidden block stays in the editor and is in no file of the built site.
- Schedule a block: a start date, an end date, or both. The build leaves a block out before its start and after its end. A tile with an end date also hides itself in the browser when the time has passed.
- Save contact: a tile that downloads your contact card (vCard), a local file the build writes from fields you mark as public.
- QR code of your page, drawn at build time as a local SVG. The editor also gives you a 1024 px PNG for print.
- Share button on the profile tile: the share sheet of the phone, else "Link copied". Browser APIs only.
- UTM tags added at build time to the links that leave your site. Your saved links stay clean.
- Dead-link check: `npm run check:links`, also before every publish and as a button in the editor. It only warns.
- Duplicate a block with one click. Spotlight: one tile can ask for attention with a gentle move every 6 seconds (off with reduced motion).
- Local editor at `/edit`: drag tiles, edit text, pick icons, save. Never shipped to production.
- Remove a block with the small red trash button (the same outlined button in the list row, on the tile and at the end of the block form; 32 px to look at, 44 px to hit, named "Delete <block>" for a screen reader), or with the Delete key. Every delete asks first ("Delete?" with a red **Yes** and a neutral **No**, which has the focus), and Undo stays for 8 seconds.
- Static output. No backend, no database, no runtime network calls on the public page.
- Private by default: `content/profile.json` and your images are ignored by git. The repo ships a sample profile.
- One-command publish: `npm run publish` logs you in with the browser, checks that the site name is free, creates the project and uploads. Cloudflare Pages or Netlify.
- Local releases: `npm run release` picks the version from your commits, writes the changelog and the release notes, and tags. A pushed tag makes the GitHub Release with a ready-to-host zip.
- No API keys, tokens or bots anywhere in the repo or the pipeline. The optional Pexels key lives in your `.env` (ignored by git) and only the dev server reads it.
- Tested: Playwright end-to-end tests, axe accessibility checks, WCAG contrast check on every preset.

## Requirements

- Node `^22.19` or `^24.11` (`.nvmrc` and `.node-version` say 24). npm.
- git. The commit hook installs itself on `npm install`.
- For `npm run publish`: a free Cloudflare or Netlify account. You log in through the browser on the first run.
- Optional, for the release summary draft: the `claude` or `grok` CLI on your `PATH`. Without one you type the summary yourself.
- Optional, for `npm run release`: the GitHub CLI `gh` (`brew install gh`, then `gh auth login`). It makes the GitHub Release from your machine and watches the pipeline. Without it the pipeline makes the release.

## Quick start

```sh
npm install
npm run dev
```

1. Open http://localhost:3000/edit.
2. Edit your profile and tiles. Click **Save**. This writes `content/profile.json`.
3. `npm run publish`. Your page goes to Cloudflare Pages or Netlify from your machine (see Publish).

Text fields in the editor keep what you type. The check runs 0.6 s after your last key, and at once when you leave the field, press Enter or press Cmd/Ctrl+S.
A value that fails the check stays in the field with the reason under it; the file keeps the last valid value. The save bar lists those fields under **Not saved yet**, and Save waits until you fix them.

The first `npm run dev` creates `content/profile.json` from `content/profile.example.json`.
Restart `npm run dev` after you change the color preset, the font preset or an icon name.
`nuxt.config.ts` reads the profile once at start to pick fonts and bundle icons.

## Your personal data

`content/profile.json` is your document. Git never sees it, so a `git pull`, a release or a fresh clone cannot replace it.
The repo ships a sample instead: `content/profile.example.json`.

Ignored by git (`.gitignore`, block "Personal data"):

```
content/profile.json
public/avatar.*
public/blocks/*          except public/blocks/sample.jpg
public/icons/*           website icons of your link tiles (link previews)
public/thumbs/*          website images of your link tiles, YouTube thumbnails
public/site/             favicon set, manifest and social image, made at build
public/site-uploads/     your own favicon and social image uploads
.tilebox/                publish state, link preview cache
.netlify/
```

How a build picks the file (`content/resolve.ts`): `content/profile.json` when it exists, else the example.
`npm run check:profile` prints which one: `profile: content/profile.json (personal)` or `profile: content/profile.example.json (example)`.

- GitHub CI and the release zip have no `profile.json`. They build the **sample** site.
- Your real site leaves your Mac only with `npm run publish` or `npm run publish -- --preview` (`npm run deploy` and `npm run deploy:preview` are aliases).
- `npm run release` refuses to run when `content/profile.json` or a personal image is tracked.
- Your email: `profile.email` is required, and hidden by default (`showEmail: false`). The page never imports `content/profile.json`. It imports a sanitized copy (`.nuxt/tilebox/public-profile.json`, written by `modules/public-profile.ts`), and a hidden email is not in that copy. So it is in no HTML, no `_payload.json` and no JS chunk of `dist/`. `tests/e2e/privacy.spec.ts` reads every text file of `dist/` to prove it. Note: a tile you add yourself with a `mailto:` URL is public, as any tile.
- Your avatar from your email: `npm run fetch:avatar` (part of `predev` and `pregenerate`) sends the SHA-256 hash of your email to gravatar.com **from your machine at build time** and saves the picture as `public/avatar.gravatar.webp` (ignored by git). The download follows the same rules as the link icons: only `https://gravatar.com` (and its `www.` and `secure.` hosts), 2 MB at most, a real JPEG, PNG or WebP by its first bytes, and the stored file is a NEW WebP that sharp wrote (512 px at most, no metadata), never the bytes as they came. An old `public/avatar.gravatar.jpg` is removed by the next good download. The published page only loads that local file; it makes no request to gravatar.com. No fetch when `profile.avatar` is set or the email is a placeholder. No Gravatar or no network: the build goes on, the page shows your initials.
- Your favicon and your social image: `npm run build:site-assets` (part of `predev` and `pregenerate`) writes them to `public/site/` from your profile, on your machine, with no network. They show your name, bio and avatar, so they are ignored like the profile. GitHub CI and the release zip hold the ones of the sample profile. See [Site metadata](#site-metadata).
- Back up `content/profile.json`, `public/blocks/`, `public/site-uploads/` and `public/avatar.*` yourself. Reset to the sample: `rm content/profile.json && npm run ensure:profile`.

Details: `content/README.md`.

## Editing by hand

Everything lives in `content/profile.json` (the sample is `content/profile.example.json`). The schema is in `types/profile.ts` (zod).
Run `npm run check:profile` to validate it.

```json
{
  "profile": {
    "name": "Ricardo Vargas",
    "handle": "ricardov03",
    "bio": "Front-end developer.",
    "highlights": ["Nuxt, Vue and TypeScript", "Founder of CONDOMERA"],
    "email": "you@example.com",
    "showEmail": false,
    "avatar": "/avatar.jpg",
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

Profile fields:

| Field | Required | What it is |
|---|---|---|
| `name`, `handle`, `bio`, `theme` | yes | The basics |
| `email` | yes | A valid email. Hidden unless `showEmail` is true. Also used to find your Gravatar picture |
| `showEmail` | no, default `false` | `true` shows the email as a `mailto:` link under the highlights |
| `highlights` | no, default `[]` | Up to 3 short lines under the bio, 1 to 80 characters each. With 3 of them, each gets one line on phones |
| `avatar` | no | Path of an uploaded picture. It wins over the Gravatar picture. Without both, the page shows your initials |
| `status` | no | The line with the pulsing dot (no pulse with `prefers-reduced-motion`) |

With highlights or a visible email the profile tile uses a compact scale (smaller avatar and name, bio limited to 3 lines), so everything fits the fixed tile.
An older `profile.json` without `email`, `showEmail` and `highlights` is upgraded by `npm run dev` (`ensure:profile`): it adds `"email": "you@example.com"`, `"showEmail": false`, `"highlights": []` and changes nothing else. `check:profile` warns while the placeholder email is still there.

Rules: every block `id` is unique. `layout.desktop` lists every block id. `layout.mobile` is optional.
`size` is one of `1x1`, `2x1`, `1x2`, `2x2`. Section blocks have no `size`.
Every block type takes `"hidden": true`: the block stays in your file and in the editor, and the build leaves it out (no HTML, no payload, no JS).
Every block type also takes `"startsAt"` and `"endsAt"` (see [Scheduling](#scheduling)). `link`, `social`, `map` and `video` blocks take `"noUtm": true` (see [UTM tags](#utm-tags)).

| Type | Required fields | Optional fields |
|---|---|---|
| `link` | `title`, `url` | `description`, `icon`, `accent`, `pop`, `spotlight`, `enrich`, `showImage`, `favicon`, `image`, `imageAlt`, `meta` |
| `social` | `network`, `url` | `label` |
| `image` | `src`, `alt`, `source` (or `null`) | `caption` |
| `text` | `body` | `title`, `footnote` |
| `section` | `title` | |
| `map` | `label`, `url` | `sublabel` |
| `video` | `url` | `title`, `thumbnail` |
| `contact` | | `title` (default "Save my contact"), `description`, `icon` (default `line-md:account`). See [Save contact](#save-contact) |
| `qr` | | `caption` (default: the host of your site). `size` is `1x1` or `2x2` only. See [QR code](#qr-code) |

New top-level keys (all optional, an old file stays valid):

| Key | What it is |
|---|---|
| `contact` | The PUBLIC contact card: `enabled`, `fullName`, `org`, `title`, `phone`, `email`, `url`, `note`. See [Save contact](#save-contact) |
| `site.share` | `false` removes the share button. Missing = on. See [Share button](#share-button) |
| `site.utm` | `{ "source": "tilebox", "medium": "profile", "campaign": "spring-2027" }`. `campaign` is optional. See [UTM tags](#utm-tags) |

Link fields (all optional, an old file stays valid):

| Field | What it is |
|---|---|
| `icon` | Your own icon. Without it the tile picks one: the brand icon from the URL, else `favicon`, else `line-md:link`. `mailto:` and `tel:` links get an email and a phone icon |
| `spotlight` | `pop`, `wobble` or `buzz`. A gentle move every 6 seconds. Only ONE block of the profile may have it. Off for visitors with reduced motion |
| `enrich` | `true` = link previews on for this link (see [Link previews](#link-previews)). Missing = off. The editor sets it on new links |
| `showImage` | `true` = show the website's image on a 2x1, 1x2 or 2x2 tile. Missing = off. A 1x1 tile never shows it |
| `favicon` | A local file, `/icons/<hash>.png`. Always a PNG: the editor draws every fetched icon again. Written by the editor. A remote URL is refused |
| `image`, `imageAlt` | A local file, `/thumbs/<hash>.webp`, and its alt text. Written by the editor |
| `meta` | What the website said: `title`, `description`, `siteName`, `themeColor`, `source` (`oembed`, `html` or `brand`), `fetchedAt`. For the editor only. Never shipped |

By hand, `"enrich": true` (and `"showImage": true`) is enough: `npm run generate` fetches the files and the build takes their paths from the cache. `title` stays yours.

Presets: colors `condomera`, `lunchbox`, `night`. Fonts `geist`, `lunchbox`, `night`.
Icons are Iconify names like `line-md:github`. Browse https://icones.js.org/collection/line-md.
Brand icons that `line-md` lacks come from `simple-icons`. Icons that simple-icons marks as hidden (LinkedIn, Twitter, Amazon, Slack: removed brands) fail `npm run check:icons`.
Social `network` values: see `NETWORK_IDS` in `app/utils/networks.ts`.

Images: put files in `public/blocks/` and reference them as `/blocks/sample.jpg` (a sample ships there). `source` is `null` for your own file; the Pexels tab of the editor fills it (see [Stock photos](#stock-photos-pexels)). Avatar goes in `public/` as `avatar.<ext>`. Both are ignored by git (see "Your personal data").

## Link previews

A link tile can read its icon, title, description and image from the website it points to. It is off for old links and on for new ones. You turn it on or off per link.

**Who fetches, and when.** Only your machine. Never a visitor.

| When | What runs | What it does |
|---|---|---|
| You paste a URL in the editor (`/edit`), or leave the URL field | The dev-only route `POST /api/unfurl` | Reads the page once, saves the files, fills the form. While you type, it waits 1.2 s and asks only for a whole URL (`https://nu` asks nothing) |
| `npm run generate` (and `npm run publish`) | `npm run fetch:links`, part of `pregenerate` | Only for links with `enrich: true` whose local files are missing. Then it removes the fetched files that nothing uses any more. Never fails the build |
| A visitor opens your page | Nothing | The page is static. It loads local files only. `tests/e2e/public.spec.ts` fails on any request to another host |

**What is fetched.**

1. The brand icon needs no network. `app/utils/brand-icons.ts` maps about 60 hosts (github.com, x.com, youtu.be, t.me, wa.me...) to an Iconify icon. It works with link previews off too.
2. For some sites a keyless oEmbed endpoint answers with the title and a thumbnail: YouTube, Vimeo, Spotify, SoundCloud, TikTok, X posts, Bluesky posts, Reddit posts, Flickr, Mixcloud, Apple Music, Giphy, Pinterest.
3. For every other site: the first 512 KB of the page, or less when `</head>` comes first. From the head: `og:title`, `twitter:title`, `<title>`, `og:description`, `<meta name="description">`, `og:site_name`, `og:image`, `twitter:image`, `theme-color`, the icon links and the web manifest.
4. The icon of the site, when the tile has no brand icon: SVG icon, apple-touch-icon, PNG icon, manifest icon, `/favicon.ico` (its largest PNG entry), and as the last try Google's favicon service (`https://www.google.com/s2/favicons`).
   - **Icons are always converted to PNG.** Whatever the website sends (SVG, PNG, ICO, JPEG, WebP, GIF), sharp draws it again as a PNG inside 128x128 and only that PNG is saved. An SVG from another site is never stored: opened directly it could run script on your own domain. A file sharp cannot read counts as "no icon", and the next source is tried.
   - **Honest note:** that last-resort Google service gets the link's hostname, from your machine, when you edit or build. No visitor ever talks to it. To avoid it, pick an icon yourself in the link form, or turn "Load info from the website" off for that link.
5. The image, **only** when "Show the website's image" is on: at most 5 MB, PNG, JPEG, WebP, GIF or AVIF by its real bytes, at least 200x200. It is resized to 1200 px wide and saved as WebP, which removes EXIF data. The image belongs to that website. You decide to show it.

**The user agent.** Every request says who it is: `tilebox-unfurl/<version> (+https://github.com/ricardov03/tilebox)`. It never pretends to be a browser or another company's bot. A site that blocks unknown clients gives no data, and that is fine.

**Where the files land.** `public/icons/<hash>.png`, `public/thumbs/<hash>.webp` and the cache `.tilebox/unfurl-cache.json`. All three are ignored by git. The cache is fresh for 30 days. After that the engine asks with `If-None-Match` / `If-Modified-Since`, and a `304` keeps the data. "Refresh" in the editor asks again at once, with a full read (no conditional headers). The cache holds 500 links at most (the oldest go first), and every entry is checked against a strict schema when it is read: a changed or broken entry is dropped.

**Time budget.** One link gets 20 seconds in total, for all of its requests together (page, oEmbed, manifest, icons, image), 8 requests and 8 redirects at most. One hop gets 8 seconds, a DNS answer 3 seconds. A link that fails is remembered for 10 minutes, so a dead or hostile link does not cost every build again. "Refresh" skips that memory. When the editor drops a request (you changed the URL), the job on the server stops too.

**Pruning.** At the end of `npm run fetch:links`, files in `public/icons/` and `public/thumbs/` that no block of your profile and no fresh cache entry uses are deleted. So the folders do not grow for ever, and no orphan file ships with your site. It only deletes plain files directly inside those two folders; `.gitkeep`, `manifest.json`, symlinks and sub-folders stay.

**Response headers (`public/_headers`).** Cloudflare Pages and Netlify both read this file; it lands in `dist/`. For `/icons/*`, `/thumbs/*`, `/blocks/*`, `/site/*` and `/site-uploads/*` it sets `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` and `X-Content-Type-Options: nosniff`. Those folders hold files made from other people's bytes. They are only ever `<img>` sources; opened directly they get no script, no network and no access to your origin. Every path gets `nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. `nuxt dev` sends the same headers (`routeRules` in `nuxt.config.ts`, and `server/middleware/asset-headers.ts` for a missing file). Another host needs the same rules in its own format.

**Safety (SSRF).** The engine (`content/unfurl.ts`) takes `http` and `https` on ports 80 and 443 only. It resolves the host first and refuses every address that is not public: loopback, private ranges, link-local (cloud metadata), CGNAT, unique-local, IPv4-mapped, and IPv6 addresses whose first 96 bits are zero (`::127.0.0.1`). It connects to the address it checked, so a second DNS answer cannot redirect the connection. It follows at most 5 redirects per request and checks every hop. Fetched text loses control characters and bidi controls. Every dev route answers only on `localhost`, refuses another `Origin` and `Sec-Fetch-Site: cross-site` / `same-site`, and takes only the content type the editor sends (`application/json`, or `multipart/form-data` for uploads). The full threat model: [`docs/security.md`](docs/security.md).

**Your text wins.** The fetched title and description fill the fields only when they are empty. When they differ from yours, the form shows "Use fetched title" and "Use fetched description". The fetched copy (`meta`) stays in your `profile.json` for the editor and is never shipped to the page.

**Turn it off.** Per link: switch off "Load info from the website" in the link form, or remove `"enrich": true` by hand. Your typed text stays. `meta`, `favicon` and `image` are cleared. The files stay on disk and are not used. A link with previews off makes no request, ever.

**Sites that give no data.** X profiles, Medium, and sometimes LinkedIn block unknown clients or need a login. The tile still gets its brand icon, and you type the title yourself. The editor shows the reason (`http 403`, `timeout`, `not html`, `blocked address`...).

Debug one link: `npm run fetch:links -- --url https://nuxt.com --image` prints the answer as JSON. It is a real run: it writes the cache and the fetched files.

## Stock photos (Pexels)

Optional. The image form in `/edit` has two tabs: **Upload** (your own file) and **Pexels** (free stock photos). The public page stays static: a picked photo is a local file.

**Set it up (once).**

1. Make a free account and copy your key: https://www.pexels.com/api/ ("Your API key").
2. Put it in the file `.env` in the project folder (copy `.env.example` when there is none): `PEXELS_API_KEY=your-key`.
3. Stop `npm run dev` and start it again. The Pexels tab now shows a search box.

**Pick a photo.** Open an image block, tab **Pexels**, type 2 letters or more. The search starts 0.8 s after you stop typing, or with Enter. **Shape** is preset from the tile size (2x1 landscape, 1x2 portrait, 1x1 and 2x2 square); you can change it. Arrow keys move in the grid, Enter picks, **Load more** gets the next 24.

| Step | What happens |
|---|---|
| Search | The dev-only route `GET /api/images/pexels/search` asks `api.pexels.com` with your key and answers a small list (id, size, alt, color, photographer, links, thumbnail). The same search is answered from memory for 10 minutes. The thumbnails in the grid load from `images.pexels.com`, in the dev editor only |
| Pick | `POST /api/images/pexels/pick` gets the photo ID. Your machine asks Pexels for that photo, downloads the `large2x` file from `images.pexels.com` (https only, 15 MB and 20 s at most), checks that it is a real jpeg, png or webp, and writes a NEW file with sharp: WebP, quality 82, 1600 px on the long side, no metadata |
| The file | `public/blocks/pexels-<id>.webp`. Ignored by git, like every file of `public/blocks/`. Picking the same photo again downloads nothing |
| The block | `src`, `source: { provider: "pexels", id, url, author, authorUrl }`, and `alt` from Pexels when you had none of your own (empty or the sample text). Your own alt text stays. Edit it as you like |
| The page | The tile shows "Photo by {author} on Pexels": the name links to the photographer, "Pexels" to the photo page. Always, for a Pexels photo: Pexels asks for the credit. An upload in the same block removes the source and the credit |

**The key.** It stays on your machine. Only the dev server reads it (`process.env`, from `.env`, which git ignores). It is never sent to the browser, it is in no file of `dist/`, and nothing needs it to build, on CI, to release or to publish: the photos are already local files. `tests/e2e/pexels.spec.ts` looks for the key and for the name of the variable in every built file.

**The quota.** Free keys get 200 requests per hour and 20,000 per month. One search = 1 request, one pick = 1 request (the download itself is not counted). The tab shows how many are left. At the limit you read "Pexels rate limit reached, try again at <time>".

Without a key nothing breaks: the tab shows the 3 steps above, **Upload** works as before.

## Site metadata

What search engines, link previews and the browser tab get. Edit it in `/edit` > **Site**, or by hand in the optional top-level `site` object of `content/profile.json`. A profile without `site` is valid and uses the defaults.

```json
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
```

| Field | Rule | Default | Goes to |
|---|---|---|---|
| `title` | max 70 characters | `Name (@handle)` | `<title>`, `og:title`, manifest `name` |
| `description` | max 160 characters | your bio | meta description, `og:description` |
| `url` | `https://`, no trailing slash | none | canonical, `og:url`, absolute `og:image`, JSON-LD |
| `lang` | BCP 47 tag (`en`, `es`, `pt-BR`) | `en` | `<html lang>`, `og:locale` |
| `noindex` | boolean | `false` | `<meta name="robots" content="noindex, nofollow">` |
| `xHandle` | X user name, no `@` | none | `twitter:site`, `twitter:creator` |
| `jobTitle`, `location` | text, max 100 | none | JSON-LD only. Not shown on the page |
| `favicon` | local path, png, jpg or webp, square (the editor saves an SVG upload as a PNG) | none | source of the favicon set |
| `ogImage` | local path, png, jpg or webp | none | source of `/site/og.png` |

**Site URL precedence.** Absolute URLs need to know where the page lives. The order is: the build env `NUXT_PUBLIC_SITE_URL` (`npm run publish` sets it to the live URL) > `site.url` > unknown. Unknown means: no canonical link, no `og:url`, and `og:image` stays the path `/site/og.png`. Most link previews need an absolute image URL, so set one of the two.

**What the build makes** (`npm run build:site-assets`, part of `predev` and `pregenerate`, code in `content/site-assets.ts`), all in `public/site/` (not tracked), all offline:

| File | What |
|---|---|
| `favicon.ico` | 32x32 PNG inside an ICO |
| `icon.svg` | Only for the initials tile (with a dark-mode variant inside). This repo draws that file itself. An upload never becomes `icon.svg` |
| `icon-192.png`, `icon-512.png` | Manifest icons |
| `icon-mask.png` | 512, maskable: the content stays inside the safe zone |
| `apple-touch-icon.png` | 180, opaque, on the ground color of your color preset |
| `manifest.webmanifest` | name, short name, icons, theme and background color, `display: browser` |
| `og.png` | The social preview image, 1200x630, under 1 MB |

- Favicon source, in order: your upload (`site.favicon`) > your avatar (`profile.avatar`, else the downloaded Gravatar), cut to a circle > your initials in `accent-soft` on `accent` of the active color preset, as a rounded square.
- Social image source: your upload (`site.ogImage`, cut to 1200x630) > a generated card with your avatar or initials, name, bio (3 lines at most), `@handle` and the site host.
- The generated card **always uses Geist** (`assets/fonts/Geist-Regular.ttf` and `Geist-SemiBold.ttf`, SIL OFL 1.1, license in `assets/fonts/OFL.txt`) and the **light** colors of the active color preset, whatever font preset the page uses. The image renderer reads TTF files, and only Geist ships with the repo. The favicon initials use Geist too.
- The head links point to `/site/...` for every file that exists when the build starts. A missing file falls back to the tracked `/favicon.ico` and `/og.png`. The script never fails a build: a broken upload falls to the next source and prints one line. When every favicon source fails, or the social image fails, the older files of that kind are removed from `public/site/`, so the fallback really applies.
- Head links: `favicon.ico` (32), `icon-192.png`, `apple-touch-icon.png` and the manifest always; `icon.svg` only when it exists.
- `noindex` adds the robots meta tag only. `public/robots.txt` is not changed.
- JSON-LD: one `ProfilePage` (`dateModified` = the build date) whose `mainEntity` is a `Person`: name, `alternateName` (handle), description (bio), image (avatar), url, `jobTitle`, `address.addressLocality` (location) and `sameAs` = the URL of every social tile.
- Social tiles link with `rel="me noopener noreferrer"`. `rel="me"` lets Mastodon and other sites verify that the profile is yours.
- The head is built by one pure function, `buildHead()` in `app/utils/site-head.ts`, used by `app/composables/useSiteHead.ts`.

**Upload your own.** `/edit` > **Site** > Favicon or Social preview image > upload. **An SVG upload is converted to PNG:** the editor draws it as a 512x512 PNG and stores only that PNG, never the SVG (a file in `public/` is served from your own domain, and an SVG opened directly can run script). A raster upload must really be the format its name says. The file goes to `public/site-uploads/` (not tracked), the path goes to `site.favicon` or `site.ogImage`, and the previews update. **Remove upload** goes back to the generated one. **Regenerate** builds the files again from what the editor shows, saved or not; `npm run dev` and every build make them again from the saved profile. Save as usual.

## Scheduling

Every block takes two optional dates: `startsAt` and `endsAt`. In `/edit`, open a block and use **Advanced** > **Schedule**. The two fields use the time zone of your computer. The file stores ISO 8601 with the offset, for example `"startsAt": "2026-12-01T09:00:00-05:00"`. `endsAt` must be after `startsAt`.

The page is static, so be clear about what a date can do:

| Case | At build time | In the browser |
|---|---|---|
| `startsAt` is in the future | The block is left out, like a hidden block: no HTML, no payload, no JS | Nothing. **Publish again after that time to show it** |
| `endsAt` is in the past | The block is left out | Nothing to do |
| `endsAt` is in the future | The block is on the page with `data-ends-at` | A tiny inline script (under 400 bytes, no network) hides the tile when the time has passed. It checks at load and every 60 seconds |

- `startsAt` never ships. Only `endsAt` reaches the page.
- With JavaScript off, a tile with a passed end date stays visible until your next publish removes it. The text of an ended block is in the files of the site until then: do not schedule a secret.
- `npm run check:profile` prints one warning per expired block and per block that has not started yet, with the date to publish after.
- The editor shows a status badge (Live, Scheduled from, Ends, Expired) and a calendar badge on the tile and on the list row.

## Save contact

A `contact` block is a tile that downloads your contact card: `<a href="/site/contact.vcf" download>`. The card is a local file. No service, no network call.

1. `/edit` > **Site** > **Contact card**. Fill the fields and turn on "Make the contact card".
2. `/edit` > **Blocks** > **Add block** > **Save contact**.

**Everything in the contact card is public.** It is a file anyone can download. Your profile `email` is private and is never copied into the card: `contact.email` is its own field. Leave it empty to publish no email.

- The build (`npm run build:site-assets`, inside `predev` and `pregenerate`) writes `public/site/contact.vcf` (not tracked) when `contact.enabled` is true. Else it removes the file.
- Format: vCard 3.0, UTF-8, CRLF line ends, lines folded at 75 bytes; `,` `;` `\` and line breaks are escaped. Fields: `N`, `FN`, `ORG`, `TITLE`, `TEL;TYPE=CELL`, `EMAIL`, `URL`, `NOTE`. No `PHOTO`.
- `fullName` defaults to your profile name. The download is named after it: `ada-lovelace.vcf`.
- No file = no tile: the build leaves a `contact` block out while the card is off, and `check:profile` warns.
- "Download preview" in the editor gives you the same text, made from what you see, saved or not.

## QR code

When the build knows your site URL (`NUXT_PUBLIC_SITE_URL`, else **Site URL** in `/edit` > **Site**), it draws the QR code of that URL to `public/site/qr.svg` (not tracked). `npm run publish` sets the URL for you. The URL must be `https`.

- A `qr` block (`1x1` or `2x2`) shows the file as an image with a caption. Default caption: the host of your site.
- The code is drawn by this project (`uqr`, a dev dependency) from the URL text. It is not a remote SVG. The page loads no QR library.
- The code always uses the light colors of your preset on a solid ground, also in dark mode. A light-on-dark code does not scan on many phones.
- No site URL = no file = no tile. `check:profile` warns.
- `/edit` > **Site** > **QR code of the page**: a preview, "Download SVG", and "Download PNG" (1024 px, made by a dev-only route with sharp).

## Share button

A small button at the top right of the profile tile. On a phone it opens the share sheet (`navigator.share`). On other browsers it copies the address and shows "Link copied" for 2 seconds (announced to screen readers). Browser APIs only: no script from another site, no network call.

Turn it off in `/edit` > **Site** ("Show a share button on my profile tile"), or with `"site": { "share": false }`.

## UTM tags

UTM tags tell the other website where a visit came from. Set them once in `/edit` > **Site** > **UTM tags** (source and medium are both needed, campaign is optional). Values: lowercase letters, digits, `_` and `-`, 40 at most.

The BUILD adds them. Your saved links stay clean:

| Link | Result |
|---|---|
| `https://a.example/page` | `https://a.example/page?utm_source=tilebox&utm_medium=profile` |
| `https://a.example/?q=1#top` | `https://a.example/?q=1&utm_source=tilebox&utm_medium=profile#top` |
| A link that already has `utm_source` | That tag stays. Only the missing tags are added |
| `mailto:`, `tel:`, the contact card, a link to your own site | Never changed |
| A block with `"noUtm": true` ("No UTM tags on this link" in the block form) | Never changed |

Tagged blocks: link, social, map, video. The domain line of a link tile shows the host only. Brand icons, link previews and the link check use the URL you typed. JSON-LD `sameAs` lists your social links without the tags.

## Link check

```bash
npm run check:links
```

It asks every external http(s) link of your profile once (60 at most, 4 at a time, one request per host at a time) and prints a table. It ALWAYS exits 0: a warning list, never a failed build. It is not part of `npm run generate`, because it is slow and needs the network.

| Result | When |
|---|---|
| `ok` | 2xx or 3xx |
| `blocked` | 401, 403, 429 and other 4xx. The site blocks checks. The link is probably fine |
| `broken` | 404, 410, 5xx, unknown host, timeout, bad certificate, a private address |

- One `HEAD` request per link. When the site refuses `HEAD` (403, 405, 501), one `GET` that reads 1 KB at most.
- Every request uses the same guarded request as the link previews: public addresses only, redirects checked one by one, 8 seconds per hop, the honest user agent. See [`docs/security.md`](docs/security.md).
- `npm run publish` runs it before the upload and prints the broken links as warnings. It never stops a publish. Skip it with `--skip-link-check`.
- `/edit` > **Blocks** > **Check links**: the same check through a dev-only route. The result shows as small badges on the list rows and is kept in memory only.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with the editor at `/edit` |
| `npm run generate` | Static build to `dist/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `nuxt typecheck` (app, scripts, types) |
| `npm run presets` | Writes `app/assets/css/presets.css` from `app/utils/presets.ts` |
| `npm run check:contrast` | WCAG contrast check for every preset |
| `npm run ensure:profile` | Creates `content/profile.json` from the example when it is missing |
| `npm run check:profile` | Validates the profile and prints which file is used (personal or example) |
| `npm run check:icons` | Fails on an unknown or hidden icon name: your profile, the social map, the UI icons and the brand map |
| `npm run fetch:avatar` | Downloads your Gravatar picture (from `profile.email`), writes it again as a WebP to `public/avatar.gravatar.webp`. Skipped when `profile.avatar` is set or the email is a placeholder. Never fails the build |
| `npm run fetch:links` | Link previews for links with `enrich: true` whose files are missing (`public/icons/`, `public/thumbs/`), and YouTube thumbnails for video tiles. Never fails the build. `-- --url <link> [--image] [--force]` prints one answer as JSON |
| `npm run fetch:favicons` | Old name. Alias of `npm run fetch:links` |
| `npm run build:site-assets` | Writes the favicon set, the web manifest and the social preview image (`og.png`, 1200x630) to `public/site/` from your profile, plus `contact.vcf` (when the contact card is on) and `qr.svg` (when the site URL is known). No network. Never fails the build: on a problem the page keeps the tracked `/favicon.ico` and `/og.png` |
| `npm run check:links` | Dead-link check of every external link of your profile (see Link check). Needs the network. Always exits 0. Not part of `pregenerate` |
| `npm run test:e2e` | Playwright end-to-end tests (see Tests) |
| `npm run review` | Local code review by the Grok CLI: the diff and an impact map go into the prompt, the answer is a checked JSON verdict. `-- --range main..<branch> --files <paths> --ledger` for a block, `-- --dry-run` to see the prompt. Exit 0 pass, 1 fail, 2 nothing to review, 3 no valid verdict (see `docs/review-tools.md`) |
| `npm run review:ledger` | The findings ledger: `-- add ...` records a finding with a category, `-- report` counts them. The top category is the next scripted check |
| `npm run test:review` | The test suite of the review scripts, with a fake `grok` on `PATH`. No network, no cost. Runs in CI |
| `npm run release` | Local release: checks, version bump, changelog, release notes, commit and tag. Then offers to push and make the GitHub Release (see Release) |
| `npm run release:publish -- vX.Y.Z` | Push and make the GitHub Release for a tag that exists. No version bump (see Repair a release) |
| `npm run publish` | Build and upload the page to Cloudflare Pages or Netlify from your machine (see Publish). `npm run site:publish` is the same command |
| `npm run deploy` | Alias of `npm run publish -- --provider cloudflare` |
| `npm run deploy:preview` | Alias of `npm run publish -- --provider cloudflare --preview` |

`predev` runs ensure:profile, presets, check:profile, fetch:avatar and build:site-assets. `pregenerate` runs presets, check:profile, check:contrast, check:icons, fetch:avatar, fetch:links and build:site-assets. It never creates `profile.json`: a build without it is the sample site.

## Tests

End-to-end tests run in headless Chromium with Playwright. Two projects:

| Project | What it tests | Server | Runs in CI |
|---|---|---|---|
| `static` | The prerendered page in `dist/`: one h1, 4 and 2 columns, phone order, theme toggle, no light flash, no Iconify calls, click-to-load video, axe (0 violations of any level at 1280 and 390, light and dark), `/edit` and `/api` answer 404, no request leaves the static origin, highlights list, no `mailto:` link while the email is hidden, the dot pulses (not with reduced motion). Plus `repo.spec.ts`: no personal file is tracked by git, and `privacy.spec.ts`: a hidden email is in no text file of `dist/`, and the sanitizer keeps or removes the email; a hidden block is in no file of `dist/`. WP10a: a link without an icon shows its brand icon, the spotlight runs (not with reduced motion). No browser and no internet: `links.spec.ts` (brand map against the installed packs, tile rules, schema) and `unfurl.spec.ts` (the link preview engine against a local `node:http` server: head parsing, redirects, the 512 KB cut, ICO and magic bytes, private addresses refused, the cache and `304`, oEmbed with a mocked connection). `site.spec.ts`: the head of the built page (title, description, Open Graph, X card, JSON-LD, favicon links, manifest, no canonical without a site URL), `rel="me"`, and, with no browser, `buildHead()` and the asset builder in a temp folder (ICO bytes, sizes, 1200x630 under 1 MB, uploads win, broken uploads fall back). `field-draft.spec.ts`: the state machine of an editor text field, with a fake clock (no browser). `second-wave.spec.ts` (WP11): with no browser and a fixed date, the schedule matrix, the UTM matrix, the vCard text (escaping, CRLF, no `PHOTO`, no profile email), the QR file only with a site URL, the link checker with a mocked connection; on the built page, the end-date script, the share button (copy, announce, `navigator.share`, clear of the theme toggle at 1280 and 390), the contact tile download. `pexels.spec.ts` (WP12, mocked connection, no key): the search mapping, 401, 429 with the reset time, the 10-minute memory, input checks, the pick route refuses a file that is not on `images.pexels.com`, a redirect to another host and a fake jpeg, writes a WebP without metadata, a second pick downloads nothing, the credit line, and the key canary (the key and the name of its variable are in no built file) | `node scripts/serve-dist.mjs` on :4173 | yes |
| `dev` | The editor: add and edit a block, mobile order, keyboard reorder, Cmd/Ctrl+S, validation errors, image upload, delete a block (list row, tile button, Delete key, "No" and Escape keep it, Undo restores both layouts; the three delete buttons share one outlined `danger` look with a 44 px hit area; axe on the block list and the form footer with the confirm open, light and dark), email + show email + highlights (saved to the file, the public page follows without a restart), invalid email, link preview with a mocked `/api/unfurl` (preview card, fetched text fills empty fields only, "Use fetched title", the two switches saved, the reason of a failed fetch), Hide / Show, Duplicate, one spotlight only. `editor-inputs.spec.ts`: the text fields (a cleared field stays empty, typing through an invalid text is never rewritten, no message while typing, "Required" after a blur, the draft keeps the last valid value, Save is blocked with a message, Cmd/Ctrl+S checks first, an emptied optional field leaves the file, a change from outside, the email and the Site URL fields). `site-editor.spec.ts`: the Site tab (keyboard model, fields saved to the file, inline URL error, "Regenerate" with a mocked route, the real upload and build routes). `second-wave-editor.spec.ts` (WP11): the schedule inputs round-trip to ISO in the saved file, the contact panel, the live UTM example, the share checkbox, "Check links" with a mocked route, the guards of the two new dev routes and the 1024 px QR PNG. `pexels-editor.spec.ts`: the Pexels tab with mocked routes (no key state, search, grid, pick, save, keyboard pick, rate limit, offline) and the guards of the real routes. Writes `content/profile.json` (backed up and restored), `public/blocks/` and `public/site/` | `npm run dev -- --port 3111` | no, local only |

```sh
npx playwright install chromium   # once
npm run generate                  # the static project reads dist/
npm run test:e2e                  # both projects
npm run test:e2e -- --project=static
npm run test:e2e -- --project=dev
```

Port taken by another checkout? `E2E_STATIC_PORT=4188 E2E_DEV_PORT=3144 npm run test:e2e`.

Lighthouse (mobile) against the static server: `node scripts/serve-dist.mjs` then `npx --yes lighthouse http://localhost:4173/ --chrome-flags="--headless=new"`. Scores are recorded in `NOTES.md` (WP5).

## CI

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request:

1. `build` job: `npm ci`, lint, typecheck, `npm run generate` (with a DUMMY `PEXELS_API_KEY`, not a secret: `pexels.spec.ts` looks for that exact text in `dist/`, so the run proves that a key in the build environment reaches no built file), then checks that `dist/index.html` exists and that neither `dist/edit` nor `dist/edit.html` exists. Uploads `dist` as an artifact for 7 days.
2. `e2e` job: downloads that `dist`, installs Chromium, runs the Playwright `static` project.

CI has no `content/profile.json`, so it always builds the **sample** site. It never deploys. `actions/checkout`, `actions/setup-node` and the release action are pinned to full commit SHAs. The workflow token is read-only. A failed e2e run uploads the Playwright report as an artifact.

`.github/workflows/release.yml` runs only when a `v*` tag is pushed. See [Release](#release).

## Publish

Publishing is one local command. No API key, no token in the repo, no bot. The GitHub pipeline never deploys.

```sh
npm run publish
```

### First run

1. Pick a provider: **Cloudflare Pages** (`https://<name>.pages.dev`) or **Netlify** (`https://<name>.netlify.app`). Both have a free plan.
2. Log in. The provider CLI opens the browser (`wrangler login` or `netlify login`). Allow the access and come back to the terminal. The CLI keeps the login in your home folder.
3. Pick a site name: lowercase letters, digits and dashes, no dash at the start or end, max 37 characters.
4. The script checks that `<name>.pages.dev` (DNS) or `<name>.netlify.app` (HTTPS) is still free. A taken name asks again.
5. The project is created. `npm run generate` runs with `NUXT_PUBLIC_SITE_URL` set to the live URL so `og:image` and `og:url` are absolute. `dist/` is uploaded.
6. The live URL is printed. The choices are saved in `.tilebox/publish.json`.

If you have more than one Cloudflare account or Netlify team, the script asks which one, or takes `--account <id-or-slug>`.

### Later runs

`npm run publish` reads `.tilebox/publish.json`, builds, uploads, prints the live URL. `npm run publish -- --preview` uploads to a preview URL instead (Cloudflare `preview` branch, Netlify draft deploy) and leaves production alone.

| Flag | Effect |
|---|---|
| `--provider cloudflare` or `--provider netlify` | Skip the provider prompt. Must match the saved provider |
| `--name <site-name>` | Skip the name prompt. Must match the saved name |
| `--account <id-or-slug>` | Cloudflare account id or Netlify team slug |
| `--preview` | Upload to a preview URL, not production |
| `--site-url https://...` | `NUXT_PUBLIC_SITE_URL` for this build only. Must start with `https://`. Use it after you set a custom domain. `NUXT_PUBLIC_SITE_URL` in your shell works too. Default: the saved live URL |
| `--no-build` | Skip `npm run generate`, upload `dist/` as it is |
| `--skip-link-check` | Skip the dead-link check that runs before the upload. The check only prints warnings and never stops a publish (see [Link check](#link-check)) |
| `--yes` | Never ask. Fails with exit 2 when an answer is needed: no `--provider` or no `--name` on the first run, more than one account. Fails with exit 1 for no login or a taken name |
| `--reset` | Forget `.tilebox/publish.json` and set up again. The project on the provider stays; delete it in the dashboard if you do not need it |
| `--help` | Print the flags |

Before the build the script prints which profile it uses, with the same rule as `content/resolve.ts`: `content/profile.json (personal)` when the file exists, else `content/profile.example.json (example)`. A production publish of the **sample** profile asks first: `You are about to publish the sample profile. Continue? [y/N]`. With `--yes` it prints a warning and goes on. `--preview` does not ask.

A broken `.tilebox/publish.json` (bad JSON, no `provider`, `name` or `url`, no `accountId` for Cloudflare, no `siteId` for Netlify) stops the run with exit 1. Fix the file or run `npm run publish -- --reset`.

Exit codes: 0 ok, 1 error, 2 wrong usage. Every command the script runs is printed before it runs (`$ wrangler ...`). The upload stops after 10 minutes, the checks after 30 seconds.

### What is stored, what is not

`.tilebox/publish.json` (ignored by git) holds only the provider, the site name, the account id or team slug, the Netlify site id, the live URL and two dates:

```json
{ "provider": "cloudflare", "name": "ricardo", "accountId": "…", "url": "https://ricardo.pages.dev", "createdAt": "…", "lastPublishedAt": "…" }
```

No token or API key is ever written there or anywhere in the repo. Login tokens live where the CLIs put them, in your home folder (`npx wrangler whoami` and `npx netlify status` show who is logged in; `npx wrangler logout` and `npx netlify logout` remove the login). `.wrangler/` and `.netlify/` are ignored by git.

The script runs the `wrangler` and `netlify-cli` versions installed in `node_modules` (both are dev dependencies), unless another one is first on your `PATH`. It prints which one it uses (`using ...`).

To reattach an existing project (for example after `--reset`), write `.tilebox/publish.json` by hand with the fields above (`siteId` and `accountSlug` for Netlify) and run `npm run publish`.

### Custom domain

Set it in the provider dashboard, then publish again with the new URL so link previews use it:

- Cloudflare: Workers & Pages > your project > **Custom domains**.
- Netlify: your site > **Domain management**.

```sh
npm run publish -- --site-url https://ricardov.dev
```

### Limits

`dist/` must have at most 20,000 files and no file bigger than 25 MiB. The script counts before it uploads. Check the free plan limits of the provider you pick; this page is well inside them.

### Cloudflare Pages settings (Git-connected build, optional)

You can also let Cloudflare build from GitHub instead of using `npm run publish`. If you do both, turn off automatic builds so only the local command deploys:
Cloudflare dashboard > Workers & Pages > your project > Settings > Builds & deployments > Branch control > turn off **Automatic production branch deployments**.

1. Push the repo to GitHub.
2. Cloudflare dashboard: **Workers & Pages > Create > Pages > Connect to Git**. Pick the repo.
3. Build settings: framework preset **None**. Build command `npm run generate`. Output directory `dist`.
4. Environment variable `NODE_VERSION` = `24`. Cloudflare also reads `.node-version` in the repo root, which says `24`. Cloudflare's default Node is too old for Nuxt 4.
5. Environment variable `NUXT_PUBLIC_SITE_URL` = your site URL, for example `https://ricardov.dev` (no trailing slash). It makes `og:image` and `og:url` absolute, which link previews need. Leave it unset and the page uses `/og.png`.
6. Save and deploy. Add a custom domain under **Custom domains** after the first build.

No Nitro preset is set. The build is plain static files. `/edit` and `/api` are not in `dist/`.

### Netlify settings (Git-connected build, optional)

Connect the repo. `netlify.toml` sets the build command, output folder, Node 24 and cache headers. Add `NUXT_PUBLIC_SITE_URL` in the site's environment variables, same as above. `npm run publish` does not need any of this: it uploads `dist/` directly with `--no-build`.

## Commit messages

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`.
The type is one of `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `perf`, `style`.
The subject is present tense, lower case, no period, max 72 characters in the header. A breaking change adds `!` after the type.

```sh
git commit -m "feat(editor): add a video tile picker"
git commit -m "fix(grid): keep the phone order after a drag"
git commit -m "docs: explain the deploy command"
git commit -m "feat(profile)!: rename the status field"
```

A local git hook checks every message with commitlint. `npm install` installs the hook (`prepare` runs `simple-git-hooks`).
A bad message is rejected before the commit is made. To install the hook by hand: `npx simple-git-hooks`.

Only `feat`, `fix`, `perf` and `refactor` commits appear in `CHANGELOG.md`. The others are hidden.

## Release

A release starts on your machine. No bot, no token.

```sh
npm run release
```

What it does, in order:

1. Preflight: you are on `main`, the tree is clean, `main` matches `origin/main`.
2. Checks: `npm run lint`, `npm run typecheck`, `npm run generate`, Playwright (`static` project).
3. Version: `commit-and-tag-version` reads the commits since the last tag and picks the next version (`fix` = patch, `feat` = minor, `!` = major).
4. Summary: a local AI CLI (`claude`, else `grok`) drafts 2 to 4 plain sentences for non-developers. You see it in the terminal and choose `[a]ccept`, `[e]dit` (opens `$EDITOR`), `[w]rite my own` or `[s]kip`. No AI CLI installed: you write it yourself.
5. Apply: bumps `package.json` and `package-lock.json`, updates `CHANGELOG.md`, writes `releases/vX.Y.Z.md`, commits `chore(release): vX.Y.Z` and makes the annotated tag `vX.Y.Z`.

6. Publish (optional): the script asks `Push main and the tag, and create the GitHub Release now? [y/N]`.

Until you say yes, nothing is pushed. The commit and the tag are local.

### Publish the release

Answer `y` (or pass `--push`) and the script runs these steps. It prints each command before it runs.

1. `git push --follow-tags origin main`. The tag push starts the pipeline.
2. Checks that the `gh` CLI is on `PATH` and logged in (`gh auth status`).
3. Release exists already: `gh release edit vX.Y.Z --title "tilebox vX.Y.Z" --notes-file releases/vX.Y.Z.md`. Else: `gh release create vX.Y.Z --title "tilebox vX.Y.Z" --notes-file releases/vX.Y.Z.md --verify-tag`, with `--prerelease` when the version has a `-`.
4. Prints the release URL.
5. Looks at the files of the release first: `gh release view vX.Y.Z --json assets`. Both `tilebox-vX.Y.Z.zip` and `tilebox-vX.Y.Z.sha256` are there and this command pushed no new tag: it prints `release is complete: ...` and the URL, and stops. No watch question.
6. This command pushed the tag: it asks `Watch the pipeline now? [y/N]`. With yes (or `--watch`) it finds the run of **this** command (`gh run list --workflow=release.yml --limit 10 --json ...`: made after the command started, from the tag push or from a manual `workflow_dispatch`; retry up to 45 s) and runs `gh run watch <id> --exit-status`. It never picks an older run. After the run it looks at the files again. It says "complete" only when both files are there. When the run fails, it prints `gh run view <id> --log-failed` and the re-run command, and exits 1.
7. The files are missing and no run is on its way (the tag was on GitHub already, so nothing new was pushed): it says so and asks `Start the pipeline for vX.Y.Z now? [y/N]`. With yes (or `--rerun`) it runs `gh workflow run release.yml -f tag=vX.Y.Z`, finds the new run and watches it when you asked for that. Without a terminal and without `--rerun` it prints that command as the next step and exits 0.

An older failed run does not change the result. When the release is complete, the script prints one line: `note: an older run for this tag failed (<id>); it is not the current state`.

Answer `n` (or pass `--no-push`) and the script prints the manual commands:

```sh
git show --stat HEAD
git push --follow-tags origin main
gh release create vX.Y.Z --title "tilebox vX.Y.Z" --notes-file releases/vX.Y.Z.md --verify-tag
```

Safe default: without a terminal, or with `--yes` and no `--push`, the script does not push.

**`gh` is optional.** Install it with `brew install gh`, then `gh auth login` one time. Without `gh` the script pushes, prints a hint and stops with exit code 0. The pipeline then makes the GitHub Release itself.

**The zip comes from the pipeline only.** The script never uploads a local build. Your local `dist/` is built from `content/profile.json` and your images, so it holds your personal data. The pipeline builds from the repo, which has the sample content only.

### Repair a release

The tag exists but there is no GitHub Release, or the pipeline failed? No version bump is needed.

```sh
npm run release:publish -- v0.1.0            # push + the gh steps for a tag that exists locally
npm run release:publish -- v0.1.0 --no-push  # the tag is on GitHub already: the gh steps only
npm run release:publish -- v0.1.0 --no-push --rerun --watch  # no zip on the release: start the pipeline again and wait for it
npm run release:publish -- v0.1.0 --dry-run  # print the commands, run none
gh workflow run release.yml -f tag=v0.1.0    # run the pipeline again for the tag (zip + checksum)
```

`release:publish` is `node scripts/release.mjs --publish-only <tag>`. It refuses a tag that does not exist locally. The manual pipeline run uses `release.yml` from `main` and the code from the tag, so a pipeline fix on `main` also repairs an old tag. The pipeline is safe to run again: it updates the release and replaces the two files.

### First release

The history before v0.1.0 is not in Conventional Commits, so the first release is tagged as it is. Its notes are already written in `releases/v0.1.0.md`.

```sh
npm run release -- --first-release --push
```

Every release after that is just `npm run release`.

### Flags

| Flag | Effect |
|---|---|
| `--dry-run` | Runs the checks, prints the release file it would write and the publish commands. Changes nothing, pushes nothing, calls no `gh` command |
| `--release-as 1.0.0` | Force the version |
| `--first-release` | No bump. Tags the current `package.json` version (used for v0.1.0) |
| `--summary "text"` | Use this summary, skip the AI draft |
| `--no-ai` | Never call an AI CLI |
| `--yes` | Accept the AI draft without asking. Does not push: add `--push` |
| `--push` | After the tag: push and make the GitHub Release. No question |
| `--no-push` | Never push, never ask. Print the manual commands. With `--publish-only`: skip the push, run the `gh` steps only |
| `--watch` | After the publish: wait for the pipeline run of this command with `gh run watch`. Never an older run. No effect when the release is complete already |
| `--rerun` | The release has no zip and no run is on its way: start the pipeline for the tag with `gh workflow run release.yml -f tag=vX.Y.Z`. No question |
| `--publish-only vX.Y.Z` | No version bump. The publish steps for a tag that exists locally. Same as `npm run release:publish -- vX.Y.Z` |
| `--skip-tests` | Skip Playwright |
| `--skip-checks` | Skip the branch and origin sync checks. The tree must still be clean |

The script stops before it changes anything when: the tag already exists, there are no commits since the last tag, or a personal file (`content/profile.json`, `public/avatar.*`, anything in `public/blocks/` except `sample.jpg`) is tracked by git.

### What the pipeline does

The pushed tag starts `.github/workflows/release.yml`. You can also start it by hand for an existing tag: `gh workflow run release.yml -f tag=vX.Y.Z` (or the "Run workflow" button on the Actions tab). It checks that the tag equals `package.json` version, runs lint, typecheck, generate and Playwright, zips `dist/` into `tilebox-vX.Y.Z.zip` with a `.sha256` file, and publishes a GitHub Release named `tilebox vX.Y.Z` with `releases/vX.Y.Z.md` as the body and the zip attached. When the local script made the release already, the pipeline updates it and adds the two files. It uses the built-in `GITHUB_TOKEN`. It does not deploy.

The zip lands on https://github.com/ricardov03/tilebox/releases under the tag. A tag with a `-` (for example `v1.0.0-beta.1`) is marked as a pre-release.

## Stack

| Part | Choice |
|---|---|
| Framework | Nuxt 4, static output (`nuxt generate`) |
| CSS | Tailwind CSS 4 through `@tailwindcss/vite` |
| Fonts | `@nuxt/fonts`. Google Fonts, downloaded at build, self-hosted. Only the chosen font preset is downloaded |
| Icons | `@nuxt/icon` with local Iconify packs (`line-md`, `simple-icons`). Bundled at build, no runtime API |
| Schema | zod (`types/profile.ts`), strict objects |
| Editor drag and drop | `vue-draggable-plus` |
| Release | `commit-and-tag-version`, `commitlint`, `simple-git-hooks` |
| Publish | `wrangler` and `netlify-cli`, run by `scripts/publish.mjs` |
| Tests | Playwright, `@axe-core/playwright` |

## Project layout

```
content/
  profile.example.json   the sample. Tracked
  profile.json           yours. Ignored by git
  resolve.ts             picks profile.json, else the example. Used by every entry point
  gravatar.ts            the Gravatar download, shared by fetch-avatar.ts and the editor route
  unfurl.ts              the link preview engine (SSRF-safe fetch, head parser, icons, images), shared by fetch-links.ts and the editor route
  unfurl-cache.ts        its paths, its cache file and the local files a build may use. Node built-ins only
  migrate.ts             adds the new profile keys to an older profile.json
  site-assets.ts         builds the favicon set, the manifest and the social image (sharp + satori)
  site-files.ts          names and paths of public/site/, which generated files exist
  site-extras.ts         writes the contact card (contact.vcf) and the QR code (qr.svg, uqr) into public/site/
  link-check.ts          the dead-link check, on the guarded request of unfurl.ts
  pexels.ts              the Pexels search and pick engine (dev only), on the guarded request of unfurl.ts
  README.md              the personal data rules
app/
  pages/index.vue        the public page (prerendered)
  pages/edit.vue         the editor. Development only
  components/            ProfileHeader, BentoGrid, ThemeToggle, ShareButton
  components/blocks/     the 9 tile types, Tile, BlockRenderer
  components/editor/     forms, pickers, theme panel, drag grid, TextField (the one text field), PexelsPicker, the second wave panels (BlockAdvanced, SiteExtras, ContactPanel, QrPanel, UtmPanel, SharePanel, LinkCheckButton)
  composables/           useProfile, useTheme, useSiteHead, useEditor, useFieldDraft, useSiteDraft, useLinkCheck
  utils/                 presets, networks, sizes, brand-icons (host -> icon), site-head (the pure head builder), schedule, utm, vcard (pure)
  assets/css/            main.css, presets.css (generated)
modules/public-profile.ts  writes the sanitized `#profile` copy the page imports (no hidden email, no hidden block)
server/api/              development-only routes: profile, save, upload, icon search, avatar/gravatar, unfurl, site/assets, site/upload, site/qr.png, links/check, images/pexels/{status,search,pick}
types/profile.ts         the zod schema, the types, the public shape and the sanitizer
types/site.ts            the `site` metadata schema
assets/fonts/            Geist Regular and SemiBold (TTF, SIL OFL 1.1) for the social image
scripts/
  release.mjs            npm run release
  publish.mjs            npm run publish
  build-presets.ts  check-contrast.ts  check-icons.ts  fetch-links.ts  fetch-avatar.ts
  validate-profile.ts  ensure-profile.ts  build-site-assets.ts  check-links.ts  serve-dist.mjs
releases/                one notes file per version, used as the GitHub Release body
tests/e2e/               public, a11y, repo, privacy, gravatar, links, unfurl, site, security, field-draft, second-wave, pexels, editor, editor-inputs, site-editor, security-dev, second-wave-editor, pexels-editor specs
public/                  og.png and favicon.ico (fallbacks), blocks/sample.jpg. Your images, site/ and site-uploads/ land here and are ignored
design/canvas/           the design boards (light and dark)
docs/review-tools.md     how code review runs here (npm run review), and when to use another tool
docs/invariants.md       the hard rules of the project on one page
scripts/review/          grok-review.sh, impact-map.py, the prompt, the schema, the findings ledger, the suite
.github/workflows/       ci.yml, release.yml
PLAN.md  NOTES.md        the plan with every decision, and the build log per work package
```

## Troubleshooting

| You see | Do this |
|---|---|
| A new color preset, font preset or icon does not show in dev | Restart `npm run dev`. `nuxt.config.ts` reads the profile once at start |
| My Gravatar does not show | The email has no Gravatar (`npm run fetch:avatar` says `avatar: no gravatar for this email`), or `profile.avatar` is set (an uploaded avatar wins; clear it in `/edit` or click **Use my Gravatar**), or the file is new: restart `npm run dev` |
| The browser tab still shows the old favicon | Browsers keep favicons for a long time. Open `/site/favicon.ico` directly and reload it, or use a private window. In dev, run `npm run build:site-assets` (or **Regenerate** in `/edit` > Site) first |
| A link preview on X, LinkedIn, WhatsApp or Slack shows the old image or text | Those sites keep their own copy. Ask for a new one with their tools: LinkedIn Post Inspector, Facebook Sharing Debugger, or share the link with `?v=2` at the end. The preview needs an absolute image URL: set the site URL (see [Site metadata](#site-metadata)) |
| `npm run build:site-assets` prints `site: ... not usable` | The upload or the avatar could not be read (missing file, not a picture, or a remote URL). The build used the next source. Upload it again in `/edit` > Site |
| `check:profile` warns about a placeholder email | Set your real email in `/edit` > Profile. It stays hidden unless you tick **Show my email on the page** |
| `git commit` is rejected with a commitlint error | Use `type(scope): subject`, lower case, max 72 characters. See [Commit messages](#commit-messages) |
| The hook does not run | `npx simple-git-hooks` |
| `npm run generate` says `(example)` but you expected your profile | `content/profile.json` is missing. Run `npm run dev` once or `npm run ensure:profile`, then edit |
| `npm run check:icons` fails | The icon name is not in an installed pack, or the pack marks it hidden. Pick one at https://icones.js.org or install `@iconify-json/<prefix>` |
| The Pexels tab says "Pexels needs a free key" | `.env` has no `PEXELS_API_KEY`, or the dev server started before you added it. Add the key, stop `npm run dev`, start it again, click **Check again** |
| "The Pexels key is wrong" | Pexels answered 401. Copy the key again from https://www.pexels.com/api/ (no quotes, no spaces), restart `npm run dev` |
| "Pexels rate limit reached, try again at ..." | 200 requests per hour on a free key. Wait until the time shown. Searches you did in the last 10 minutes still answer from memory |
| A Pexels photo is missing on another machine or on CI | `public/blocks/` is not in git. Copy the folder (see `content/README.md`), or pick the photo again: same ID, same file name |
| A link tile shows the plain link icon | The host is not in `app/utils/brand-icons.ts` and the link has no fetched icon. Turn on "Load info from the website", or pick an icon |
| The link preview says `http 403`, `timeout` or `not html` | The website refuses unknown clients or is not a web page (X profiles, Medium, sometimes LinkedIn). Type the title yourself. The brand icon still works |
| The link preview says `blocked address` or `blocked port` | The URL points at your own network (localhost, 192.168.x.x, a port other than 80 and 443). The engine never reads those |
| The website's image does not show | "Show the website's image" is off, the tile is 1x1, or the image was smaller than 200x200. Click Refresh in the link form |
| A new brand icon shows only after a restart | It should not: `nuxt dev` bundles the whole brand map. For your own `icon` names the old rule stays: restart `npm run dev` |
| `npm run publish` says the name is taken | Pick another name. `<name>.pages.dev` and `<name>.netlify.app` are shared by everyone |
| `npm run publish` stops with a broken state message | Fix `.tilebox/publish.json` or run `npm run publish -- --reset` |
| `npm run release` says `pull or push first` | `git pull` or `git push` so `main` equals `origin/main` |
| `npm run release` says a personal file is tracked | `git rm --cached <file>`, commit, run it again |
| The tag exists but there is no GitHub Release | The pipeline failed or `gh` was missing. Make the release: `npm run release:publish -- vX.Y.Z --no-push`. See why the pipeline failed: `gh run list --workflow=release.yml`, then `gh run view <id> --log-failed`. After the fix is on `main`, run it again: `gh workflow run release.yml -f tag=vX.Y.Z` |
| The tag exists and the GitHub Release exists, but it has no zip | The pipeline is still running (`gh run watch`) or it failed. Run `npm run release:publish -- vX.Y.Z --no-push --rerun --watch`: it checks the files of the release, starts the pipeline again (`gh workflow run release.yml -f tag=vX.Y.Z`) and waits for that new run. Without `--rerun` it asks first, or prints the command when there is no terminal. Do not upload a local zip: it holds your personal data |
| `release:publish` said `pipeline: FAILED` but the release has the zip | Fixed. Old versions watched the newest run of the tag, also an old failed one, and never looked at the release. Now the script checks the files first and prints `release is complete` |
| The editor says `Save is blocked` | A text field holds a value the check refused (empty but required, not a URL, not an email). The save bar lists it under **Not saved yet**. Fix it, or type the old value again. The file was not changed |
| Playwright says the browser is missing | `npx playwright install chromium` |

## More docs

- `PLAN.md`: the plan, the design tokens, every decision and the roadmap.
- `NOTES.md`: what each work package built, the deviations, the review findings and the test numbers.
- `content/README.md`: the personal data rules in detail.
- `docs/review-tools.md`: the review pipeline (`npm run review`), the blind-run guard, the cache, the findings ledger, and when to use OCR or an adversarial review agent instead.
- `docs/invariants.md`: the hard rules on one page. Every reviewer reads it first.
- `docs/security.md`: the threat model of the link preview engine, of the Pexels picker and of the dev routes.
- `releases/`: the notes of every version. `CHANGELOG.md` appears with the first release.

## Roadmap

- Personal photo uploads to Cloudflare R2.
- Left-rail layout preset.
- Import a Bento.me export zip.
- Open Graph image built from the profile at generate time.

Full plan and decisions: `PLAN.md`.

## License

MIT. See `LICENSE`.
