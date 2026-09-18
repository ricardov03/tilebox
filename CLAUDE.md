# tilebox

Bento-style personal portfolio. Nuxt 4, static output, local editor, hosted on Cloudflare Pages.

## Start here, every session
1. Read `PLAN.md` fully. It is the source of truth. Every decision is in section 11.
2. Status line at the top of `PLAN.md` says the next step.
3. Design canvas (live, in the design tool): https://claude.ai/artifact/NxtZpWcB2B3JEwwL3kahzZ
   A local copy of its boards is in `design/canvas/` (board A = light, board B = dark; both CONDOMERA blue + Geist).
4. GitHub repo: `github.com/ricardov03/tilebox`. Ricardo created it empty. WP0 does `git init` + first push.

## How Ricardo wants to work
- Plan file is enforced. Agents follow `PLAN.md` section 0 rules and own only their WP files.
- WP1 to WP4 run as parallel agents. The architect merges and runs reviews.
- Code review by **Grok** after every WP. Ricardo will provide the Grok tools. Not provided yet.
- Ask questions that improve quality. Max 2 options per decision. Say which one you would pick.
- Reply style: ELI5 output style, Simplified Technical English. Short sentences. Exact paths and commands.

## Key decisions (short form, details in PLAN.md)
- Stack: Nuxt 4.5 + Tailwind 4 via `@tailwindcss/vite` (not the nuxt tailwind module) + `@nuxt/fonts` + `@nuxt/icon`.
- Drag and drop in the editor: `vue-draggable-plus`. Fallback gridstack.
- Presets like PowerPoint: 3 color presets (`condomera` default, `lunchbox`, `night`), 3 font presets (`geist` default, `lunchbox`, `night`).
- Icons: Iconify, default set `line-md`, brand fallback `simple-icons`. Picker links to icones.js.org.
- Images: v1 local files. Later Pexels picker (decided over Unsplash). Later R2 uploads.
- Deploy: Cloudflare Pages, build `npm run generate`, output `dist`, `NODE_VERSION=24`.
- Commit messages: Conventional Commits (`type(scope): subject`, present tense, lower case, max 72 chars). A local commitlint hook rejects the rest. No attribution lines.
- Release: `npm run release` (local, makes the version commit and the tag), then it asks to publish: `git push --follow-tags origin main` + the GitHub Release with the `gh` CLI (`--push` no question, `--no-push` manual commands, `--watch` waits for the pipeline; `gh` is optional). The tag starts `.github/workflows/release.yml`, which adds the zip and the checksum. Never upload a local zip (personal data). Repair an existing tag: `npm run release:publish -- vX.Y.Z`. Re-run the pipeline: `gh workflow run release.yml -f tag=vX.Y.Z`.
- Publish: `npm run publish` (local, `scripts/publish.mjs`). First run: pick Cloudflare Pages or Netlify, browser login, site name, availability check, create, build, upload. Later runs: build + upload. State in `.tilebox/publish.json` (ignored). No tokens in the repo. `npm run deploy` = `publish -- --provider cloudflare`, `npm run deploy:preview` adds `--preview`. The pipeline never deploys.

## Still needed from Ricardo (not blocking WP0)
- Real links (GitHub, LinkedIn, X, email, CONDOMERA URL), city, avatar, one photo.
- The Grok review tools.
