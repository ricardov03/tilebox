# Security: the link preview engine, the Pexels picker and the dev routes

State: WP10 security round + WP12 (Pexels picker), 2026-09-18. Code: `content/unfurl.ts`, `content/unfurl-cache.ts`, `server/utils/editor.ts`, `public/_headers`. Tests: `tests/e2e/unfurl.spec.ts`, `security.spec.ts`, `security-dev.spec.ts`.

## What runs where
- The PUBLIC site is static files. It has no server code, makes no request to another host, and never runs the engine.
- The engine runs on the OWNER's machine only: in `nuxt dev` behind `POST /api/unfurl` (the editor) and in `npm run fetch:links` (the build). A production build has no copy of it.

## What is fetched, and from where
- The URL of a link tile, chosen by the owner. From it: the page head (512 KB at most), a keyless oEmbed endpoint for 13 known sites, the web manifest, icon candidates, and the preview image when the owner asked for it.
- Last resort for an icon: Google's favicon service. It gets the link's hostname, at edit or build time, from the owner's machine.
- Video tiles: the YouTube thumbnail, through the same guarded request.

## The attacker
1. A website the owner links to. It controls every byte of its answers: redirects, headers, HTML, icons, images, how slow it is.
2. A web page open in the owner's browser while `nuxt dev` runs. It can send requests to `localhost`.
3. Something that edits `.tilebox/unfurl-cache.json` or drops files into `public/icons/`.

## Guard layers
1. **Where a request may go (SSRF).** `http`/`https`, ports 80 and 443. The host is resolved first; EVERY address must be public unicast. Refused: loopback, private, link-local (cloud metadata), CGNAT, unique-local, IPv4-mapped, `::/96` (`::127.0.0.1`), NAT64, reserved. The checked address is pinned for the connection (no DNS rebinding). Redirects are followed by hand and every hop is checked again.
2. **How much it may cost.** One link: 20 s in total, 8 requests, 8 redirects (5 per request), 8 s per hop, 3 s per DNS answer, a byte limit on every body while it is read. A failure is remembered for 10 minutes. A request the editor closed stops its job. One job per target host at a time. The cache holds 500 entries.
3. **What may be stored.** Never the remote bytes. Icons: sharp decodes and draws a PNG inside 128x128 (input limit 4096x4096 pixels, SVG input 100 KB, render density set from the SVG size); the file name is the hash of the OUTPUT. A remote SVG is never stored. Images: real type by magic bytes, 200x200 at least, the same input limit (4096x4096 pixels, `failOn: 'error'`), written again as WebP; the file name is the hash of the OUTPUT too. Text: control characters and bidi controls removed, length capped; it is rendered as text, never as HTML.
4. **What may be read back.** The cache is input: every entry is parsed with a strict zod schema, file paths with the same patterns as the profile contract (`/icons/<hash>.png`, `/thumbs/<hash>.webp`). A bad entry is dropped. The build's profile still passes `ProfileSchema`.
5. **What the host sends (`public/_headers`).** `/icons/*`, `/thumbs/*`, `/blocks/*`, `/site/*`, `/site-uploads/*`: `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` and `nosniff`. If a bad file ever lands there, opened directly it has no script, no network and no origin. `/*`: `nosniff`, `Referrer-Policy`. `nuxt dev` sends the same (`routeRules`).
6. **Housekeeping.** `fetch:links` deletes fetched files that no block and no fresh cache entry uses: plain files inside the two folders only, never through a symlink.

## The dev routes (`server/api/*`)
All are 404 outside `nuxt dev`. One gate, `assertEditorRequest()`: `Host` must be localhost / 127.0.0.1 / [::1] (DNS rebinding) -> 403; `Origin`, when present, must be this origin -> 403; `Sec-Fetch-Site: cross-site` or `same-site` -> 403; `Content-Type` must be `application/json` (uploads: `multipart/form-data`) -> 415. An HTML form on another website can never send JSON, so it cannot save a profile or start a fetch. Uploads: an SVG is drawn as a PNG and only the PNG is stored; a raster must decode as the format its name says.

## The link checker (WP11)
`npm run check:links`, the step before the upload in `npm run publish`, and the dev route `POST /api/links/check` (`content/link-check.ts`) ask every external http(s) URL of the profile. They use the SAME guarded request as the engine (`safeRequest()`), so guard layers 1 and 2 apply without change: public unicast addresses only, the pinned address, ports 80 and 443, every redirect hop checked, 8 s per hop, one budget of 20 s and 8 redirects per URL, the honest user agent. The only addition to the engine is the method: `HEAD` first, then one `GET` that reads 1 KB at most when the site answers 403, 405 or 501. 60 URLs at most, 4 at a time, one request per host at a time. Nothing is stored: no file, no cache entry, no change to the profile. A link to a private address is reported as `broken` (`blocked address`) without any connection. The route goes through `assertEditorRequest()` like every other dev route, and a closed editor request stops the job.

## Generated files of `public/site/` (WP11)
- `qr.svg` is an SVG, and it is safe: THIS project draws it (`uqr`) from one checked `https` URL string and two preset colors. No remote bytes, no user markup. A remote SVG is still never stored. The folder has the sandbox CSP of layer 5 on top.
- `contact.vcf` holds only the fields of the top-level `contact` object, which the owner marks as public, and the profile name. The private `profile.email` is never an input of the card builder (`app/utils/vcard.ts`). Text values are escaped, control and bidi characters are removed, no line break can start a new vCard property.
- The dev route `GET /api/site/qr.png` takes no input: it draws the local `qr.svg` again with sharp.

## The public page (WP11)
Still no runtime network call. The end-date script (under 400 bytes, inline) only reads `data-ends-at` attributes and sets `hidden`. The share button calls `navigator.share` or `navigator.clipboard` on a click. UTM tags are added at build time, from values limited to `[a-z0-9_-]`.

## The Pexels picker (WP12)
Code: `content/pexels.ts`, `server/api/images/pexels/*`, `app/components/editor/PexelsPicker.vue`. Tests: `tests/e2e/pexels.spec.ts`, `pexels-editor.spec.ts`.
- **Dev only.** The three routes are 404 outside `nuxt dev` and go through `assertEditorRequest()`. A build has no copy of the engine (`pexels.spec.ts` looks for `api.pexels.com` in the built files).
- **The key.** `PEXELS_API_KEY` in `.env` (ignored by git), read with `process.env` on the server, on every call. It is not in `runtimeConfig.public`. It is sent in ONE place: the `Authorization` header of the first hop to `api.pexels.com`. A redirect target never gets it, and a redirect to another host is refused. `GET /status` answers `{ configured }` only. No answer and no error text holds the key. A key with a space or a control character is refused before any request (no header injection). The canary test looks for the key value and for the name of the variable in `dist/`, `.nuxt/dist/client` and `.output/server`.
- **`POST /pick` is not an open proxy.** The body is `{ id, size }`, parsed with a strict schema: a number and one of two fixed names. A `url` key is a 400. The engine asks the Pexels API for that ID and takes the file URL from the API answer. That URL must be `https:` on `images.pexels.com`, else nothing is downloaded. The download goes through `safeRequest()` with the host allow-list (`onlyHosts`): EVERY hop must be https on `images.pexels.com`, and the address check, the pinned IP and the redirect limit still apply. So a caller can make this machine fetch only a Pexels photo, and a lying API answer cannot point it at another host or at a private address.
- **Cost.** Search: 8 s. Pick: 20 s for the API call and the download together, 15 MB while the body is read. One job per photo ID at a time. Identical searches are answered from memory for 10 minutes (100 entries).
- **What is stored.** Never the remote bytes. Magic bytes must say jpeg, png or webp; sharp decodes (input limit 8192x8192 pixels) and writes a new WebP, 1600 px on the long side, no metadata, to `public/blocks/pexels-<id>.webp` (temp file + rename). `/blocks/*` has the sandbox CSP of layer 5.
- **What the editor shows.** The route answers a small mapped shape, never the raw API answer. Thumbnail URLs must be https on `images.pexels.com`, credit links https on `pexels.com`, the color `#rrggbb`; text is cleaned like fetched link text. The grid loads thumbnails from `images.pexels.com` with `referrerpolicy="no-referrer"`. This happens in the dev editor only. The public page loads the local file and makes no foreign request.
- **The public page.** The credit links are rendered only for http(s) URLs, with `rel="noopener noreferrer"`.

## Not covered
- The owner's own files in `public/blocks/` are trusted (their images, their choice).
- The Pexels key is as safe as the owner's `.env` file. A process on the owner's machine that can read files can read it.
- A host that ignores `_headers` needs the same rules in its own format.
- The engine trusts sharp / libvips / librsvg to decode hostile images safely. Keep them up to date.
