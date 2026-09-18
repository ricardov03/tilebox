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

- Profile block: avatar, name, handle, bio, status line.
- Seven tile types: link, social, image, text, section, map, video.
- Four tile sizes on a 4-column grid. Separate tile order for desktop and phone.
- Presets like PowerPoint: 3 color presets and 3 font presets. Light, dark and system mode.
- Local editor at `/edit`: drag tiles, edit text, pick icons, save. Never shipped to production.
- Static output. No backend, no database, no runtime network calls on the public page.
- Private by default: `content/profile.json` and your images are ignored by git. The repo ships a sample profile.
- One-command publish: `npm run publish` logs you in with the browser, checks that the site name is free, creates the project and uploads. Cloudflare Pages or Netlify.
- Local releases: `npm run release` picks the version from your commits, writes the changelog and the release notes, and tags. A pushed tag makes the GitHub Release with a ready-to-host zip.
- No API keys, tokens or bots anywhere in the repo or the pipeline.
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
public/icons/*           favicons fetched at build
public/thumbs/*          YouTube thumbnails fetched at build
.tilebox/
.netlify/
```

How a build picks the file (`content/resolve.ts`): `content/profile.json` when it exists, else the example.
`npm run check:profile` prints which one: `profile: content/profile.json (personal)` or `profile: content/profile.example.json (example)`.

- GitHub CI and the release zip have no `profile.json`. They build the **sample** site.
- Your real site leaves your Mac only with `npm run publish` or `npm run publish -- --preview` (`npm run deploy` and `npm run deploy:preview` are aliases).
- `npm run release` refuses to run when `content/profile.json` or a personal image is tracked.
- Back up `content/profile.json`, `public/blocks/` and `public/avatar.*` yourself. Reset to the sample: `rm content/profile.json && npm run ensure:profile`.

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

Images: put files in `public/blocks/` and reference them as `/blocks/sample.jpg` (a sample ships there). Avatar goes in `public/` as `avatar.<ext>`. Both are ignored by git (see "Your personal data").

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
| `npm run check:icons` | Fails on an unknown icon name |
| `npm run fetch:favicons` | Fetches favicons for link tiles into `public/icons/` and YouTube thumbnails into `public/thumbs/` |
| `npm run test:e2e` | Playwright end-to-end tests (see Tests) |
| `npm run release` | Local release: checks, version bump, changelog, release notes, commit and tag. Then offers to push and make the GitHub Release (see Release) |
| `npm run release:publish -- vX.Y.Z` | Push and make the GitHub Release for a tag that exists. No version bump (see Repair a release) |
| `npm run publish` | Build and upload the page to Cloudflare Pages or Netlify from your machine (see Publish). `npm run site:publish` is the same command |
| `npm run deploy` | Alias of `npm run publish -- --provider cloudflare` |
| `npm run deploy:preview` | Alias of `npm run publish -- --provider cloudflare --preview` |

`predev` runs ensure:profile, presets and check:profile. `pregenerate` runs presets, check:profile, check:contrast, check:icons and fetch:favicons. It never creates `profile.json`: a build without it is the sample site.

## Tests

End-to-end tests run in headless Chromium with Playwright. Two projects:

| Project | What it tests | Server | Runs in CI |
|---|---|---|---|
| `static` | The prerendered page in `dist/`: one h1, 4 and 2 columns, phone order, theme toggle, no light flash, no Iconify calls, click-to-load video, axe (0 violations of any level at 1280 and 390, light and dark), `/edit` and `/api` answer 404, no request leaves the static origin. Plus `repo.spec.ts`: no personal file is tracked by git | `node scripts/serve-dist.mjs` on :4173 | yes |
| `dev` | The editor: add and edit a block, mobile order, keyboard reorder, Cmd/Ctrl+S, validation errors, image upload. Writes `content/profile.json` (backed up and restored) and `public/blocks/` | `npm run dev -- --port 3111` | no, local only |

```sh
npx playwright install chromium   # once
npm run generate                  # the static project reads dist/
npm run test:e2e                  # both projects
npm run test:e2e -- --project=static
npm run test:e2e -- --project=dev
```

Lighthouse (mobile) against the static server: `node scripts/serve-dist.mjs` then `npx --yes lighthouse http://localhost:4173/ --chrome-flags="--headless=new"`. Scores are recorded in `NOTES.md` (WP5).

## CI

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request:

1. `build` job: `npm ci`, lint, typecheck, `npm run generate`, then checks that `dist/index.html` exists and that neither `dist/edit` nor `dist/edit.html` exists. Uploads `dist` as an artifact for 7 days.
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
5. Says that the pipeline adds `tilebox-vX.Y.Z.zip` and the checksum in a few minutes, and asks `Watch the pipeline now? [y/N]`. With yes (or `--watch`) it runs `gh run watch <id> --exit-status`. When the pipeline fails, it prints the next step: `gh run view <id> --log-failed`.

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
| `--watch` | After the publish: wait for the release pipeline with `gh run watch` |
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
  README.md              the personal data rules
app/
  pages/index.vue        the public page (prerendered)
  pages/edit.vue         the editor. Development only
  components/            ProfileHeader, BentoGrid, ThemeToggle
  components/blocks/     the 7 tile types, Tile, BlockRenderer
  components/editor/     forms, pickers, theme panel, drag grid
  composables/           useProfile, useTheme, useEditor
  utils/                 presets, networks, sizes
  assets/css/            main.css, presets.css (generated)
server/api/              development-only routes: profile, save, upload, icon search
types/profile.ts         the zod schema and the types
scripts/
  release.mjs            npm run release
  publish.mjs            npm run publish
  build-presets.ts  check-contrast.ts  check-icons.ts  fetch-favicons.ts
  validate-profile.ts  ensure-profile.ts  serve-dist.mjs
releases/                one notes file per version, used as the GitHub Release body
tests/e2e/               public, a11y, repo, editor specs
public/                  og.png, blocks/sample.jpg. Your images land here and are ignored
design/canvas/           the design boards (light and dark)
docs/review-tools.md     notes on the two code review tools used on this project
.github/workflows/       ci.yml, release.yml
PLAN.md  NOTES.md        the plan with every decision, and the build log per work package
```

## Troubleshooting

| You see | Do this |
|---|---|
| A new color preset, font preset or icon does not show in dev | Restart `npm run dev`. `nuxt.config.ts` reads the profile once at start |
| `git commit` is rejected with a commitlint error | Use `type(scope): subject`, lower case, max 72 characters. See [Commit messages](#commit-messages) |
| The hook does not run | `npx simple-git-hooks` |
| `npm run generate` says `(example)` but you expected your profile | `content/profile.json` is missing. Run `npm run dev` once or `npm run ensure:profile`, then edit |
| `npm run check:icons` fails | The icon name is not in an installed pack. Pick one at https://icones.js.org or install `@iconify-json/<prefix>` |
| `npm run publish` says the name is taken | Pick another name. `<name>.pages.dev` and `<name>.netlify.app` are shared by everyone |
| `npm run publish` stops with a broken state message | Fix `.tilebox/publish.json` or run `npm run publish -- --reset` |
| `npm run release` says `pull or push first` | `git pull` or `git push` so `main` equals `origin/main` |
| `npm run release` says a personal file is tracked | `git rm --cached <file>`, commit, run it again |
| The tag exists but there is no GitHub Release | The pipeline failed or `gh` was missing. Make the release: `npm run release:publish -- vX.Y.Z --no-push`. See why the pipeline failed: `gh run list --workflow=release.yml`, then `gh run view <id> --log-failed`. After the fix is on `main`, run it again: `gh workflow run release.yml -f tag=vX.Y.Z` |
| The GitHub Release has no zip | The pipeline is still running (`gh run watch`) or it failed. Same steps as the row above. Do not upload a local zip: it holds your personal data |
| Playwright says the browser is missing | `npx playwright install chromium` |

## More docs

- `PLAN.md`: the plan, the design tokens, every decision and the roadmap.
- `NOTES.md`: what each work package built, the deviations, the review findings and the test numbers.
- `content/README.md`: the personal data rules in detail.
- `docs/review-tools.md`: a comparison of the two code review tools used during the build.
- `releases/`: the notes of every version. `CHANGELOG.md` appears with the first release.

## Roadmap

- Pexels photo picker in the editor, with attribution on the tile.
- Personal photo uploads to Cloudflare R2.
- Left-rail layout preset.
- Import a Bento.me export zip.
- Open Graph image built from the profile at generate time.

Full plan and decisions: `PLAN.md`.

## License

MIT. See `LICENSE`.
