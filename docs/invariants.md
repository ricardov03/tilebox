# Invariants: the hard rules of tilebox

One page. A change that breaks one of these is a defect, whatever its tests say. The reviewer prompt (`scripts/review/grok-review.prompt.md`) sends every reviewer here first. Details: `PLAN.md` section 0, `docs/security.md`, `content/README.md`.

## The public page
1. **Static.** `npm run generate` writes plain files to `dist/`. No server code, no `/edit`, no `/api` in `dist/`.
2. **No runtime network call.** The public page never asks another host for anything: no font, icon API, image URL, embed, analytics or third-party script. Fonts, icons, favicons and thumbnails are fetched at BUILD time and served as local files. `api.iconify.design` is not used by the editor's icon search or icon previews either: those read the installed packs from disk (rule 16).
3. **Color and font tokens only.** Components use the tokens of `app/assets/css/main.css` and the presets. No literal color, no literal font family. Every text pair keeps 4.5:1 (`npm run check:contrast`). The only red is the role pair `danger` / `danger-ink` (WP16), and only the editor uses it (the delete controls).

## Personal data
4. **Personal data and generated files are git-ignored and never tracked:** `content/profile.json`, `public/avatar.*`, `public/blocks/*` (but the sample), `public/icons/*`, `public/thumbs/*`, `public/site/`, `public/site-uploads/`, `.tilebox/`. The tracked sample is `content/profile.example.json`. A release zip comes from the pipeline only, never from a local `dist/`.
5. **Only `toPublicProfile()` output reaches `dist/`.** The app imports `#profile`, the sanitized copy that `modules/public-profile.ts` writes. The raw profile is never imported by app code. A hidden email, a hidden block (and its id in both layouts), and a block outside its schedule window (when that feature exists) are absent from the html, the payload AND the js of `dist/`.

## The editor and its server routes
6. **Server routes are dev-only.** Every file in `server/api/` answers 404 outside `nuxt dev` first (`assertDev()`, or an `import.meta.dev` dynamic import that also keeps a node-only engine out of the build), then calls `assertEditorRequest(event, kind)` from `server/utils/editor.ts`: Host, Origin, `Sec-Fetch-Site`, content type. GET routes too: `/api/profile` holds the hidden email.
7. **The repo root comes from `ROOT` in `content/resolve.ts`.** Never from `import.meta.url`, `__dirname` or `process.cwd()` of a file that Nitro or Vite bundles: under `nuxt dev` that points into `.nuxt/`. One resolver serves `nuxt.config.ts`, `scripts/*.ts` (tsx), the server and the tests.
8. **The editor never loses or rewrites what the user typed.** A text input shows its local draft (`EditorTextField`), not the model. An unsaved draft value never changes or deletes a file that belongs to the SAVED profile. One stated exception: the generated previews in `public/site/` that the owner asks for with "Regenerate" or "Make the QR code" (favicons, social image, `qr.svg`) are drawn from the draft; a draft never deletes them, never writes `contact.vcf`, and every save and every build draws all of them again from the saved profile.
9. **Writes are atomic** (temp file in the same folder, then rename) and only to the personal files, never to the example.

## Bytes from somewhere else
10. **Never store remote bytes as they came.** Icons are decoded by sharp and drawn again as PNG; images are written again as WebP or JPEG; the Gravatar avatar is written again as WebP (`content/gravatar-fetch.ts`); the file name is the hash of the OUTPUT, or a fixed name. Names and paths never come from remote data.
11. **Never store a remote or uploaded SVG.** An SVG is drawn as a PNG and only the PNG is kept. `public/_headers` sandboxes the asset folders as the second layer.
12. **Every outbound request goes through the guarded request in `content/unfurl.ts`** (public unicast addresses only, pinned address, every redirect hop checked, byte limit while reading, one 20 s budget). No raw `fetch` of a URL that came from a profile, a web page or a cache file.
13. **Files on disk are input too.** `.tilebox/unfurl-cache.json` and the profile are parsed with strict zod schemas on every read; local paths use the ONE pattern pair of `types/local-paths.ts`.

## Contracts
14. **Zod schemas are `.strict()` and old profiles stay valid.** A new field is optional or has a default; `content/migrate.ts`, `content/profile.example.json`, `PLAN.md` section 6 and the README change in the same branch. One rule, one definition: a rule that exists in a script AND in the editor is a bug waiting.
15. **TypeScript strict. No `any`. No `console.log` left behind** (scripts that print their result are the exception).
16. **Icons come from the two installed sets only, and the editor's icon search is local.** `ICON_SETS` in `app/utils/icon-sets.ts` (`line-md`, `simple-icons`) is the ONE source: the schema pattern (`ICON_NAME_RE`), the save check, `scripts/check-icons.ts`, the bundle list in `nuxt.config.ts` and the profile migration all read it. `package.json` lists exactly those two `@iconify-json/*` packs. A name of another set, an icon that does not exist in its pack, and an icon the pack marks `hidden: true` (a removed brand) are all refused, with one message that names the two sets. `/api/icons/search` and `/api/icons/svg` answer from `node_modules/@iconify-json/<set>/icons.json` through `content/icon-index.ts`, resolved with `ROOT`: no `api.iconify.design`, no network, so the editor works offline and a search text never leaves the machine.

## Process
17. **A change to `content/resolve.ts` or to `server/` runs the Playwright `dev` project**, not only `static`: `npx playwright test --project=dev`. The `static` project cannot see a broken dev server.
18. **Every branch ends green:** `npm run lint`, `npm run typecheck`, `npm run generate`, `npm run test:review`, the Playwright projects it touches. Output goes to `NOTES.md`.
19. **Review before a merge:** `npm run review -- --range main..<branch> --files <block>` per block (`docs/review-tools.md`). The model that writes the code is never the model that reviews it. A blind run (exit 3) is not a pass.
20. **Conventional Commits** (`type(scope): subject`, lower case, present tense, 72 chars at most; commitlint rejects the rest). **No attribution or co-author lines** in commits, code or docs.
