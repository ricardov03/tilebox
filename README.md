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
| `npm run release` | Local release: checks, version bump, changelog, release notes, commit and tag (see Release) |
| `npm run publish` | Build and upload the page to Cloudflare Pages or Netlify from your machine (see Publish). `npm run site:publish` is the same command |
| `npm run deploy` | Alias of `npm run publish -- --provider cloudflare` |
| `npm run deploy:preview` | Alias of `npm run publish -- --provider cloudflare --preview` |

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
| `--site-url https://...` | `NUXT_PUBLIC_SITE_URL` for this build only. Use it after you set a custom domain. `NUXT_PUBLIC_SITE_URL` in your shell works too. Default: the saved live URL |
| `--no-build` | Skip `npm run generate`, upload `dist/` as it is |
| `--yes` | Never ask. Fails when an answer is needed (no login, name taken, more than one account) |
| `--reset` | Forget `.tilebox/publish.json` and set up again. The project on the provider stays; delete it in the dashboard if you do not need it |
| `--help` | Print the flags |

Exit codes: 0 ok, 1 error, 2 wrong usage. Every command the script runs is printed before it runs (`$ wrangler ...`). The upload stops after 10 minutes, the checks after 30 seconds.

### What is stored, what is not

`.tilebox/publish.json` (ignored by git) holds only the provider, the site name, the account id or team slug, the Netlify site id, the live URL and two dates:

```json
{ "provider": "cloudflare", "name": "ricardo", "accountId": "…", "url": "https://ricardo.pages.dev", "createdAt": "…", "lastPublishedAt": "…" }
```

No token or API key is ever written there or anywhere in the repo. Login tokens live where the CLIs put them, in your home folder (`npx wrangler whoami` and `npx netlify status` show who is logged in; `npx wrangler logout` and `npx netlify logout` remove the login). `.wrangler/` and `.netlify/` are ignored by git.

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

Nothing is pushed. Review, then publish:

```sh
git show --stat HEAD
git push --follow-tags origin main
```

| Flag | Effect |
|---|---|
| `--dry-run` | Runs everything, prints the release file it would write, changes nothing |
| `--release-as 1.0.0` | Force the version |
| `--first-release` | No bump. Tags the current `package.json` version (used for v0.1.0) |
| `--summary "text"` | Use this summary, skip the AI draft |
| `--no-ai` | Never call an AI CLI |
| `--yes` | Accept the AI draft without asking |
| `--skip-tests` | Skip Playwright |
| `--skip-checks` | Skip the branch and origin sync checks. The tree must still be clean |

The pushed tag starts `.github/workflows/release.yml`. It checks that the tag equals `package.json` version, runs lint, typecheck, generate and Playwright, zips `dist/` into `tilebox-vX.Y.Z.zip` with a `.sha256` file, and publishes a GitHub Release named `tilebox vX.Y.Z` with `releases/vX.Y.Z.md` as the body and the zip attached. It uses the built-in `GITHUB_TOKEN`. It does not deploy.

The zip lands on https://github.com/ricardov03/tilebox/releases under the tag. A tag with a `-` (for example `v1.0.0-beta.1`) is marked as a pre-release.

## Roadmap

- Pexels photo picker in the editor, with attribution on the tile.
- Personal photo uploads to Cloudflare R2.
- Left-rail layout preset.
- Import a Bento.me export zip.
- Open Graph image built from the profile at generate time.

Full plan and decisions: `PLAN.md`.

## License

MIT. See `LICENSE`.
